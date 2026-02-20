import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";
import {
  MAX_PLANS_PER_USER,
  PlanOperationError,
  createPlanForSession,
  listPlansForSession
} from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mapPlanErrorToStatus = (errorCode: PlanOperationError["code"]) => {
  if (errorCode === "PLAN_LIMIT_REACHED" || errorCode === "LAST_PLAN_DELETE_BLOCKED") {
    return 409;
  }

  if (errorCode === "PLAN_NOT_FOUND") {
    return 404;
  }

  return 400;
};

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = listPlansForSession(
    session.user.id,
    session.sessionId,
    session.activePlanId
  );

  return NextResponse.json({
    ...payload,
    maxPlans: MAX_PLANS_PER_USER
  });
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const payload = createPlanForSession(session.user.id, session.sessionId);

    return NextResponse.json({
      ...payload,
      maxPlans: MAX_PLANS_PER_USER
    });
  } catch (error) {
    if (error instanceof PlanOperationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: mapPlanErrorToStatus(error.code) }
      );
    }

    return NextResponse.json({ error: "Unable to create plan." }, { status: 500 });
  }
}
