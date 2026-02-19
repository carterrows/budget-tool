"use client";

import {
  type FocusEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useState
} from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_STATE,
  MAX_BONUS_AMOUNT,
  MAX_BONUS_PERCENT,
  MAX_EXPENSE,
  MAX_INVESTMENT,
  MAX_YEARLY_SALARY,
  calculateTotals,
  sanitizeBudgetState
} from "@/lib/budget-state";
import { calculateOntarioNetIncomeFromInput } from "@/lib/tax";
import type { BonusType, BudgetFrequency, BudgetState, InvestmentState } from "@/lib/types";

type Action =
  | { type: "replace"; state: BudgetState }
  | { type: "set-yearly-salary"; amount: number }
  | { type: "set-bonus-type"; bonusType: BonusType }
  | { type: "set-bonus-value"; amount: number }
  | { type: "add-expense" }
  | { type: "remove-expense"; index: number }
  | { type: "set-expense-name"; index: number; name: string }
  | { type: "set-expense-amount"; index: number; amount: number }
  | { type: "set-expense-frequency"; index: number; frequency: BudgetFrequency }
  | {
      type: "set-investment-frequency";
      field: keyof InvestmentState;
      frequency: BudgetFrequency;
    }
  | {
      type: "set-investment";
      field: keyof InvestmentState;
      amount: number;
    };

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ViewMode = "list" | "edit";
type ExpenseSortOrder = "asc" | "desc";

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

const selectInputValueOnFocus = (event: FocusEvent<HTMLInputElement>) => {
  const currentValue = toNumber(event.currentTarget.value);
  if (currentValue === 0) {
    event.currentTarget.select();
  }
};

