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

const SYSTEM_PROMPT = `You are a trust-score engine for telecom identity verification. Output exactly one JSON object—no markdown, no code fence, no text before or after.

Rules: (1) number_verification failure = critical. (2) SIM swap within sim_swap_max_age_hours = strong negative. (3) KYC: birthdate mismatch/not_available = critical; name mismatches = high but not always fatal; no claims sent = neutral. (4) decision = allow only if trust_score >= min_trust_score and risk acceptable. (5) risk_level: low | medium | high.

When a check fails and the input includes a "detail" or error message for that check (e.g. number_verification.detail, sim_swap.detail), put that exact message or a short user-friendly version of it into that check's "explanation" so the user sees why it failed.

Required JSON shape (use only these keys; keep summary and recommendation to one short sentence each):
{"trust_score":0-100,"decision":"allow"|"deny","risk_level":"low"|"medium"|"high","summary":"...","recommendation":"..."|null,"checks":[{"name":"...","status":"pass"|"fail"|"warn","explanation":"..."|null,"weight_impact":"critical"|"high"|"medium"|"low"|"none"|null}]}

Reply with only the raw JSON object.`;

function buildUserPrompt(input: TrustScoreGeminiInput, recentFeedbackJson: string): string {
  let text = `Input:\n${JSON.stringify(input)}`;
  if (recentFeedbackJson) {
    text += `\n\nCorrections to align with:\n${recentFeedbackJson}`;
  }
  return text;
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
          })),
          null,
          2
        );
      }
    } catch (e) {
      console.warn("[trust-score-gemini] getRecentFeedback failed:", e);
    }
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + buildUserPrompt(input, recentFeedbackJson) }] },
      ],
      config: {
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
    console.error("[trust-score-gemini] Error:", err);
    const fallback = computeTrustScore(numberVerification, simSwap, kycMatch, policy);
    return { ...fallback };
  }
}