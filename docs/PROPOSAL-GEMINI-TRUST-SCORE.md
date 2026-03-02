# Proposal: Gemini-Based Trust Score and Human-in-the-Loop Feedback

This document proposes replacing the current rule-based trust score with a **Gemini-driven** decision that returns a **structured JSON** response for consistent frontend rendering, with **weighted interpretation** of checks (e.g. KYC birthdate matters more than other fields) and an **extensible feedback loop** so human corrections can improve future decisions.

---

## 1. Current State

- **Calculation:** `lib/trust-score.ts` — fixed weights: number_verification 35, sim_swap 35, kyc_match 30 (or 15 if low). Decision: `allow` if total ≥ `min_trust_score` (default 75).
- **Data:** Callback gets `NumberVerificationResult`, `SimSwapResult`, `KycMatchResult` (including `verified_claims` per field: `given_name`, `family_name`, `date_of_birth` → `true` | `false` | `not_available`). No distinction today between “birthdate wrong” vs “name wrong.”
- **Persistence:** `completeVerification()` writes `trust_score`, `decision`, `check_results` to Firestore; PII is removed after completion.
- **Frontend:** `VerificationResultCard` shows trust score, decision (Approved/Denied), and check list. Target UIs (from your screenshots) add a **trust dial**, **risk label** (LOW RISK / HIGH RISK), **network signals** with pass/fail/warn, and an **AI analysis** box.

---

## 2. Goal

1. **Replace** the numeric formula with a single Gemini call that receives all check outcomes (and KYC per-field results) and returns a **fixed JSON shape**.
2. **Encode policy in the prompt:** e.g. “Mistakes in birthdate (KYC) are critical; name mismatches are less severe; recent SIM swap is a strong fraud indicator.”
3. **Render the same JSON** everywhere: dial, risk level, signals, recommendation, and AI summary.
4. **Prepare for a feedback loop:** humans flag false positives/negatives; use that to improve future Gemini behavior (without relying on built-in “memory,” which Gemini does not have across sessions).

---

## 3. Gemini Structured Output (JSON Schema)

Gemini supports **constrained JSON output** via `response_mime_type: "application/json"` and `response_schema` (OpenAPI 3.0–style schema). This guarantees a stable shape for the frontend.

### 3.1 Proposed Response Schema

We define a single JSON object that the frontend can always consume:

```ts
// Types (Zod or TypeScript) — to be used for response_schema in GenerationConfig
interface TrustScoreResponse {
  /** 0–100 */
  trust_score: number;
  /** allow | deny */
  decision: "allow" | "deny";
  /** For UI: LOW RISK / REVIEW / HIGH RISK */
  risk_level: "low" | "medium" | "high";
  /** One-line summary for "Gemini AI Analysis" box */
  summary: string;
  /** Optional actionable recommendation (e.g. "REVIEW due to recent SIM swap and missing KYC data") */
  recommendation?: string;
  /** Per-check result with optional explanation; status can be pass | fail | warn */
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    /** Short explanation for this check (e.g. "No changes" / "Recycled number") */
    explanation?: string;
    /** Optional: how much this check affected the score (for transparency) */
    weight_impact?: "critical" | "high" | "medium" | "low" | "none";
  }>;
}
```

- **Backward compatibility:** Existing API and Firestore can keep `trust_score`, `decision`, `check_results`. We add optional fields: `risk_level`, `summary`, `recommendation`, and per-check `explanation` / `weight_impact` (stored in `check_results[].detail` or a new `gemini_response` blob).
- **Frontend:** One source of truth: either the legacy `trust_score` + `decision` + `check_results` or the full Gemini payload. The card/dial/signals UI can be driven entirely from this JSON.

---

## 4. Prompt Design (High-Level)

- **System prompt:** Define the role: “You are a trust score engine for telecom-based identity verification. You receive the outcomes of number verification, SIM swap, and KYC match (including per-field KYC results). Your job is to output a single JSON object that includes trust_score (0–100), decision (allow/deny), risk_level, summary, recommendation, and per-check details.”
- **Weighting rules in the prompt:**
  - KYC: `date_of_birth` mismatch or `not_available` when provided is **critical**; `given_name`/`family_name` mismatches are **high** but not necessarily fatal if other signals are strong.
  - SIM swap: Recent swap (e.g. within policy’s `sim_swap_max_age_hours`) is a **strong negative**; “no recent swap” is positive.
  - Number verification: Failure is **critical** (no device verification).
  - Number recycling / tenure: If we add these checks later, the prompt can state how they affect the score.
