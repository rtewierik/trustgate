import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getVerification } from "@/lib/firestore";
import { saveFeedback, type FeedbackType } from "@/lib/feedback";

const FeedbackSchema = z.object({
  verification_id: z.string().min(1),
  correct_decision: z.enum(["allow", "deny"]),
  correct_trust_score: z.number().min(0).max(100).optional(),
  feedback_type: z.enum(["false_positive", "false_negative", "correct"]),
  comment: z.string().max(500).optional(),
});

/**
 * POST /v1/verifications/feedback
 * Submit human feedback for a completed verification (Option A: prompt-injected corrections).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { verification_id, correct_decision, correct_trust_score, feedback_type, comment } = parsed.data;

    const verification = await getVerification(verification_id);
    if (!verification) {
      return NextResponse.json(
        { error: "Verification not found", code: "VERIFICATION_NOT_FOUND" },
        { status: 404 }
      );
    }
    if (verification.status === "pending") {
      return NextResponse.json(
        { error: "Verification not yet completed", code: "VERIFICATION_PENDING" },
        { status: 400 }
      );
    }

    const checks = verification.check_results ?? [];
    const checks_summary = checks
      .map((c) => `${c.name}: ${c.status}`)
      .join(", ") || "no checks";

    await saveFeedback({
      verification_id,
      correct_decision,
      correct_trust_score,
      feedback_type: feedback_type as FeedbackType,
      comment: comment?.trim() || undefined,
      checks_summary,
    });

    return NextResponse.json({ ok: true, message: "Feedback saved" });
  } catch (err) {
    console.error("[feedback] POST error:", err);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}
