import { NextResponse } from "next/server";
import {
  createSession,
  hashPassword,
  normalizeUsername,
  setSessionCookie
} from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type SignupBody = {
  username?: string;
  password?: string;
};

const isValidUsername = (username: string) => /^[a-z0-9_-]{3,32}$/.test(username);
const isValidPassword = (password: string) => password.length >= 8 && password.length <= 128;

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  if (process.env.ALLOW_SIGNUP !== "true") {
    return NextResponse.json(
      { error: "Sign up is disabled. Set ALLOW_SIGNUP=true to enable it." },
      { status: 403 }
    );
  }

  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = normalizeUsername(body.username ?? "");
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidUsername(username)) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-32 characters and use lowercase letters, numbers, _ or -."
      },
      { status: 400 }
    );
  }

  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters." },
      { status: 400 }
    );
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();

  try {
    const insert = db
      .prepare(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)"
      )
      .run(username, passwordHash, createdAt);

    const userId = Number(insert.lastInsertRowid);
    const { token, expiresAt } = createSession(userId);
    const response = NextResponse.json({ username });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error: unknown) {
    const message =
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
        ? "Username already exists."
        : "Unable to create account.";

    return NextResponse.json({ error: message }, { status: 409 });
  }
}
