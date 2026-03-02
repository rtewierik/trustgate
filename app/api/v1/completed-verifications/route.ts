import { NextRequest, NextResponse } from "next/server";
import { getVerification } from "@/lib/firestore";

/**
 * GET /v1/completed-verifications?state=<verification_id>
 * Returns the verification. Query param state = verification_id (OAuth state from initiate).
 */
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  if (!state) {
    return NextResponse.json(
      {
        error: "Missing state",
        code: "STATE_REQUIRED",
        message: "Provide state (verification_id from initiate) to fetch the verification. Or use GET /v1/completed-verifications/:id with the verification_id.",
      },
      { status: 400 }
    );
  }

  const verification = await getVerification(state);
  if (!verification) {
    return NextResponse.json(
      {
        error: "Verification not found",
        code: "VERIFICATION_NOT_FOUND",
        message: "The verification request ID is invalid or expired.",
      },
      { status: 404 }
    );
  }
  if (verification.status === "pending") {
    return NextResponse.json(
      {
        error: "Verification pending",
        code: "VERIFICATION_PENDING",
        message:
          "Complete the redirect flow to finish verification. Then query again with this state.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...verification,
    verified: verification.decision === "allow",
    ...(verification.error != null && { error_message: verification.error }),
  });
}
