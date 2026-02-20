"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PLANS_PER_USER } from "@/lib/plan-config";

type Plan = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type PlansPayload = {
  plans: Plan[];
  activePlanId: number;
  maxPlans?: number;
};

type PlansManagerProps = {
  username: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric"
});

const formatDate = (isoDate: string) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return dateFormatter.format(parsed);
};

export default function PlansManager({ username }: PlansManagerProps) {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [maxPlans, setMaxPlans] = useState(MAX_PLANS_PER_USER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const isAtPlanLimit = plans.length >= maxPlans;

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? null,
    [plans, activePlanId]
  );

  const applyPayload = (payload: PlansPayload) => {
    setPlans(payload.plans);
    setActivePlanId(payload.activePlanId);
    setMaxPlans(payload.maxPlans ?? MAX_PLANS_PER_USER);
  };

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/plans", {
        method: "GET",
        cache: "no-store"
      });

      if (response.status === 401) {
        router.push("/");
        router.refresh();
        return;
      }

      const payload = (await response.json()) as PlansPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load plans.");
      }

      applyPayload(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load plans.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const switchPlan = async (planId: number) => {
    setPendingAction(`switch-${planId}`);
    setError("");

    try {
      const response = await fetch("/api/plans/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ planId })
      });

      if (response.status === 401) {
        router.push("/");
        router.refresh();
        return;
      }

      const payload = (await response.json()) as PlansPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to switch plans.");
      }

      applyPayload(payload);
      router.push("/budget");
      router.refresh();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Unable to switch plans.");
    } finally {
      setPendingAction(null);
    }
  };

  const createPlan = async () => {
    setPendingAction("create");
    setError("");

    try {
      const response = await fetch("/api/plans", {
        method: "POST"
      });

      if (response.status === 401) {
        router.push("/");
        router.refresh();
        return;
      }

      const payload = (await response.json()) as PlansPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create plan.");
      }

      router.push("/budget");
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create plan.");
    } finally {
      setPendingAction(null);
    }
  };

  const deletePlan = async (planId: number) => {
    setPendingAction(`delete-${planId}`);
    setError("");

    try {
      const response = await fetch(`/api/plans/${planId}`, {
        method: "DELETE"
      });

      if (response.status === 401) {
        router.push("/");
        router.refresh();
        return;
      }

      const payload = (await response.json()) as PlansPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to delete plan.");
      }

      applyPayload(payload);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete plan.");
    } finally {
      setPendingAction(null);
    }
  };

  const startRename = (plan: Plan) => {
    if (pendingAction !== null) {
      return;
    }

    setEditingPlanId(plan.id);
    setRenameDraft(plan.name);
    setError("");
  };

  const cancelRename = () => {
    setEditingPlanId(null);
    setRenameDraft("");
  };

  const renamePlan = async (planId: number) => {
    setPendingAction(`rename-${planId}`);
    setError("");

    try {
      const response = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: renameDraft })
      });

      if (response.status === 401) {
        router.push("/");
        router.refresh();
        return;
      }

      const payload = (await response.json()) as PlansPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to rename plan.");
      }

      applyPayload(payload);
      cancelRename();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Unable to rename plan.");
    } finally {
      setPendingAction(null);
    }
  };

  if (loading) {
    return (
      <section className="card mx-auto max-w-4xl p-8">
        <p className="text-sm text-forest-700/80">Loading your plans...</p>
      </section>
    );
  }

  if (error && plans.length === 0) {
    return (
      <section className="mx-auto max-w-4xl rounded-2xl border border-rose-200 bg-white p-8 shadow-card">
        <p className="text-sm text-rose-700">{error}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="caps-label text-xs font-semibold uppercase text-forest-600">Budget Tool</p>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Plans</h1>
          <p className="text-sm text-forest-700/80">Signed in as {username}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/budget")}
            className="btn-secondary px-3 py-2 text-sm font-medium"
          >
            Back to Budget
          </button>
          <button
            type="button"
            disabled={isAtPlanLimit || pendingAction !== null}
            onClick={createPlan}
            className="btn-primary px-3 py-2 text-sm font-medium"
          >
            {pendingAction === "create" ? "Creating..." : "Create Plan"}
          </button>
        </div>
      </header>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Saved plans</h2>
          <p className="text-sm text-forest-700/80">
            {plans.length} of {maxPlans} plans used
          </p>
        </div>

        {isAtPlanLimit ? (
          <p className="mt-3 text-sm text-amber-700">
            Plan limit reached. Delete a plan before creating another.
          </p>
        ) : (
          <p className="mt-3 text-sm text-forest-700/80">
            Create up to {maxPlans} plans. New plans start with a fresh budget.
          </p>
        )}

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

        <ul className="mt-4 space-y-3">
          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            const isSwitching = pendingAction === `switch-${plan.id}`;
            const isDeleting = pendingAction === `delete-${plan.id}`;
            const isEditing = editingPlanId === plan.id;

            return (
              <li
                key={plan.id}
                className="rounded-xl border border-forest-200/90 bg-paper/60 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void renamePlan(plan.id);
                          }}
                        >
                          <input
                            type="text"
                            value={renameDraft}
                            maxLength={40}
                            autoFocus
                            disabled={pendingAction !== null}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            className="input h-8 w-44 py-1 text-sm"
                            aria-label={`Rename ${plan.name}`}
                          />
                          <button
                            type="submit"
                            disabled={pendingAction !== null}
                            aria-label={`Confirm rename for ${plan.name}`}
                            title="Confirm rename"
                            className="btn-primary flex h-8 w-8 items-center justify-center px-0 py-0"
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[20px]"
                            >
                              check
                            </span>
                          </button>
                        </form>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-forest-900">{plan.name}</h3>
                          <button
                            type="button"
                            aria-label={`Rename ${plan.name}`}
                            title="Rename plan"
                            disabled={pendingAction !== null}
                            onClick={() => startRename(plan)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-forest-600 hover:bg-forest-100 hover:text-forest-900 disabled:opacity-60"
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[16px]"
                            >
                              edit
                            </span>
                          </button>
                        </>
                      )}
                      {isActive ? (
                        <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-semibold text-forest-700">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-forest-700/80">
                      Updated {formatDate(plan.updatedAt)}
                    </p>
                    <p className="text-xs text-forest-700/70">
                      Created {formatDate(plan.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isActive || pendingAction !== null}
                      onClick={() => switchPlan(plan.id)}
                      className="btn-secondary px-3 py-2 text-sm font-medium"
                    >
                      {isSwitching ? "Switching..." : "Switch"}
                    </button>
                    <button
                      type="button"
                      disabled={plans.length <= 1 || pendingAction !== null}
                      onClick={() => deletePlan(plan.id)}
                      className="btn-secondary border-rose-300 text-rose-700 hover:bg-rose-50 active:bg-rose-100 px-3 py-2 text-sm font-medium"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {activePlan ? (
          <p className="mt-5 text-sm text-forest-700/85">
            Current active plan: <span className="font-semibold text-forest-900">{activePlan.name}</span>
          </p>
        ) : null}
      </section>
    </section>
  );
}
