"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { MAX_PLANS_PER_USER } from "@/lib/plan-config";
import type { BudgetState, InvestmentState } from "@/lib/types";

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

type PlanStatePayload = {
  state?: BudgetState;
  error?: string;
};

type CreatePlanCopyPayload = {
  income?: {
    planId: number;
  };
  expenses?: {
    planId: number;
    expenseIndexes: number[];
  };
  investments?: {
    planId: number;
    fields: Array<keyof InvestmentState>;
  };
};

type PlansManagerProps = {
  username: string;
};

const MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center overflow-y-auto overscroll-contain bg-forest-900/30 px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6 md:px-6 md:py-8";
const MODAL_PANEL_CLASS =
  "card w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 md:max-h-[calc(100dvh-4rem)] md:p-8";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric"
});

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2
});

const INVESTMENT_FIELDS: Array<keyof InvestmentState> = [
  "tfsa",
  "fhsa",
  "rrsp",
  "emergencyFund"
];

const INVESTMENT_LABELS: Record<keyof InvestmentState, string> = {
  tfsa: "TFSA",
  fhsa: "FHSA",
  rrsp: "RRSP",
  emergencyFund: "Emergency Fund"
};

const formatDate = (isoDate: string) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return dateFormatter.format(parsed);
};

const formatFrequency = (frequency: string) =>
  frequency === "bi-weekly" ? "Bi-weekly" : "Monthly";

