import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_STATE, sanitizeBudgetState } from "@/lib/budget-state";
import { hasValidOrigin } from "@/lib/csrf";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT state_json FROM states WHERE user_id = ? LIMIT 1")
    .get(user.id) as { state_json: string } | undefined;

  if (!row) {
    return NextResponse.json({ state: DEFAULT_STATE });
  }

  try {
    const parsed = JSON.parse(row.state_json) as unknown;
    return NextResponse.json({ state: sanitizeBudgetState(parsed) });
  } catch {
    return NextResponse.json({ state: DEFAULT_STATE });
  }
}

export async function PUT(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const state = sanitizeBudgetState(payload);
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(
    `
    INSERT INTO states (user_id, state_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
    `
  ).run(user.id, JSON.stringify(state), now);

  return NextResponse.json({ state, updatedAt: now });
}
