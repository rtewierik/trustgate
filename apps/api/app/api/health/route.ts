import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "trustgate-api",
    timestamp: new Date().toISOString(),
  });
}
