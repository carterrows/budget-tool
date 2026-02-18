import { NextResponse } from "next/server";
import {
  createSession,
  normalizeUsername,
  setSessionCookie,
  verifyPassword
} from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type LoginBody = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = normalizeUsername(body.username ?? "");
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const db = getDb();
  const user = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1")
    .get(username) as
    | {
        id: number;
        username: string;
        password_hash: string;
      }
    | undefined;

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const validPassword = await verifyPassword(password, user.password_hash);
  if (!validPassword) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const { token, expiresAt } = createSession(user.id);
  const response = NextResponse.json({ username: user.username });
  setSessionCookie(response, token, expiresAt);
  return response;
}