const reducer = (state: BudgetState, action: Action): BudgetState => {
  switch (action.type) {
    case "replace":
      return sanitizeBudgetState(action.state);
    case "set-yearly-salary":
      return {
        ...state,
        yearlySalary: normalizeMoney(action.amount, MAX_YEARLY_SALARY)
      };
    case "set-bonus-type":
      const nextBonusValue =
        action.bonusType === "amount"
          ? normalizeMoney(state.bonusValue, MAX_BONUS_AMOUNT)
          : action.bonusType === "percentage"
            ? normalizeMoney(state.bonusValue, MAX_BONUS_PERCENT)
            : 0;
      return {
        ...state,
        bonusType: action.bonusType,
        bonusValue: nextBonusValue
      };
    case "set-bonus-value":
      return {
        ...state,
        bonusValue:
          state.bonusType === "amount"
            ? normalizeMoney(action.amount, MAX_BONUS_AMOUNT)
            : state.bonusType === "percentage"
              ? normalizeMoney(action.amount, MAX_BONUS_PERCENT)
              : 0
      };
    case "set-investment-frequency":
      return {
        ...state,
        frequencies: {
          ...state.frequencies,
          investments: {
            ...state.frequencies.investments,
            [action.field]: action.frequency
          }
        }
      };
    case "add-expense":
      return {
        ...state,
        expenses: [{ name: "Expense", amount: 0, frequency: "monthly" }, ...state.expenses]
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
    case "set-expense-frequency":
      return {
        ...state,
        expenses: state.expenses.map((expense, index) =>
          index === action.index ? { ...expense, frequency: action.frequency } : expense
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
  labelAccessory?: ReactNode;
};

function SliderMoneyField({
  id,
  label,
  value,
  max,
  onChange,
  labelAccessory
}: SliderMoneyFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-forest-800">
          {label}
        </label>
        {labelAccessory}
      </div>
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
            onFocus={selectInputValueOnFocus}
            className="input tabular-nums pl-7 pr-3 text-right"
          />
        </div>
      </div>
    </div>
  );
}

type SliderPercentFieldProps = {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
};

function SliderPercentField({ id, label, value, max, onChange }: SliderPercentFieldProps) {
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
          step={0.1}
          value={value}
          onChange={(event) => onChange(toNumber(event.target.value))}
          className="w-full accent-forest-700"
        />
        <div className="relative">
          <input
            type="number"
            min={0}
            max={max}
            step={0.1}
            value={value}
            onChange={(event) => onChange(toNumber(event.target.value))}
            onFocus={selectInputValueOnFocus}
            className="input tabular-nums pl-3 pr-8 text-right"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-forest-700">
            %
          </span>
        </div>
      </div>
    </div>
  );
}

type FrequencySelectProps = {
  id: string;
  value: BudgetFrequency;
  onChange: (value: BudgetFrequency) => void;
  showLabel?: boolean;
  compact?: boolean;
};

function FrequencySelect({
  id,
  value,
  onChange,
  showLabel = true,
  compact = false
}: FrequencySelectProps) {
  const control = (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as BudgetFrequency)}
      className={`input h-10 py-0 pr-8 ${compact ? "w-auto min-w-[122px] shrink-0" : "min-w-[140px]"}`}
    >
      <option value="monthly">Monthly</option>
      <option value="bi-weekly">Bi-weekly</option>
    </select>
  );

  if (!showLabel) {
    return control;
  }

  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-forest-800">
      <span>Frequency</span>
      {control}
    </label>
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
  const [isIncomeHelpOpen, setIsIncomeHelpOpen] = useState(false);
  const [incomeViewMode, setIncomeViewMode] = useState<ViewMode>("list");
  const [expenseViewMode, setExpenseViewMode] = useState<ViewMode>("list");
  const [expenseSortOrder, setExpenseSortOrder] = useState<ExpenseSortOrder>("desc");
  const [investmentViewMode, setInvestmentViewMode] = useState<ViewMode>("list");

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

  useEffect(() => {
    if (!isIncomeHelpOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsIncomeHelpOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isIncomeHelpOpen]);

  useEffect(() => {
    if (!isIncomeHelpOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isIncomeHelpOpen]);

  const totals = useMemo(() => calculateTotals(state), [state]);
  const incomeBreakdown = useMemo(
    () =>
      calculateOntarioNetIncomeFromInput({
        yearlySalary: state.yearlySalary,
        bonusType: state.bonusType,
        bonusValue: state.bonusValue
      }),
    [state.yearlySalary, state.bonusType, state.bonusValue]
  );
  const sortedExpenses = useMemo(
    () =>
      state.expenses
        .map((expense, index) => ({ expense, index }))
        .sort((left, right) => {
          const amountDiff = left.expense.amount - right.expense.amount;
          if (amountDiff === 0) {
            return left.index - right.index;
          }

          return expenseSortOrder === "asc" ? amountDiff : -amountDiff;
        }),
    [state.expenses, expenseSortOrder]
  );
  const editableExpenses = useMemo(
    () => state.expenses.map((expense, index) => ({ expense, index })),
    [state.expenses]
  );

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Income</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setIncomeViewMode((current) => (current === "edit" ? "list" : "edit"))
                  }
                  aria-label={incomeViewMode === "edit" ? "Confirm income edits" : "Edit income"}
                  title={incomeViewMode === "edit" ? "Confirm income edits" : "Edit income"}
                  className="btn-primary flex h-10 w-14 items-center justify-center px-0 py-0 text-sm font-medium"
                >
                  {incomeViewMode === "edit" ? (
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                      check
                    </span>
                  ) : (
                    "Edit"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsIncomeHelpOpen(true)}
                  aria-label="How net income is calculated"
                  title="How net income is calculated"
                  className="btn-secondary h-9 w-9 px-0 py-0 leading-none"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                    question_mark
                  </span>
                </button>
              </div>
            </div>
            {incomeViewMode === "edit" ? (
              <>
                <SliderMoneyField
                  id="yearly-salary"
                  label="Yearly Salary (CAD)"
                  value={state.yearlySalary}
                  max={MAX_YEARLY_SALARY}
                  onChange={(amount) => safeDispatch({ type: "set-yearly-salary", amount })}
                />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label htmlFor="bonus-type" className="text-sm font-medium text-forest-800">
                      Year-end Bonus
                    </label>
                    <select
                      id="bonus-type"
                      value={state.bonusType}
                      onChange={(event) =>
                        safeDispatch({
                          type: "set-bonus-type",
                          bonusType: event.target.value as BonusType
                        })
                      }
                      className="input h-10 min-w-[220px] py-0 pr-8 md:w-[260px]"
                    >
                      <option value="none">No bonus</option>
                      <option value="amount">Dollar amount</option>
                      <option value="percentage">Percentage of salary</option>
                    </select>
                  </div>
                </div>
                {state.bonusType === "amount" ? (
                  <SliderMoneyField
                    id="bonus-amount"
                    label="Bonus Amount (CAD)"
                    value={state.bonusValue}
                    max={MAX_BONUS_AMOUNT}
                    onChange={(amount) => safeDispatch({ type: "set-bonus-value", amount })}
                  />
                ) : null}
                {state.bonusType === "percentage" ? (
                  <SliderPercentField
                    id="bonus-percent"
                    label="Bonus Percentage"
                    value={state.bonusValue}
                    max={MAX_BONUS_PERCENT}
                    onChange={(amount) => safeDispatch({ type: "set-bonus-value", amount })}
                  />
                ) : null}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-forest-700/80">
                  Read-only summary. Press Edit to make changes.
                </p>
                <div className="overflow-hidden rounded-xl border border-forest-100 bg-paper/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)]">
                  <ul className="divide-y divide-forest-100/90">
                    <li className="flex items-center justify-between gap-4 px-4 py-3">
                      <p className="text-sm font-medium text-forest-900">Yearly salary</p>
                      <p className="tabular-nums text-sm font-semibold text-forest-900">
                        {cad.format(state.yearlySalary)}
                      </p>
                    </li>
                    <li className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-forest-900">Year-end bonus</p>
                        <p className="text-xs text-forest-700/75">
                          {state.bonusType === "amount"
                            ? "Dollar amount"
                            : state.bonusType === "percentage"
                              ? "Percentage of salary"
                              : "No bonus configured"}
                        </p>
                      </div>
                      <p className="tabular-nums text-sm font-semibold text-forest-900">
                        {state.bonusType === "none"
                          ? "No bonus"
                          : state.bonusType === "amount"
                            ? cad.format(state.bonusValue)
                            : `${state.bonusValue}% of salary`}
                      </p>
                    </li>
                  </ul>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-forest-200/80 bg-paper/55 p-4">
              <p className="caps-label text-xs font-semibold uppercase text-forest-600">
                Yearly Net Income (After Tax + Deductions)
              </p>
              <p className="tabular-nums mt-2 text-2xl font-semibold text-forest-700">
                {cad.format(incomeBreakdown.annualNetIncome)}
              </p>
            </div>
          </section>

          <section className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Expenses</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="expense-sort-order"
                  aria-label="Expense sort order"
                  value={expenseSortOrder}
                  onChange={(event) =>
                    setExpenseSortOrder(event.target.value as ExpenseSortOrder)
                  }
                  className="input h-10 w-[96px] min-w-0 py-0 pr-8"
                >
                  <option value="desc">desc</option>
                  <option value="asc">asc</option>
                </select>
                {expenseViewMode === "edit" ? (
                  <button
                    type="button"
                    onClick={() => safeDispatch({ type: "add-expense" })}
                    className="btn-secondary px-3 py-2 text-sm font-medium"
                  >
                    + Add expense
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setExpenseViewMode((current) => (current === "edit" ? "list" : "edit"))
                  }
                  aria-label={expenseViewMode === "edit" ? "Confirm expense edits" : "Edit expenses"}
                  title={expenseViewMode === "edit" ? "Confirm expense edits" : "Edit expenses"}
                  className="btn-primary flex h-10 w-14 items-center justify-center px-0 py-0 text-sm font-medium"
                >
                  {expenseViewMode === "edit" ? (
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                      check
                    </span>
                  ) : (
                    "Edit"
                  )}
                </button>
              </div>
            </div>

            {expenseViewMode === "edit" ? (
              <div className="space-y-4">
                {editableExpenses.map(({ expense, index }) => (
                  <article
                    key={`expense-${index}`}
                    className="rounded-xl border border-forest-100 bg-paper/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)]"
                  >
                    <div className="mb-2 flex items-center gap-3">
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
                        className="input min-w-0 flex-1"
                      />
                      <FrequencySelect
                        id={`expense-frequency-${index}`}
                        value={expense.frequency}
                        showLabel={false}
                        compact
                        onChange={(frequency) =>
                          safeDispatch({
                            type: "set-expense-frequency",
                            index,
                            frequency
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => safeDispatch({ type: "remove-expense", index })}
                        disabled={state.expenses.length <= 1}
                        aria-label="Delete expense"
                        title="Delete expense"
                        className="btn-secondary ml-auto h-10 w-10 px-0 py-0 leading-none disabled:opacity-40"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                          delete
                        </span>
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
                          onFocus={selectInputValueOnFocus}
                          className="input tabular-nums pl-7 pr-3 text-right"
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-forest-700/80">
                  Read-only summary. Press Edit to make changes.
                </p>
                <div className="overflow-hidden rounded-xl border border-forest-100 bg-paper/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)]">
                  <ul className="divide-y divide-forest-100/90">
                    {sortedExpenses.map(({ expense, index }, expenseIndex) => (
                      <li
                        key={`expense-list-${index}`}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-forest-900">
                            {expense.name.trim().length > 0
                              ? expense.name
                              : `Expense ${expenseIndex + 1}`}
                          </p>
                          <p className="text-xs text-forest-700/75">
                            {expense.frequency === "bi-weekly" ? "Bi-weekly" : "Monthly"}
                          </p>
                        </div>
                        <p className="tabular-nums text-sm font-semibold text-forest-900">
                          {cad.format(expense.amount)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>

          <section className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Investments</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setInvestmentViewMode((current) => (current === "edit" ? "list" : "edit"))
                  }
                  aria-label={
                    investmentViewMode === "edit"
                      ? "Confirm investment edits"
                      : "Edit investments"
                  }
                  title={
                    investmentViewMode === "edit"
                      ? "Confirm investment edits"
                      : "Edit investments"
                  }
                  className="btn-primary flex h-10 w-14 items-center justify-center px-0 py-0 text-sm font-medium"
                >
                  {investmentViewMode === "edit" ? (
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                      check
                    </span>
                  ) : (
                    "Edit"
                  )}
                </button>
              </div>
            </div>
            {investmentViewMode === "edit" ? (
              <div className="space-y-4">
                <SliderMoneyField
                  id="tfsa"
                  label="TFSA"
                  value={state.investments.tfsa}
                  max={MAX_INVESTMENT}
                  onChange={(amount) =>
                    safeDispatch({ type: "set-investment", field: "tfsa", amount })
                  }
                  labelAccessory={
                    <FrequencySelect
                      id="investment-frequency-tfsa"
                      value={state.frequencies.investments.tfsa}
                      showLabel={false}
                      onChange={(frequency) =>
                        safeDispatch({
                          type: "set-investment-frequency",
                          field: "tfsa",
                          frequency
                        })
                      }
                    />
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
                  labelAccessory={
                    <FrequencySelect
                      id="investment-frequency-fhsa"
                      value={state.frequencies.investments.fhsa}
                      showLabel={false}
                      onChange={(frequency) =>
                        safeDispatch({
                          type: "set-investment-frequency",
                          field: "fhsa",
                          frequency
                        })
                      }
                    />
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
                  labelAccessory={
                    <FrequencySelect
                      id="investment-frequency-rrsp"
                      value={state.frequencies.investments.rrsp}
                      showLabel={false}
                      onChange={(frequency) =>
                        safeDispatch({
                          type: "set-investment-frequency",
                          field: "rrsp",
                          frequency
                        })
                      }
                    />
                  }
                />
                <SliderMoneyField
                  id="emergency-fund"
                  label="Emergency Fund"
                  value={state.investments.emergencyFund}
                  max={MAX_INVESTMENT}
                  onChange={(amount) =>
                    safeDispatch({ type: "set-investment", field: "emergencyFund", amount })
                  }
                  labelAccessory={
                    <FrequencySelect
                      id="investment-frequency-emergency-fund"
                      value={state.frequencies.investments.emergencyFund}
                      showLabel={false}
                      onChange={(frequency) =>
                        safeDispatch({
                          type: "set-investment-frequency",
                          field: "emergencyFund",
                          frequency
                        })
                      }
                    />
                  }
                />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-forest-700/80">
                  Read-only summary. Press Edit to make changes.
                </p>
                <div className="overflow-hidden rounded-xl border border-forest-100 bg-paper/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)]">
                  <ul className="divide-y divide-forest-100/90">
                    <li className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-forest-900">TFSA</p>
                        <p className="text-xs text-forest-700/75">
                          {state.frequencies.investments.tfsa === "bi-weekly"
                            ? "Bi-weekly"
                            : "Monthly"}
                        </p>
                      </div>
                      <p className="tabular-nums text-sm font-semibold text-forest-900">
                        {cad.format(state.investments.tfsa)}
                      </p>
                    </li>
                    <li className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-forest-900">FHSA</p>
                        <p className="text-xs text-forest-700/75">
                          {state.frequencies.investments.fhsa === "bi-weekly"
                            ? "Bi-weekly"
                            : "Monthly"}
                        </p>
                      </div>
                      <p className="tabular-nums text-sm font-semibold text-forest-900">
                        {cad.format(state.investments.fhsa)}
                      </p>
                    </li>
                    <li className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-forest-900">RRSP</p>
                        <p className="text-xs text-forest-700/75">
                          {state.frequencies.investments.rrsp === "bi-weekly"
                            ? "Bi-weekly"
                            : "Monthly"}
                        </p>
                      </div>
                      <p className="tabular-nums text-sm font-semibold text-forest-900">
                        {cad.format(state.investments.rrsp)}
                      </p>
                    </li>
                    <li className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-forest-900">Emergency fund</p>
                        <p className="text-xs text-forest-700/75">
                          {state.frequencies.investments.emergencyFund === "bi-weekly"
                            ? "Bi-weekly"
                            : "Monthly"}
                        </p>
                      </div>
                      <p className="tabular-nums text-sm font-semibold text-forest-900">
                        {cad.format(state.investments.emergencyFund)}
                      </p>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="card border-forest-300/90 p-6 lg:sticky lg:top-8 lg:h-fit">
          <h2 className="text-xl font-semibold">Summary</h2>
          <p className="mt-1 text-xs text-forest-700/75">All totals shown as monthly equivalents.</p>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-forest-700/90">Monthly net income</span>
              <span className="tabular-nums font-semibold text-forest-900">
                {cad.format(totals.monthlyIncome)}
              </span>
            </div>
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

      {isIncomeHelpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-forest-900/25 p-4 backdrop-blur-sm"
          onClick={() => setIsIncomeHelpOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="income-help-title"
        >
          <article
            className="card w-full max-w-3xl p-6 md:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="caps-label text-xs font-semibold uppercase text-forest-600">
                  Income Calculator
                </p>
                <h3 id="income-help-title" className="mt-1 text-2xl font-semibold">
                  Ontario After-Tax Income (2026)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsIncomeHelpOpen(false)}
                className="btn-secondary h-9 px-3 py-0 text-sm"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm text-forest-700/85">
              Monthly income is calculated from annual salary + bonus, then reduced by
              federal/provincial tax and mandatory CPP/EI deductions.
            </p>

            <div className="mt-6 grid gap-3 rounded-xl border border-forest-200 bg-paper/55 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-forest-700/90">Annual salary</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.annualSalary)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-forest-700/90">Annual bonus</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.annualBonus)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-forest-200/80 pt-3">
                <span className="text-forest-700/90">Gross annual income</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.annualGrossIncome)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-forest-700/90">Federal income tax</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.federalTax)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-forest-700/90">Ontario income tax</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.provincialTax)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-forest-700/90">CPP contribution</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.cppContribution)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-forest-700/90">EI premium</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.eiPremium)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-forest-200/80 pt-3">
                <span className="text-forest-700/90">Total annual deductions</span>
                <span className="tabular-nums font-semibold">
                  {cad.format(incomeBreakdown.totalDeductions)}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-forest-300/70 bg-gradient-to-br from-forest-50 via-paper to-white p-4">
              <p className="caps-label text-xs font-semibold uppercase text-forest-600">
                Monthly Net Income Used In Budget
              </p>
              <p className="tabular-nums mt-2 text-3xl font-semibold text-forest-700">
                {cad.format(incomeBreakdown.monthlyNetIncome)}
              </p>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
