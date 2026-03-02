import { NextRequest, NextResponse } from "next/server";
import { getVerification } from "@/lib/firestore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const verification = await getVerification(id);
  if (!verification) {
    return NextResponse.json({ error: "Verification not found" }, { status: 404 });
  }
  return NextResponse.json({
    verification_id: verification.verification_id,
    status: verification.status,
    trust_score: verification.trust_score,
    decision: verification.decision,
    checks: verification.check_results,
    expires_at: verification.expires_at,
    created_at: verification.created_at,
  });
}
