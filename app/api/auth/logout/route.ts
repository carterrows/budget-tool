import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  getCurrentSessionToken,
  revokeSession
} from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const token = getCurrentSessionToken();
  if (token) {
    revokeSession(token);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
