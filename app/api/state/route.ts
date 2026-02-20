import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";
import { PlanOperationError, getActivePlanForSession, loadPlanState, savePlanState } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const activePlan = getActivePlanForSession(
      session.user.id,
      session.sessionId,
      session.activePlanId
    );
    const state = loadPlanState(activePlan.id);

    return NextResponse.json({
      state,
      activePlan
    });
  } catch (error) {
    if (error instanceof PlanOperationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to load plan state." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const activePlan = getActivePlanForSession(
      session.user.id,
      session.sessionId,
      session.activePlanId
    );
    const { state, updatedAt } = savePlanState(activePlan.id, payload);

    return NextResponse.json({ state, updatedAt, activePlan });
  } catch (error) {
    if (error instanceof PlanOperationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to save plan state." }, { status: 500 });
  }
}
