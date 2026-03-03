/**
 * Gemini-based trust score: single LLM call returns structured JSON
 * (trust_score, decision, risk_level, summary, recommendation, checks).
 * Falls back to rule-based computeTrustScore on parse/API failure.
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { NumberVerificationResult, SimSwapResult, KycMatchResult } from "./nac";
import { computeTrustScore } from "./trust-score";
import type { CheckResult } from "./trust-score";
import { getRecentFeedback, type VerificationFeedbackRecord } from "./feedback";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USE_GEMINI = process.env.USE_GEMINI_TRUST_SCORE === "true";
const INCLUDE_FEEDBACK = process.env.GEMINI_INCLUDE_FEEDBACK_IN_PROMPT !== "false";
const RECENT_FEEDBACK_LIMIT = 5;
const USE_CONTEXT_CACHE = process.env.GEMINI_USE_CONTEXT_CACHE !== "false";
const CACHE_TTL_SECONDS = 3600; // 1 hour

/** Lazy-initialized context cache name (system prompt). Reused to reduce TTFT. */
let cachedContentName: string | null = null;
let cacheInitPromise: Promise<string | null> | null = null;

/** Input payload for Gemini (no PII: only outcomes and policy). */
export interface TrustScoreGeminiInput {
  number_verification: { verified: boolean; detail?: string };
  sim_swap: { swapped: boolean; last_swap_hours_ago?: number; detail?: string };
  kyc_match: {
    match: boolean;
    match_level?: string;
    verified_claims?: Record<string, "true" | "false" | "not_available">;
  };
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number };
}

/** Structured response from Gemini. Allow null for optional fields (model may return null). */
const TrustScoreCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["pass", "fail", "warn"]),
  explanation: z.string().nullable().optional(),
  weight_impact: z.enum(["critical", "high", "medium", "low", "none"]).nullable().optional(),
});

export const TrustScoreResponseSchema = z.object({
  trust_score: z.number().min(0).max(100),
  decision: z.enum(["allow", "deny"]),
  risk_level: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  recommendation: z.string().nullable().optional(),
  checks: z.array(TrustScoreCheckSchema),
});

export type TrustScoreResponse = z.infer<typeof TrustScoreResponseSchema>;

/** Result shape compatible with callback: legacy fields + optional Gemini extras. */
export interface TrustScoreResult {
  trust_score: number;
  decision: "allow" | "deny";
  checks: CheckResult[];
  risk_level?: "low" | "medium" | "high";
  summary?: string;
  recommendation?: string;
}

function buildInput(
  numVer: NumberVerificationResult,
  simSwap: SimSwapResult,
  kycMatch: KycMatchResult,
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number }
): TrustScoreGeminiInput {
  return {
    number_verification: {
      verified: numVer.verified,
      ...(numVer.detail && { detail: numVer.detail }),
    },
    sim_swap: {
      swapped: simSwap.swapped,
      ...(simSwap.last_swap_hours_ago !== undefined && { last_swap_hours_ago: simSwap.last_swap_hours_ago }),
      ...(simSwap.detail && { detail: simSwap.detail }),
    },
    kyc_match: {
      match: kycMatch.match,
      match_level: kycMatch.match_level,
      verified_claims: kycMatch.verified_claims,
    },
    policy: {
      min_trust_score: policy.min_trust_score,
      sim_swap_max_age_hours: policy.sim_swap_max_age_hours,
    },
  };
}