- **User prompt (per request):** JSON blob of inputs, e.g.:
  - `number_verification: { verified, detail? }`
  - `sim_swap: { swapped, last_swap_hours_ago?, detail? }`
  - `kyc_match: { match, match_level, verified_claims?: { given_name?, family_name?, date_of_birth? } }`
  - `policy: { min_trust_score, sim_swap_max_age_hours? }`
- **Output:** Only the structured object; no free-form prose outside the `summary` and `recommendation` fields (so the model’s answer is fully parseable and renderable).

We can add **few-shot examples** (one “allow” and one “deny” with realistic inputs and the exact JSON shape) to stabilise format and reasoning.

---

## 5. Where to Call Gemini

- **Placement:** In the **callback** (`app/api/v1/verifications/number-verification/callback/route.ts`), after we have `numVer`, `simSwapRes`, `kycRes`. Replace the current `computeTrustScore(...)` call with:
  1. Build the **input payload** (checks + policy + optional feedback — see below).
  2. Call a new **`computeTrustScoreWithGemini(input, options?)`** in e.g. `lib/trust-score-gemini.ts`.
  3. Parse and validate the response (Zod) against `TrustScoreResponse`; on parse failure, fall back to the existing rule-based `computeTrustScore` and log the error.
  4. Map Gemini’s `checks` to the existing `check_results` shape (name, status, detail) for storage and for clients that don’t yet use the new fields.
  5. Call `completeVerification()` with `trust_score`, `decision`, `check_results`, and optionally `risk_level`, `summary`, `recommendation`, and a stored `gemini_response` (or equivalent) for the new UI.

- **Configuration:** Use an env flag (e.g. `USE_GEMINI_TRUST_SCORE=true`) and `GEMINI_API_KEY` (or Vertex) so we can run with the legacy calculator in development or if Gemini is unavailable.

---

## 6. Frontend Consistency

- **API response:** `GET /v1/completed-verifications?state=...` already returns the verification document. We extend it with:
  - `risk_level`
  - `summary`
  - `recommendation`
  - `check_results[].detail.explanation` and optionally `weight_impact`
- **Components:** `VerificationResultCard` (and any new “dashboard” or “verification result” page) should:
  - Prefer `risk_level` for the label (LOW RISK / REVIEW / HIGH RISK) when present.
  - Show `summary` in the “Gemini AI Analysis” box and `recommendation` as the tag line when present.
  - Render checks from `check_results` with status (pass/fail/warn) and `explanation`; optionally use `weight_impact` for styling or ordering.

This keeps a **single contract:** the backend stores and returns the same JSON that Gemini produced (plus legacy fields), and the frontend renders it without re-interpreting rules.

---

## 7. Extensibility: Feedback Loop and “Memory”

**Gemini does not provide persistent memory between invocations.** Each API call is stateless. So we cannot “store corrections in Gemini.” We can, however, use our own storage and prompt design to mimic a feedback loop.

### 7.1 Option A — Prompt-injected feedback (recommended first step)

- **Storage:** New Firestore collection (e.g. `verification_feedback`) or a subcollection under `verifications`. Schema per document:
  - `verification_id`, `created_at`, `reviewer_id` (optional)
  - `correct_decision`: `"allow"` | `"deny"`
  - `correct_trust_score` (optional)
  - `feedback_type`: `"false_positive"` | `"false_negative"` | `"correct"` (for confirmation)
  - `comment` (optional): short explanation
  - **No PII:** store only verification_id and outcome, not phone/name/DoB.
- **Usage:** When calling Gemini, optionally append to the user prompt a “Recent corrections” section: e.g. last N feedback items (anonymised), e.g. “For cases like [summary of checks], the correct outcome was allow/deny because …”. This gives the model **few-shot style** guidance from real human corrections.
- **Implementation:** In `computeTrustScoreWithGemini`, if a flag like `INCLUDE_FEEDBACK_IN_PROMPT=true`, query the last K feedback documents (ordered by `created_at`), format them as neutral examples (no PII), and add them to the prompt. This is **extensible**: we can later filter by product, policy, or reviewer.

### 7.2 Option B — Context caching (cost/performance only)

- Use Gemini’s **context caching** to cache the system prompt and schema so repeated calls are cheaper and slightly faster. This does **not** add memory of past decisions; it only reuses the same prefix.

