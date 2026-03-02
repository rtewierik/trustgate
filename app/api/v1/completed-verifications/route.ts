import { NextRequest, NextResponse } from "next/server";
import { getVerification, getNumberVerificationRequest } from "@/lib/firestore";

/**
 * GET /v1/completed-verifications?state=<verification_request_id>
 * Returns the single completed verification for that request. Requires state.
 */
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  if (!state) {
    return NextResponse.json(
      {
        error: "Missing state",
        code: "STATE_REQUIRED",
        message: "Provide state (verification_request_id) to fetch the completed verification. Or use GET /v1/completed-verifications/:id with the verification_id.",
      },
      { status: 400 }
    );
  }

  const nvRequest = await getNumberVerificationRequest(state);
  if (!nvRequest) {
    return NextResponse.json(
      {
        error: "Verification request not found",
        code: "VERIFICATION_REQUEST_NOT_FOUND",
        message: "The verification request ID is invalid or expired.",
      },
      { status: 404 }
    );
  }
  if (nvRequest.status === "pending") {
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
  if (!nvRequest.verification_id) {
    return NextResponse.json(
      {
        error: "Verification not completed",
        code: "VERIFICATION_FAILED",
        message: "Verification did not produce a result.",
      },
      { status: 404 }
    );
  }
  const verification = await getVerification(nvRequest.verification_id);
  if (!verification) {
    return NextResponse.json(
      { error: "Completed verification not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ...verification,
    verified: nvRequest.verified,
  });
}