const SYSTEM_PROMPT = `You are a trust-score engine for telecom identity verification. Output exactly one JSON object. No markdown, no code fence, no text before or after the JSON.

## Output format
Reply with only the raw JSON object. Use exactly these top-level keys: trust_score, decision, risk_level, summary, recommendation, checks. Each check must have: name, status, explanation (or null), weight_impact (or null).

Schema:
{"trust_score":0-100,"decision":"allow"|"deny","risk_level":"low"|"medium"|"high","summary":"one short sentence","recommendation":"one short sentence or null","checks":[{"name":"string","status":"pass"|"fail"|"warn","explanation":"string|null","weight_impact":"critical"|"high"|"medium"|"low"|"none"|null}]}

## Check rules (deterministic)

1. number_verification
   - If verified is false: status must be "fail", weight_impact "critical", decision must be "deny". trust_score should be low (e.g. 0–30). Put input.detail into explanation if present.
   - If verified is true: status "pass", weight_impact "none", explanation null.

2. sim_swap
   - If swapped is true and last_swap_hours_ago is within policy.sim_swap_max_age_hours: status "fail", weight_impact "critical" or "high", strong negative on trust_score. Use input.detail in explanation if present.
   - If swapped is true but last_swap_hours_ago is beyond sim_swap_max_age_hours: status "warn" or "pass", weight_impact "medium" or "low", moderate impact.
   - If swapped is false: status "pass", weight_impact "none", explanation null.

3. kyc_match
   - If match is false: inspect verified_claims. Any birthdate/date_of_birth "false" or "not_available" → critical fail, decision deny. Name-only mismatches → high weight, not always deny. Put match_level or claim details into explanation.
   - If match is true: status "pass", weight_impact "none", explanation null.
   - If no claims were sent (verified_claims missing or empty): treat as neutral; status "pass" or "warn", weight_impact "low" or "none".

## Score and decision
- trust_score: 0–100. Start from 100 and subtract for failures/warnings. Critical fail → large drop (e.g. to 0–30); high → medium drop; medium/low → smaller drop.
- decision: "allow" only when trust_score >= policy.min_trust_score AND there is no critical failure that mandates deny (e.g. number_verification failed, or KYC birthdate fail). Otherwise "deny".
- risk_level: "low" when all pass or only minor warnings; "medium" when SIM swap warning or KYC name issues; "high" when any critical fail or multiple serious issues.

## Summary and recommendation
- summary: One short sentence describing the outcome (e.g. "Number verified; no recent SIM swap; KYC matched." or "Denied: number verification failed."). No markdown.
- recommendation: One short sentence suggesting next step, or null if allow and no follow-up needed. Use for REVIEW or retry guidance when deny or warn (e.g. "Retry after resolving number verification."). Null when decision is allow and risk is low.

## Failures and explanations
When a check fails and the input includes a "detail" or error message for that check (e.g. number_verification.detail, sim_swap.detail), put that exact message or a short user-friendly version into that check's "explanation" so the user sees why it failed. Do not invent explanations; use input data or a brief generic phrase.

## Example (output shape only; adapt to actual input)
For a typical allow case with all checks passing:
{"trust_score":85,"decision":"allow","risk_level":"low","summary":"Number verified; no recent SIM swap; KYC matched.","recommendation":null,"checks":[{"name":"number_verification","status":"pass","explanation":null,"weight_impact":"none"},{"name":"sim_swap","status":"pass","explanation":null,"weight_impact":"none"},{"name":"kyc_match","status":"pass","explanation":null,"weight_impact":"none"}]}

For a deny due to number verification failure:
{"trust_score":0,"decision":"deny","risk_level":"high","summary":"Denied: number verification failed.","recommendation":"Retry after completing number verification.","checks":[{"name":"number_verification","status":"fail","explanation":"Number verification failed.","weight_impact":"critical"},{"name":"sim_swap","status":"pass","explanation":null,"weight_impact":"none"},{"name":"kyc_match","status":"pass","explanation":null,"weight_impact":"none"}]}

## Do not
- Do not output markdown, code fences, or any text outside the single JSON object.
- Do not add extra keys or omit required keys.
- Do not use decision "allow" when trust_score < min_trust_score or when a critical check (number_verification fail, KYC birthdate fail) has failed.
- Do not leave summary or recommendation empty string; use null for recommendation when not needed.

## Past corrections (when provided in the user message)
You may receive "Corrections to align with" with past human feedback. Each correction can include verification_input: the NAC check outcomes (number_verification, sim_swap, kyc_match) for that past verification. Use this to decide whether the correction should influence the current verification: compare the current Input to each correction's verification_input; if the current verification is similar to a corrected one (same or very similar check outcomes), apply the corrected decision/trust_score as strong guidance. If the current verification differs (e.g. different failure reason), the correction may not apply.`;

/** Gemini context cache requires at least 1024 tokens. Expanded system prompt meets the minimum. */
function getCacheableSystemInstruction(): string {
  return SYSTEM_PROMPT;
}

function buildUserPrompt(input: TrustScoreGeminiInput, recentFeedbackJson: string): string {
  let text = `Current verification input:\n${JSON.stringify(input)}`;
  if (recentFeedbackJson) {
    text += `\n\nPast corrections (use verification_input when present to infer if each correction should apply to this verification):\n${recentFeedbackJson}`;
  }
  return text;
}

/** Create or reuse a context cache for the system prompt. Returns cache resource name or null on failure. */
async function getOrCreateContextCache(ai: InstanceType<typeof GoogleGenAI>): Promise<string | null> {
  if (cachedContentName) return cachedContentName;
  if (cacheInitPromise) return cacheInitPromise;
  cacheInitPromise = (async () => {
    try {
      const cacheableSystem = getCacheableSystemInstruction();
      const created = await ai.caches.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: { text: cacheableSystem },
          displayName: "trustgate-trust-score",
          ttl: `${CACHE_TTL_SECONDS}s`,
        },
      });
      const name = created.name ?? null;
      if (name) cachedContentName = name;
      return name;
    } catch (err) {
      console.warn("[trust-score-gemini] Context cache create failed, using uncached requests:", err);
      return null;
    } finally {
      cacheInitPromise = null;
    }
  })();
  return cacheInitPromise;
}

