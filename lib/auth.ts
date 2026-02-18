import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "./db";

export const SESSION_COOKIE_NAME = "budget_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_CLEANUP_INTERVAL_MS = 1000 * 60 * 5;
const USE_SECURE_COOKIES = process.env.SECURE_COOKIES === "true";
const DEV_USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/;
const DEFAULT_DEV_USERNAME = "dev-user";
let lastSessionCleanupAt = 0;

export type AuthUser = {
  id: number;
  username: string;
};

type SessionRow = {
  user_id: number;
  username: string;
  expires_at: string;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const nowIso = () => new Date().toISOString();

const deleteExpiredSessions = () => {
  const now = Date.now();
  if (now - lastSessionCleanupAt < SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastSessionCleanupAt = now;
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
};

export const normalizeUsername = (input: string) => input.trim().toLowerCase();

export const isDevLoginEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED !== "false";

export const getDevLoginUsername = () => {
  const configured = normalizeUsername(process.env.DEV_LOGIN_USERNAME ?? DEFAULT_DEV_USERNAME);
  return DEV_USERNAME_PATTERN.test(configured) ? configured : DEFAULT_DEV_USERNAME;
};

export const hashPassword = async (password: string) => bcrypt.hash(password, 12);

export const verifyPassword = async (password: string, hash: string) =>
  bcrypt.compare(password, hash);

export const getOrCreateDevUser = async (): Promise<AuthUser> => {
  const db = getDb();
  const username = getDevLoginUsername();

  const existing = db
    .prepare("SELECT id, username FROM users WHERE username = ? LIMIT 1")
    .get(username) as AuthUser | undefined;

  if (existing) {
    return existing;
  }

  const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
  const createdAt = nowIso();

  try {
    const insert = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run(username, passwordHash, createdAt);

    return {
      id: Number(insert.lastInsertRowid),
      username
    };
  } catch {
    const user = db
      .prepare("SELECT id, username FROM users WHERE username = ? LIMIT 1")
      .get(username) as AuthUser | undefined;

    if (!user) {
      throw new Error("Unable to create development user.");
    }

    return user;
  }
};

export const createSession = (userId: number) => {
  deleteExpiredSessions();

  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

  db.prepare(
    "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, tokenHash, expiresAt.toISOString(), createdAt.toISOString());

  return { token, expiresAt };
};

export const revokeSession = (token: string) => {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
};

export const getUserFromSessionToken = (token: string): AuthUser | null => {
  deleteExpiredSessions();

  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `
      SELECT sessions.user_id, users.username, sessions.expires_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
      LIMIT 1
      `
    )
    .get(tokenHash) as SessionRow | undefined;

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  return {
    id: row.user_id,
    username: row.username
  };
};

export const getCurrentUser = async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return getUserFromSessionToken(token);
};

export const getCurrentSessionToken = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
};

export const setSessionCookie = (response: NextResponse, token: string, expiresAt: Date) => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: USE_SECURE_COOKIES,
    path: "/",
    expires: expiresAt
  });
};

export const clearSessionCookie = (response: NextResponse) => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: USE_SECURE_COOKIES,
    path: "/",
    expires: new Date(0)
  });
};
