import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { hasValidOrigin } from "@/lib/csrf";
import { MAX_PLANS_PER_USER, PlanOperationError, deletePlanForSession } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toPlanId = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

export async function DELETE(
  request: Request,
  context: { params: Promise<{ planId: string }> }
) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { planId: rawPlanId } = await context.params;
  const planId = toPlanId(rawPlanId);
  if (!planId) {
    return NextResponse.json({ error: "Invalid plan ID." }, { status: 400 });
  }

  try {
    const payload = deletePlanForSession(session.user.id, session.sessionId, planId);
    return NextResponse.json({
      ...payload,
      maxPlans: MAX_PLANS_PER_USER
    });
  } catch (error) {
    if (error instanceof PlanOperationError) {
      const status =
        error.code === "PLAN_NOT_FOUND"
          ? 404
          : error.code === "LAST_PLAN_DELETE_BLOCKED"
            ? 409
            : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }

    return NextResponse.json({ error: "Unable to delete plan." }, { status: 500 });
  }
}