/** Extract JSON from model text (strip markdown code block if present). */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const codeBlock = /^```(?:json)?\s*([\s\S]*?)```\s*$/m.exec(trimmed);
  if (codeBlock) return codeBlock[1].trim();
  return trimmed;
}

function mapFallbackChecks(
  numVer: NumberVerificationResult,
  simSwap: SimSwapResult,
  kycMatch: KycMatchResult
): CheckResult[] {
  const r = computeTrustScore(numVer, simSwap, kycMatch, { min_trust_score: 75 });
  return r.checks;
}


/**
 * Compute trust score via Gemini. Returns legacy-compatible shape plus optional
 * risk_level, summary, recommendation. Falls back to rule-based on failure.
 */
export async function computeTrustScoreWithGemini(
  numberVerification: NumberVerificationResult,
  simSwap: SimSwapResult,
  kycMatch: KycMatchResult,
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number }
): Promise<TrustScoreResult> {
  if (!USE_GEMINI || !GEMINI_API_KEY) {
    const fallback = computeTrustScore(numberVerification, simSwap, kycMatch, policy);
    return { ...fallback };
  }

  const input = buildInput(numberVerification, simSwap, kycMatch, policy);
  let recentFeedbackJson = "";
  if (INCLUDE_FEEDBACK) {
    try {
      const feedback = await getRecentFeedback(RECENT_FEEDBACK_LIMIT);
      if (feedback.length > 0) {
        recentFeedbackJson = JSON.stringify(
          feedback.map((f: VerificationFeedbackRecord) => ({
            correct_decision: f.correct_decision,
            correct_trust_score: f.correct_trust_score,
            feedback_type: f.feedback_type,
            comment: f.comment,
            checks_summary: f.checks_summary,
            ...(f.verification_input && { verification_input: f.verification_input }),
          })),
          null,
          2
        );
      }
    } catch (e) {
      console.warn("[trust-score-gemini] getRecentFeedback failed:", e);
    }
  }

  let cacheName: string | null = null;
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const userPrompt = buildUserPrompt(input, recentFeedbackJson);
    const useCache = USE_CONTEXT_CACHE;
    cacheName = useCache ? await getOrCreateContextCache(ai) : null;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: cacheName
        ? [{ role: "user", parts: [{ text: userPrompt }] }]
        : [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }] }],
      config: {
        ...(cacheName && { cachedContent: cacheName }),
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      console.warn("[trust-score-gemini] Empty response, using fallback");
      const fallback = computeTrustScore(numberVerification, simSwap, kycMatch, policy);
      return { ...fallback };
    }

    const jsonStr = extractJson(rawText);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn(
        "[trust-score-gemini] JSON parse failed (truncated or malformed response), using fallback:",
        parseErr instanceof Error ? parseErr.message : parseErr
      );
      const fallback = computeTrustScore(numberVerification, simSwap, kycMatch, policy);
      return { ...fallback };
    }

    const validated = TrustScoreResponseSchema.safeParse(parsedJson);

    if (!validated.success) {
      console.warn("[trust-score-gemini] Schema validation failed:", validated.error.message, "Raw:", rawText.slice(0, 200));
      const fallback = computeTrustScore(numberVerification, simSwap, kycMatch, policy);
      return { ...fallback };
    }

    const r = validated.data;
    const checks: CheckResult[] = r.checks.map((c) => ({
      name: c.name,
      status: c.status as "pass" | "fail",
      detail: {
        ...(c.explanation && { explanation: c.explanation }),
        ...(c.weight_impact && { weight_impact: c.weight_impact }),
      },
    }));

    return {
      trust_score: r.trust_score,
      decision: r.decision,
      checks: checks.length > 0 ? checks : mapFallbackChecks(numberVerification, simSwap, kycMatch),
      risk_level: r.risk_level,
      summary: r.summary ?? undefined,
      recommendation: r.recommendation ?? undefined,
    };
  } catch (err) {
    if (cacheName) cachedContentName = null;
    console.warn("[trust-score-gemini] Gemini API error, using fallback:", err);
    const fallback = computeTrustScore(numberVerification, simSwap, kycMatch, policy);
    return { ...fallback };
  }
}