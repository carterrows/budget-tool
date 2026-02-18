"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_STATE,
  MAX_EXPENSE,
  MAX_INCOME,
  MAX_INVESTMENT,
  calculateTotals,
  sanitizeBudgetState
} from "@/lib/budget-state";
import type { BudgetState, InvestmentState } from "@/lib/types";

type Action =
  | { type: "replace"; state: BudgetState }
  | { type: "set-income"; amount: number }
  | { type: "add-expense" }
  | { type: "remove-expense"; index: number }
  | { type: "set-expense-name"; index: number; name: string }
  | { type: "set-expense-amount"; index: number; amount: number }
  | {
      type: "set-investment";
      field: keyof InvestmentState;
      amount: number;
    };

type SaveStatus = "idle" | "saving" | "saved" | "error";

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2
});

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const normalizeMoney = (value: number, max: number) =>
  Math.round(clamp(value, 0, max) * 100) / 100;

const reducer = (state: BudgetState, action: Action): BudgetState => {
  switch (action.type) {
    case "replace":
      return sanitizeBudgetState(action.state);
    case "set-income":
      return {
        ...state,
        income: normalizeMoney(action.amount, MAX_INCOME)
      };
    case "add-expense":
      return {
        ...state,
        expenses: [...state.expenses, { name: "Expense", amount: 0 }]
      };
    case "remove-expense":
      if (state.expenses.length <= 1) {
        return state;
      }

      return {
        ...state,
        expenses: state.expenses.filter((_, index) => index !== action.index)
      };
    case "set-expense-name":
      return {
        ...state,
        expenses: state.expenses.map((expense, index) =>
          index === action.index ? { ...expense, name: action.name.slice(0, 64) } : expense
        )
      };
    case "set-expense-amount":
      return {
        ...state,
        expenses: state.expenses.map((expense, index) =>
          index === action.index
            ? { ...expense, amount: normalizeMoney(action.amount, MAX_EXPENSE) }
            : expense
        )
      };
    case "set-investment":
      return {
        ...state,
        investments: {
          ...state.investments,
          [action.field]: normalizeMoney(action.amount, MAX_INVESTMENT)
        }
      };
    default:
      return state;
  }
};

type SliderMoneyFieldProps = {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
};

function SliderMoneyField({ id, label, value, max, onChange }: SliderMoneyFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-forest-800">
        {label}
      </label>
      <div className="grid gap-3 md:grid-cols-[1fr_140px]">
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onChange(toNumber(event.target.value))}
          className="w-full accent-forest-700"
        />
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-forest-700">
            $
          </span>
          <input
            type="number"
            min={0}
            max={max}
            step={1}
            value={value}
            onChange={(event) => onChange(toNumber(event.target.value))}
            className="input tabular-nums pl-7 pr-3 text-right"
          />
        </div>
      </div>
    </div>
  );
}

type BudgetAppProps = {
  username: string;
};

