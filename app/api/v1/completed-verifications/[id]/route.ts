import { NextRequest, NextResponse } from "next/server";
import { getVerification } from "@/lib/firestore";

/**
 * GET /v1/completed-verifications/:id
 * Fetch a single completed verification by verification_id.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const verification = await getVerification(id);
  if (!verification) {
    return NextResponse.json(
      { error: "Completed verification not found" },
      { status: 404 }
    );
  }
  return NextResponse.json(verification);
}
