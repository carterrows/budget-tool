import { NextResponse } from "next/server";
import {
  createSession,
  getOrCreateDevUser,
  isDevLoginEnabled,
  setSessionCookie
} from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isDevLoginEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const user = await getOrCreateDevUser();
  const { token, expiresAt } = createSession(user.id);

  const response = NextResponse.json({ username: user.username });
  setSessionCookie(response, token, expiresAt);
  return response;
}