const toPlanId = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFlowError, setCreateFlowError] = useState("");
  const [copyIncomeEnabled, setCopyIncomeEnabled] = useState(false);
  const [copyIncomePlanId, setCopyIncomePlanId] = useState<number | null>(null);
  const [copyExpensesEnabled, setCopyExpensesEnabled] = useState(false);
  const [copyExpensesPlanId, setCopyExpensesPlanId] = useState<number | null>(null);
  const [selectedExpenseIndexes, setSelectedExpenseIndexes] = useState<number[]>([]);
  const [copyInvestmentsEnabled, setCopyInvestmentsEnabled] = useState(false);
  const [copyInvestmentsPlanId, setCopyInvestmentsPlanId] = useState<number | null>(null);
  const [selectedInvestmentFields, setSelectedInvestmentFields] = useState<
    Array<keyof InvestmentState>
  >([]);
  const [planStateCache, setPlanStateCache] = useState<Record<number, BudgetState>>({});
  const planStateCacheRef = useRef<Record<number, BudgetState>>({});
  const [loadingPlanStateIds, setLoadingPlanStateIds] = useState<number[]>([]);

  const isAtPlanLimit = plans.length >= maxPlans;

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? null,
    [plans, activePlanId]
  );

  const expenseSelectionSet = useMemo(
    () => new Set(selectedExpenseIndexes),
    [selectedExpenseIndexes]
  );

  const investmentSelectionSet = useMemo(
    () => new Set(selectedInvestmentFields),
    [selectedInvestmentFields]
  );

  const expenseSourceState =
    copyExpensesPlanId !== null ? planStateCache[copyExpensesPlanId] : undefined;
  const investmentSourceState =
    copyInvestmentsPlanId !== null ? planStateCache[copyInvestmentsPlanId] : undefined;

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

  const setPlanStateLoading = (planId: number, loadingForPlan: boolean) => {
    setLoadingPlanStateIds((current) => {
      if (loadingForPlan) {
        if (current.includes(planId)) {
          return current;
        }
        return [...current, planId];
      }

      return current.filter((id) => id !== planId);
    });
  };

  const loadPlanState = useCallback(
    async (planId: number): Promise<BudgetState> => {
      const cached = planStateCacheRef.current[planId];
      if (cached) {
        return cached;
      }

      setPlanStateLoading(planId, true);

      try {
        const response = await fetch(`/api/plans/${planId}/state`, {
          method: "GET",
          cache: "no-store"
        });

        if (response.status === 401) {
          router.push("/");
          router.refresh();
          throw new Error("Not authenticated.");
        }

        const payload = (await response.json()) as PlanStatePayload;
        if (!response.ok || !payload.state) {
          throw new Error(payload.error ?? "Unable to load plan data.");
        }

        setPlanStateCache((current) => {
          const next = {
            ...current,
            [planId]: payload.state as BudgetState
          };
          planStateCacheRef.current = next;
          return next;
        });

        return payload.state;
      } finally {
        setPlanStateLoading(planId, false);
      }
    },
    [router]
  );

  const getDefaultSourcePlanId = useCallback(() => {
    return activePlanId ?? plans[0]?.id ?? null;
  }, [activePlanId, plans]);

  const resetCreateFlow = useCallback(() => {
    const defaultSourcePlanId = getDefaultSourcePlanId();

    setCreateFlowError("");
    setCopyIncomeEnabled(false);
    setCopyExpensesEnabled(false);
    setCopyInvestmentsEnabled(false);
    setCopyIncomePlanId(defaultSourcePlanId);
    setCopyExpensesPlanId(defaultSourcePlanId);
    setCopyInvestmentsPlanId(defaultSourcePlanId);
    setSelectedExpenseIndexes([]);
    setSelectedInvestmentFields([]);
  }, [getDefaultSourcePlanId]);

  const openCreateFlow = () => {
    if (isAtPlanLimit || pendingAction !== null) {
      return;
    }

    resetCreateFlow();
    setIsCreateModalOpen(true);
  };

  const closeCreateFlow = () => {
    if (pendingAction === "create") {
      return;
    }

    setIsCreateModalOpen(false);
    setCreateFlowError("");
  };

  useEffect(() => {
    if (!isCreateModalOpen || !copyExpensesEnabled || !copyExpensesPlanId) {
      return;
    }

    let active = true;

    const ensureLoaded = async () => {
      try {
        const sourceState = await loadPlanState(copyExpensesPlanId);
        if (!active) {
          return;
        }

        setSelectedExpenseIndexes((current) => {
          const normalized = current.filter(
            (index) => index >= 0 && index < sourceState.expenses.length
          );

          if (normalized.length > 0) {
            return normalized;
          }

          return sourceState.expenses.map((_, index) => index);
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setCreateFlowError(
          loadError instanceof Error ? loadError.message : "Unable to load source plan data."
        );
      }
    };

    void ensureLoaded();

    return () => {
      active = false;
    };
  }, [copyExpensesEnabled, copyExpensesPlanId, isCreateModalOpen, loadPlanState]);

  useEffect(() => {
    if (!isCreateModalOpen || !copyInvestmentsEnabled || !copyInvestmentsPlanId) {
      return;
    }

    let active = true;

    const ensureLoaded = async () => {
      try {
        await loadPlanState(copyInvestmentsPlanId);
        if (!active) {
          return;
        }

        setSelectedInvestmentFields((current) => {
          const normalized = current.filter((field) => INVESTMENT_FIELDS.includes(field));
          if (normalized.length > 0) {
            return normalized;
          }

          return [...INVESTMENT_FIELDS];
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setCreateFlowError(
          loadError instanceof Error ? loadError.message : "Unable to load source plan data."
        );
      }
    };

    void ensureLoaded();

    return () => {
      active = false;
    };
  }, [copyInvestmentsEnabled, copyInvestmentsPlanId, isCreateModalOpen, loadPlanState]);

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
    setCreateFlowError("");

    const copyPayload: CreatePlanCopyPayload = {};

    if (copyIncomeEnabled && copyIncomePlanId) {
      copyPayload.income = { planId: copyIncomePlanId };
    }

    if (copyExpensesEnabled && copyExpensesPlanId) {
      const expenseIndexes = [...new Set(selectedExpenseIndexes)].sort((left, right) => left - right);
      copyPayload.expenses = {
        planId: copyExpensesPlanId,
        expenseIndexes
      };
    }

    if (copyInvestmentsEnabled && copyInvestmentsPlanId) {
      copyPayload.investments = {
        planId: copyInvestmentsPlanId,
        fields: [...new Set(selectedInvestmentFields)]
      };
    }

    const hasCopyPayload = Object.keys(copyPayload).length > 0;

    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: hasCopyPayload
          ? {
              "Content-Type": "application/json"
            }
          : undefined,
        body: hasCopyPayload ? JSON.stringify({ copy: copyPayload }) : undefined
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

      applyPayload(payload);
      setIsCreateModalOpen(false);
      router.push("/budget");
      router.refresh();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Unable to create plan.";
      setError(message);
      setCreateFlowError(message);
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

  const selectAllExpenses = () => {
    if (!expenseSourceState) {
      return;
    }

    setSelectedExpenseIndexes(expenseSourceState.expenses.map((_, index) => index));
  };

  const clearAllExpenses = () => {
    setSelectedExpenseIndexes([]);
  };

  const toggleExpenseSelection = (index: number) => {
    setSelectedExpenseIndexes((current) =>
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index].sort((left, right) => left - right)
    );
  };

  const selectAllInvestments = () => {
    setSelectedInvestmentFields([...INVESTMENT_FIELDS]);
  };

  const clearAllInvestments = () => {
    setSelectedInvestmentFields([]);
  };

  const toggleInvestmentSelection = (field: keyof InvestmentState) => {
    setSelectedInvestmentFields((current) =>
      current.includes(field)
        ? current.filter((value) => value !== field)
        : [...current, field]
    );
  };

  const isExpenseSourceLoading =
    copyExpensesPlanId !== null && loadingPlanStateIds.includes(copyExpensesPlanId);
  const isInvestmentSourceLoading =
    copyInvestmentsPlanId !== null && loadingPlanStateIds.includes(copyInvestmentsPlanId);

  const allExpensesSelected =
    expenseSourceState !== undefined &&
    expenseSourceState.expenses.length > 0 &&
    selectedExpenseIndexes.length === expenseSourceState.expenses.length;

  const allInvestmentsSelected =
    selectedInvestmentFields.length === INVESTMENT_FIELDS.length;

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
    <>
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
              onClick={openCreateFlow}
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
              Create up to {maxPlans} plans. Start fresh or copy selected data from existing plans.
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
                      <p className="mt-1 text-xs text-forest-700/80">Updated {formatDate(plan.updatedAt)}</p>
                      <p className="text-xs text-forest-700/70">Created {formatDate(plan.createdAt)}</p>
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

      {isCreateModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={MODAL_OVERLAY_CLASS}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-plan-modal-title"
              onClick={closeCreateFlow}
            >
              <article className={MODAL_PANEL_CLASS} onClick={(event) => event.stopPropagation()}>
                <div>
                  <div>
                    <p className="caps-label text-xs font-semibold uppercase text-forest-600">
                      New Plan
                    </p>
                    <h2 id="create-plan-modal-title" className="mt-1 text-2xl font-semibold">
                      Copy Existing Data
                    </h2>
                    <p className="mt-2 text-sm text-forest-700/85">
                      Choose the sections to copy. Each section can come from a different plan.
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <section className="rounded-xl border border-forest-200/90 bg-paper/55 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-forest-900">
                        <input
                          type="checkbox"
                          checked={copyIncomeEnabled}
                          onChange={(event) => {
                            const nextEnabled = event.target.checked;
                            setCopyIncomeEnabled(nextEnabled);
                            if (nextEnabled && copyIncomePlanId === null) {
                              setCopyIncomePlanId(getDefaultSourcePlanId());
                            }
                          }}
                          className="h-4 w-4 rounded border-forest-300 text-forest-800 focus:ring-forest-500"
                        />
                        Copy income
                      </label>

                      {copyIncomeEnabled ? (
                        <label className="text-sm text-forest-800">
                          Source plan
                          <select
                            className="input mt-1 h-10 min-w-[180px] py-0"
                            value={copyIncomePlanId ?? ""}
                            onChange={(event) => setCopyIncomePlanId(toPlanId(event.target.value))}
                          >
                            {plans.map((plan) => (
                              <option key={`income-source-${plan.id}`} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-xl border border-forest-200/90 bg-paper/55 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-forest-900">
                        <input
                          type="checkbox"
                          checked={copyExpensesEnabled}
                          onChange={(event) => {
                            const nextEnabled = event.target.checked;
                            setCopyExpensesEnabled(nextEnabled);
                            if (nextEnabled && copyExpensesPlanId === null) {
                              setCopyExpensesPlanId(getDefaultSourcePlanId());
                            }
                            if (!nextEnabled) {
                              setSelectedExpenseIndexes([]);
                            }
                          }}
                          className="h-4 w-4 rounded border-forest-300 text-forest-800 focus:ring-forest-500"
                        />
                        Copy expenses
                      </label>

                      {copyExpensesEnabled ? (
                        <label className="text-sm text-forest-800">
                          Source plan
                          <select
                            className="input mt-1 h-10 min-w-[180px] py-0"
                            value={copyExpensesPlanId ?? ""}
                            onChange={(event) => {
                              setCopyExpensesPlanId(toPlanId(event.target.value));
                              setSelectedExpenseIndexes([]);
                            }}
                          >
                            {plans.map((plan) => (
                              <option key={`expenses-source-${plan.id}`} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>

                    {copyExpensesEnabled ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs uppercase tracking-[0.12em] text-forest-600">
                            Expense Entries
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={selectAllExpenses}
                              disabled={!expenseSourceState || isExpenseSourceLoading}
                              className="btn-secondary px-2.5 py-1.5 text-xs font-semibold"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={clearAllExpenses}
                              disabled={selectedExpenseIndexes.length === 0 || isExpenseSourceLoading}
                              className="btn-secondary px-2.5 py-1.5 text-xs font-semibold"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        {isExpenseSourceLoading ? (
                          <p className="text-sm text-forest-700/80">Loading expenses...</p>
                        ) : expenseSourceState ? (
                          <ul className="space-y-2">
                            {expenseSourceState.expenses.map((expense, index) => {
                              const label = expense.name.trim().length > 0 ? expense.name : `Expense ${index + 1}`;

                              return (
                                <li
                                  key={`expense-option-${index}`}
                                  className="rounded-lg border border-forest-200 bg-white p-2.5"
                                >
                                  <label className="flex cursor-pointer items-start gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={expenseSelectionSet.has(index)}
                                      onChange={() => toggleExpenseSelection(index)}
                                      className="mt-1 h-4 w-4 rounded border-forest-300 text-forest-800 focus:ring-forest-500"
                                    />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-forest-900">{label}</p>
                                      <p className="text-xs text-forest-700/80">
                                        {cad.format(expense.amount)} - {formatFrequency(expense.frequency)}
                                      </p>
                                    </div>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-forest-700/80">Select a source plan to load expenses.</p>
                        )}

                        {allExpensesSelected ? (
                          <p className="text-xs text-forest-600">All expenses selected.</p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-xl border border-forest-200/90 bg-paper/55 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-forest-900">
                        <input
                          type="checkbox"
                          checked={copyInvestmentsEnabled}
                          onChange={(event) => {
                            const nextEnabled = event.target.checked;
                            setCopyInvestmentsEnabled(nextEnabled);
                            if (nextEnabled && copyInvestmentsPlanId === null) {
                              setCopyInvestmentsPlanId(getDefaultSourcePlanId());
                            }
                            if (!nextEnabled) {
                              setSelectedInvestmentFields([]);
                            }
                          }}
                          className="h-4 w-4 rounded border-forest-300 text-forest-800 focus:ring-forest-500"
                        />
                        Copy investments
                      </label>

                      {copyInvestmentsEnabled ? (
                        <label className="text-sm text-forest-800">
                          Source plan
                          <select
                            className="input mt-1 h-10 min-w-[180px] py-0"
                            value={copyInvestmentsPlanId ?? ""}
                            onChange={(event) => {
                              setCopyInvestmentsPlanId(toPlanId(event.target.value));
                              setSelectedInvestmentFields([]);
                            }}
                          >
                            {plans.map((plan) => (
                              <option key={`investments-source-${plan.id}`} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>

                    {copyInvestmentsEnabled ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs uppercase tracking-[0.12em] text-forest-600">
                            Investment Entries
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={selectAllInvestments}
                              disabled={isInvestmentSourceLoading}
                              className="btn-secondary px-2.5 py-1.5 text-xs font-semibold"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={clearAllInvestments}
                              disabled={selectedInvestmentFields.length === 0 || isInvestmentSourceLoading}
                              className="btn-secondary px-2.5 py-1.5 text-xs font-semibold"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        {isInvestmentSourceLoading ? (
                          <p className="text-sm text-forest-700/80">Loading investments...</p>
                        ) : investmentSourceState ? (
                          <ul className="space-y-2">
                            {INVESTMENT_FIELDS.map((field) => (
                              <li
                                key={`investment-option-${field}`}
                                className="rounded-lg border border-forest-200 bg-white p-2.5"
                              >
                                <label className="flex cursor-pointer items-start gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={investmentSelectionSet.has(field)}
                                    onChange={() => toggleInvestmentSelection(field)}
                                    className="mt-1 h-4 w-4 rounded border-forest-300 text-forest-800 focus:ring-forest-500"
                                  />
                                  <div>
                                    <p className="text-sm font-medium text-forest-900">
                                      {INVESTMENT_LABELS[field]}
                                    </p>
                                    <p className="text-xs text-forest-700/80">
                                      {cad.format(investmentSourceState.investments[field])} -{" "}
                                      {formatFrequency(investmentSourceState.frequencies.investments[field])}
                                    </p>
                                  </div>
                                </label>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-forest-700/80">
                            Select a source plan to load investments.
                          </p>
                        )}

                        {allInvestmentsSelected ? (
                          <p className="text-xs text-forest-600">All investments selected.</p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </div>

                {createFlowError ? <p className="mt-4 text-sm text-rose-700">{createFlowError}</p> : null}

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeCreateFlow}
                    disabled={pendingAction === "create"}
                    className="btn-secondary px-3 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void createPlan();
                    }}
                    disabled={pendingAction === "create"}
                    className="btn-primary px-3 py-2 text-sm font-medium"
                  >
                    {pendingAction === "create" ? "Creating..." : "Create Plan"}
                  </button>
                </div>
              </article>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