### 7.3 Option C — Fine-tuning or RLHF (long-term)

- Export a dataset of (input checks, human-correct outcome) from `verification_feedback` and use it for:
  - **Vertex AI tuning** (e.g. supervised fine-tuning), or
  - **Reinforcement from human feedback** (RLHF-style) if/when available for Gemini.
- This is a larger project; we can design the feedback schema and pipeline now so that data is ready later.

### 7.4 Recommendation

- **Implemented:** Phase 1 (Gemini trust score + structured JSON), Phase 2 (feedback collection + prompt injection), and demo correction UI. Env: `USE_GEMINI_TRUST_SCORE=true`, `GEMINI_API_KEY`, optional `GEMINI_INCLUDE_FEEDBACK_IN_PROMPT` (default true).
- **Phase 1 (done):** Gemini trust score with the structured JSON and prompt above.
- **Phase 2:** Add `verification_feedback` collection and a simple UI (e.g. “Was this correct?” / “False positive” / “False negative” + optional comment). Then implement **Option A** (inject last N feedbacks into the prompt) behind a feature flag.
- **Phase 3 (optional):** Analytics on feedback, export for tuning, or integrate with Vertex feedback pipelines (Option C).

---

## 8. Implementation Checklist (Phase 1)

- [ ] Add `@google/genai` (or Vertex SDK) and ensure `GEMINI_API_KEY` (or Vertex credentials) in env.
- [ ] Define `TrustScoreResponse` in Zod and derive a JSON schema for `response_schema` (e.g. with `zod-to-json-schema`).
- [ ] Implement `lib/trust-score-gemini.ts`: `computeTrustScoreWithGemini(rawInput, policy, options?)` that:
  - Builds system + user prompt (including weighting rules and input JSON).
  - Calls Gemini with `response_mime_type: "application/json"` and `response_schema`.
  - Parses and validates response; on failure falls back to `computeTrustScore` and logs.
  - Returns shape compatible with current callback (trust_score, decision, checks + optional new fields).
- [ ] In the callback: if `USE_GEMINI_TRUST_SCORE` and Gemini key present, use Gemini; else use existing `computeTrustScore`. Persist `risk_level`, `summary`, `recommendation` and per-check explanations (in `check_results[].detail` or a dedicated field).
- [ ] Extend Firestore `VerificationRecord` (or API response only) with optional `risk_level`, `summary`, `recommendation`; ensure `check_results[].detail` can hold `explanation` and `weight_impact` without breaking sanitization.
- [ ] Update `VerificationResultCard` (and any new UI) to show risk level, summary, recommendation, and check explanations when present; keep compatibility when they are absent.
- [ ] Document prompt location, schema, and env vars in README or ARCHITECTURE.

---

## 9. Summary

| Aspect | Proposal |
|--------|----------|
| **Trust score source** | Gemini, with fallback to current rule-based `computeTrustScore` |
| **Output format** | Structured JSON (trust_score, decision, risk_level, summary, recommendation, checks with status/explanation/weight_impact) |
| **KYC weighting** | Encoded in prompt: birthdate critical, name high but not always fatal |
| **Frontend** | Single contract: backend returns same JSON; UI renders dial, risk label, signals, AI box |
| **“Memory” / feedback** | No Gemini memory; use Firestore `verification_feedback` + inject last N corrections into prompt (Option A); optional later: tuning/RLHF (Option C) |

This gives you a clear path to a Gemini-driven, consistently renderable trust score and an extensible human-in-the-loop pipeline without depending on Gemini-native memory.

---

## 10. Security and PII

- **Do not send PII to Gemini.** The callback has `subject` (phone, country) and `claims` (name, DoB) only until we call `completeVerification` (which deletes them). When building the Gemini prompt, send only:
  - Check **outcomes**: e.g. `number_verification.verified`, `sim_swap.swapped`, `sim_swap.last_swap_hours_ago`, `kyc_match.match`, `kyc_match.match_level`, and `kyc_match.verified_claims` as `{ given_name: "true"|"false"|"not_available", ... }` — **not** the actual claim values (no names, no birthdates).
- Stored `summary` and `recommendation` from Gemini must be generic (e.g. “Recent SIM swap” not “SIM swap at 14:00 for +34…”). The existing sanitization for `check_results.detail` (e.g. only `last_swap_hours_ago`, `match_level`) should apply; any new `explanation` text should be checked to avoid leaking PII.
