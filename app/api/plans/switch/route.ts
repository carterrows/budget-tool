import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";
import {
  MAX_PLANS_PER_USER,
  PlanOperationError,
  listPlansForSession,
  switchActivePlanForSession
} from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SwitchPlanBody = {
  planId?: unknown;
};

const toPlanId = (input: unknown): number | null => {
  if (typeof input !== "number" || !Number.isInteger(input) || input <= 0) {
    return null;
  }

  return input;
};

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: SwitchPlanBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const planId = toPlanId(body.planId);
  if (!planId) {
    return NextResponse.json({ error: "A valid plan ID is required." }, { status: 400 });
  }

  try {
    const activePlan = switchActivePlanForSession(
      session.user.id,
      session.sessionId,
      planId
    );
    const listPayload = listPlansForSession(
      session.user.id,
      session.sessionId,
      activePlan.id
    );

    return NextResponse.json({
      ...listPayload,
      activePlan,
      maxPlans: MAX_PLANS_PER_USER
    });
  } catch (error) {
    if (error instanceof PlanOperationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "PLAN_NOT_FOUND" ? 404 : 400 }
      );
    }

    return NextResponse.json({ error: "Unable to switch plans." }, { status: 500 });
  }
}
