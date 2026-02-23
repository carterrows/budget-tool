import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { PlanOperationError, getPlanStateForUser } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toPlanId = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const resolvePlanId = async (paramsPromise: Promise<{ planId: string }>) => {
  const { planId: rawPlanId } = await paramsPromise;
  return toPlanId(rawPlanId);
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ planId: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const planId = await resolvePlanId(context.params);
  if (!planId) {
    return NextResponse.json({ error: "Invalid plan ID." }, { status: 400 });
  }

  try {
    const payload = getPlanStateForUser(session.user.id, planId);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof PlanOperationError) {
      const status = error.code === "PLAN_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }

    return NextResponse.json({ error: "Unable to load plan state." }, { status: 500 });
  }
}