export default function BudgetApp({ username }: BudgetAppProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasPendingEdits, setHasPendingEdits] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const safeDispatch = (action: Action) => {
    setHasPendingEdits(true);
    dispatch(action);
  };

  useEffect(() => {
    let active = true;

    const loadState = async () => {
      try {
        const response = await fetch("/api/state", {
          method: "GET",
          cache: "no-store"
        });

        if (response.status === 401) {
          router.push("/");
          router.refresh();
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load budget state.");
        }

        const payload = (await response.json()) as { state?: BudgetState };
        if (!active) {
          return;
        }

        dispatch({
          type: "replace",
          state: sanitizeBudgetState(payload.state)
        });
        setHasPendingEdits(false);
        setInitialized(true);
      } catch (error) {
        if (!active) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "Unable to load budget state."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadState();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!initialized || !hasPendingEdits) {
      return;
    }

    setSaveStatus("saving");

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(state)
        });

        if (!response.ok) {
          throw new Error("Unable to save budget state.");
        }

        setHasPendingEdits(false);
        setSaveStatus("saved");

        window.setTimeout(() => {
          setSaveStatus((current) => (current === "saved" ? "idle" : current));
        }, 1200);
      } catch {
        setSaveStatus("error");
      }
    }, 800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [state, initialized, hasPendingEdits]);

  const totals = useMemo(() => calculateTotals(state), [state]);

  const logout = async () => {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  const statusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : "";

  if (loading) {
    return (
      <section className="card mx-auto max-w-5xl p-8">
        <p className="text-sm text-forest-700/80">Loading your budget...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="mx-auto max-w-5xl rounded-2xl border border-rose-200 bg-white p-8 shadow-card">
        <p className="text-sm text-rose-700">{loadError}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="caps-label text-xs font-semibold uppercase text-forest-600">Budget Tool</p>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Monthly Plan</h1>
          <p className="text-sm text-forest-700/80">Signed in as {username}</p>
        </div>

        <div className="flex items-center gap-4">
          <p className="tabular-nums text-sm text-forest-700/90">{statusLabel}</p>
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={logout}
            className="btn-secondary px-3 py-2 text-sm font-medium"
          >
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="card space-y-4 p-6">
            <h2 className="text-xl font-semibold">Income</h2>
            <SliderMoneyField
              id="income"
              label="Monthly Income (CAD)"
              value={state.income}
              max={MAX_INCOME}
              onChange={(amount) => safeDispatch({ type: "set-income", amount })}
            />
          </section>

          <section className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Expenses</h2>
              <button
                type="button"
                onClick={() => safeDispatch({ type: "add-expense" })}
                className="btn-secondary px-3 py-2 text-sm font-medium"
              >
                + Add expense
              </button>
            </div>

            <div className="space-y-4">
              {state.expenses.map((expense, index) => (
                <article
                  key={`expense-${index}`}
                  className="rounded-xl border border-forest-100 bg-paper/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)]"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <input
                      type="text"
                      value={expense.name}
                      onChange={(event) =>
                        safeDispatch({
                          type: "set-expense-name",
                          index,
                          name: event.target.value
                        })
                      }
                      placeholder="Category"
                      className="input"
                    />
                    <button
                      type="button"
                      onClick={() => safeDispatch({ type: "remove-expense", index })}
                      disabled={state.expenses.length <= 1}
                      className="btn-secondary px-3 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                    <input
                      type="range"
                      min={0}
                      max={MAX_EXPENSE}
                      step={1}
                      value={expense.amount}
                      onChange={(event) =>
                        safeDispatch({
                          type: "set-expense-amount",
                          index,
                          amount: toNumber(event.target.value)
                        })
                      }
                      className="w-full accent-forest-700"
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-forest-700">
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={MAX_EXPENSE}
                        step={1}
                        value={expense.amount}
                        onChange={(event) =>
                          safeDispatch({
                            type: "set-expense-amount",
                            index,
                            amount: toNumber(event.target.value)
                          })
                        }
                        className="input tabular-nums pl-7 pr-3 text-right"
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card space-y-4 p-6">
            <h2 className="text-xl font-semibold">Investments</h2>
            <div className="space-y-4">
              <SliderMoneyField
                id="tfsa"
                label="TFSA"
                value={state.investments.tfsa}
                max={MAX_INVESTMENT}
                onChange={(amount) =>
                  safeDispatch({ type: "set-investment", field: "tfsa", amount })
                }
              />
              <SliderMoneyField
                id="fhsa"
                label="FHSA"
                value={state.investments.fhsa}
                max={MAX_INVESTMENT}
                onChange={(amount) =>
                  safeDispatch({ type: "set-investment", field: "fhsa", amount })
                }
              />
              <SliderMoneyField
                id="rrsp"
                label="RRSP"
                value={state.investments.rrsp}
                max={MAX_INVESTMENT}
                onChange={(amount) =>
                  safeDispatch({ type: "set-investment", field: "rrsp", amount })
                }
              />
            </div>
          </section>
        </div>

        <aside className="card border-forest-300/90 p-6 lg:sticky lg:top-8 lg:h-fit">
          <h2 className="text-xl font-semibold">Summary</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-forest-700/90">Total expenses</span>
              <span className="tabular-nums font-semibold text-forest-900">
                {cad.format(totals.totalExpenses)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-forest-700/90">Total investments</span>
              <span className="tabular-nums font-semibold text-forest-900">
                {cad.format(totals.totalInvestments)}
              </span>
            </div>
            <div className="rounded-xl border border-forest-300/60 bg-gradient-to-br from-forest-50 via-paper to-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="caps-label text-sm font-semibold uppercase text-forest-600">Leftover Cash</p>
              <p
                className={`tabular-nums mt-2 text-4xl font-semibold leading-tight ${
                  totals.leftover < 0 ? "text-rose-700" : "text-forest-700"
                }`}
              >
                {cad.format(totals.leftover)}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
