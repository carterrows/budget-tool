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
import { createPortal } from "react-dom";
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
  | { type: "set-rrsp-income-2025"; amount: number }
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

const EXPENSE_CHART_COLORS = [
  "#235f46",
  "#2f7a58",
  "#42916d",
  "#5aa683",
  "#76b99a",
  "#91c9ae",
  "#abc9a0",
  "#c7cf9c",
  "#dac58d",
  "#dca97f"
];

const TFSA_2026_LIMIT = 7000;
const FHSA_2026_LIMIT = 8000;
const RRSP_2026_CAP = 33810;
const MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center overflow-y-auto overscroll-contain bg-forest-900/30 px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6 md:px-6 md:py-8";
const MODAL_PANEL_CLASS =
  "card w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 md:max-h-[calc(100dvh-4rem)] md:p-8";

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const normalizeMoney = (value: number, max: number) =>
  Math.round(clamp(value, 0, max) * 100) / 100;

const toMonthlyEquivalent = (amount: number, frequency: BudgetFrequency) =>
  frequency === "bi-weekly" ? (amount * 26) / 12 : amount;

const toYearlyEquivalent = (amount: number, frequency: BudgetFrequency) =>
  frequency === "bi-weekly" ? amount * 26 : amount * 12;

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
    case "set-rrsp-income-2025":
      return {
        ...state,
        rrspIncome2025: normalizeMoney(action.amount, MAX_YEARLY_SALARY)
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

type ActivePlanMeta = {
  id: number;
  name: string;
};

type ModalOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
};

function ModalOverlay({ isOpen, onClose, labelledBy, children }: ModalOverlayProps) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={MODAL_OVERLAY_CLASS}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <article className={MODAL_PANEL_CLASS} onClick={(event) => event.stopPropagation()}>
        {children}
      </article>
    </div>,
    document.body
  );
}

export default function BudgetApp({ username }: BudgetAppProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasPendingEdits, setHasPendingEdits] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activePlan, setActivePlan] = useState<ActivePlanMeta | null>(null);
  const [isIncomeHelpOpen, setIsIncomeHelpOpen] = useState(false);
  const [isExpenseChartOpen, setIsExpenseChartOpen] = useState(false);
  const [isInvestmentHelpOpen, setIsInvestmentHelpOpen] = useState(false);
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

        const payload = (await response.json()) as {
          state?: BudgetState;
          activePlan?: ActivePlanMeta;
        };
        if (!active) {
          return;
        }

        dispatch({
          type: "replace",
          state: sanitizeBudgetState(payload.state)
        });
        setActivePlan(payload.activePlan ?? null);
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

        const payload = (await response.json()) as { activePlan?: ActivePlanMeta };
        if (payload.activePlan) {
          setActivePlan(payload.activePlan);
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
    if (!isIncomeHelpOpen && !isExpenseChartOpen && !isInvestmentHelpOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsIncomeHelpOpen(false);
        setIsExpenseChartOpen(false);
        setIsInvestmentHelpOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isIncomeHelpOpen, isExpenseChartOpen, isInvestmentHelpOpen]);

  useEffect(() => {
    if (!isIncomeHelpOpen && !isExpenseChartOpen && !isInvestmentHelpOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isIncomeHelpOpen, isExpenseChartOpen, isInvestmentHelpOpen]);

  useEffect(() => {
    if (expenseViewMode === "edit") {
      setIsExpenseChartOpen(false);
    }
  }, [expenseViewMode]);

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
  const expenseChart = useMemo(() => {
    const slices = state.expenses
      .map((expense, index) => ({
        index,
        name: expense.name.trim().length > 0 ? expense.name : `Expense ${index + 1}`,
        frequencyLabel: expense.frequency === "bi-weekly" ? "Bi-weekly" : "Monthly",
        monthlyAmount: toMonthlyEquivalent(expense.amount, expense.frequency)
      }))
      .sort((left, right) => {
        const amountDiff = right.monthlyAmount - left.monthlyAmount;
        if (amountDiff === 0) {
          return left.index - right.index;
        }
        return amountDiff;
      })
      .map((slice, chartIndex) => ({
        ...slice,
        color: EXPENSE_CHART_COLORS[chartIndex % EXPENSE_CHART_COLORS.length]
      }));

    const totalMonthlyExpenses = slices.reduce((sum, slice) => sum + slice.monthlyAmount, 0);
    let cursor = 0;

    const slicesWithPercent = slices.map((slice) => {
      const percentage = totalMonthlyExpenses > 0 ? (slice.monthlyAmount / totalMonthlyExpenses) * 100 : 0;
      const start = cursor;
      cursor += percentage;
      return {
        ...slice,
        percentage,
        start,
        end: cursor
      };
    });

    const chartStops = slicesWithPercent
      .filter((slice) => slice.percentage > 0)
      .map((slice) => `${slice.color} ${slice.start}% ${Math.min(slice.end, 100)}%`);

    return {
      totalMonthlyExpenses,
      slices: slicesWithPercent,
      backgroundImage:
        chartStops.length > 0
          ? `conic-gradient(${chartStops.join(", ")})`
          : "conic-gradient(#d8e6de 0 100%)"
    };
  }, [state.expenses]);
  const investmentLimitGuide = useMemo(() => {
    const tfsaYearly = toYearlyEquivalent(
      state.investments.tfsa,
      state.frequencies.investments.tfsa
    );
    const fhsaYearly = toYearlyEquivalent(
      state.investments.fhsa,
      state.frequencies.investments.fhsa
    );
    const rrspYearly = toYearlyEquivalent(
      state.investments.rrsp,
      state.frequencies.investments.rrsp
    );
    const rrspBasedOnIncome = state.rrspIncome2025 * 0.18;
    const rrspLimit = Math.min(RRSP_2026_CAP, rrspBasedOnIncome);

    return {
      rrspBasedOnIncome,
      rrspLimit,
      entries: [
        {
          id: "tfsa",
          label: "TFSA",
          yearlyContribution: tfsaYearly,
          yearlyLimit: TFSA_2026_LIMIT,
          frequencyLabel:
            state.frequencies.investments.tfsa === "bi-weekly" ? "Bi-weekly" : "Monthly"
        },
        {
          id: "fhsa",
          label: "FHSA",
          yearlyContribution: fhsaYearly,
          yearlyLimit: FHSA_2026_LIMIT,
          frequencyLabel:
            state.frequencies.investments.fhsa === "bi-weekly" ? "Bi-weekly" : "Monthly"
        },
        {
          id: "rrsp",
          label: "RRSP",
          yearlyContribution: rrspYearly,
          yearlyLimit: rrspLimit,
          frequencyLabel:
            state.frequencies.investments.rrsp === "bi-weekly" ? "Bi-weekly" : "Monthly"
        }
      ].map((entry) => ({
        ...entry,
        usagePercent:
          entry.yearlyLimit > 0 ? (entry.yearlyContribution / entry.yearlyLimit) * 100 : 0
      }))
    };
  }, [
    state.rrspIncome2025,
    state.frequencies.investments.fhsa,
    state.frequencies.investments.rrsp,
    state.frequencies.investments.tfsa,
    state.investments.fhsa,
    state.investments.rrsp,
    state.investments.tfsa
  ]);

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
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">
            {activePlan?.name ?? "Monthly Plan"}
          </h1>
          <p className="text-sm text-forest-700/80">Signed in as {username}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p className="tabular-nums text-sm text-forest-700/90">{statusLabel}</p>
          <button
            type="button"
            onClick={() => router.push("/plans")}
            className="btn-secondary px-3 py-2 text-sm font-medium"
          >
            Switch Plan
          </button>
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
                  onClick={() => setIsIncomeHelpOpen(true)}
                  aria-label="How net income is calculated"
                  title="How net income is calculated"
                  className="btn-secondary h-9 w-9 px-0 py-0 leading-none"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                    question_mark
                  </span>
                </button>
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
                {expenseViewMode === "list" ? (
                  <button
                    type="button"
                    onClick={() => setIsExpenseChartOpen(true)}
                    aria-label="Show expense pie chart"
                    title="Show expense pie chart"
                    className="btn-secondary h-10 w-10 px-0 py-0 leading-none"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                      pie_chart
                    </span>
                  </button>
                ) : null}
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
                  onClick={() => setIsInvestmentHelpOpen(true)}
                  aria-label="How investment limits are calculated"
                  title="How investment limits are calculated"
                  className="btn-secondary h-9 w-9 px-0 py-0 leading-none"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                    question_mark
                  </span>
                </button>
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

      <ModalOverlay
        isOpen={isIncomeHelpOpen}
        onClose={() => setIsIncomeHelpOpen(false)}
        labelledBy="income-help-title"
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
      </ModalOverlay>

      <ModalOverlay
        isOpen={isExpenseChartOpen}
        onClose={() => setIsExpenseChartOpen(false)}
        labelledBy="expense-chart-title"
      >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="caps-label text-xs font-semibold uppercase text-forest-600">
                  Expenses Breakdown
                </p>
                <h3 id="expense-chart-title" className="mt-1 text-2xl font-semibold">
                  Expense Pie Chart
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseChartOpen(false)}
                className="btn-secondary h-9 px-3 py-0 text-sm"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm text-forest-700/85">
              Each slice shows that category&apos;s share of your total monthly expenses.
            </p>

            <div className="mt-6 grid gap-5 lg:grid-cols-[260px_1fr] lg:items-start">
              <div className="mx-auto">
                <div
                  className="relative h-[220px] w-[220px] rounded-full border border-forest-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                  style={{ backgroundImage: expenseChart.backgroundImage }}
                >
                  <div className="absolute inset-[24%] flex flex-col items-center justify-center rounded-full border border-forest-200/80 bg-paper/90 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <span className="text-xs text-forest-700/80">Monthly total</span>
                    <span className="tabular-nums mt-1 text-lg font-semibold text-forest-900">
                      {cad.format(expenseChart.totalMonthlyExpenses)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-forest-200 bg-paper/55">
                <ul className="divide-y divide-forest-100/90">
                  {expenseChart.slices.map((slice) => (
                    <li
                      key={`expense-chart-${slice.index}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-forest-300/70"
                          style={{ backgroundColor: slice.color }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-forest-900">
                            {slice.name}
                          </p>
                          <p className="text-xs text-forest-700/75">{slice.frequencyLabel}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums text-sm font-semibold text-forest-900">
                          {slice.percentage.toFixed(1)}%
                        </p>
                        <p className="tabular-nums text-xs text-forest-700/80">
                          {cad.format(slice.monthlyAmount)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
      </ModalOverlay>

      <ModalOverlay
        isOpen={isInvestmentHelpOpen}
        onClose={() => setIsInvestmentHelpOpen(false)}
        labelledBy="investment-help-title"
      >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="caps-label text-xs font-semibold uppercase text-forest-600">
                  Registered Accounts
                </p>
                <h3 id="investment-help-title" className="mt-1 text-2xl font-semibold">
                  Yearly Contribution Limits (2026)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInvestmentHelpOpen(false)}
                className="btn-secondary h-9 px-3 py-0 text-sm"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm text-forest-700/85">
              Yearly totals use your selected frequency for TFSA, FHSA, and RRSP. Limits used:
              TFSA {cad.format(TFSA_2026_LIMIT)}, FHSA {cad.format(FHSA_2026_LIMIT)}, RRSP
              {` min(${cad.format(RRSP_2026_CAP)}, 18% of 2025 income)`}.
            </p>

            <div className="mt-5 rounded-xl border border-forest-200 bg-paper/55 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label
                  htmlFor="rrsp-income-2025"
                  className="text-sm font-medium text-forest-900"
                >
                  2025 income for RRSP limit
                </label>
                <div className="relative min-w-[220px] flex-1 md:max-w-[280px]">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-forest-700">
                    $
                  </span>
                  <input
                    id="rrsp-income-2025"
                    type="number"
                    min={0}
                    step={1}
                    value={state.rrspIncome2025}
                    onChange={(event) =>
                      safeDispatch({
                        type: "set-rrsp-income-2025",
                        amount: Math.max(0, toNumber(event.target.value))
                      })
                    }
                    onFocus={selectInputValueOnFocus}
                    className="input tabular-nums pl-7 pr-3 text-right"
                  />
                </div>
              </div>
              <p className="tabular-nums mt-2 text-sm text-forest-700/90">
                18% of 2025 income: {cad.format(investmentLimitGuide.rrspBasedOnIncome)}. RRSP
                limit used: {cad.format(investmentLimitGuide.rrspLimit)}.
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {investmentLimitGuide.entries.map((entry) => {
                const cappedUsagePercent = Math.min(entry.usagePercent, 100);
                const isOverLimit =
                  entry.yearlyLimit > 0 && entry.yearlyContribution > entry.yearlyLimit;
                const remainingRoom = Math.max(entry.yearlyLimit - entry.yearlyContribution, 0);

                return (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-forest-200 bg-paper/55 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-forest-900">{entry.label}</p>
                        <p className="text-xs text-forest-700/75">
                          Based on current {entry.frequencyLabel.toLowerCase()} amount
                        </p>
                      </div>
                      <p className="tabular-nums text-sm font-semibold text-forest-900">
                        {entry.usagePercent.toFixed(1)}%
                      </p>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-forest-100">
                      <div
                        className={`h-full rounded-full ${
                          isOverLimit ? "bg-rose-500" : "bg-forest-600"
                        }`}
                        style={{ width: `${cappedUsagePercent}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-forest-700/90">
                      <span className="tabular-nums">
                        Yearly contribution: {cad.format(entry.yearlyContribution)}
                      </span>
                      <span className="tabular-nums">
                        Limit: {cad.format(entry.yearlyLimit)}
                      </span>
                    </div>

                    {entry.id === "rrsp" && entry.yearlyLimit === 0 ? (
                      <p className="mt-2 text-xs text-forest-700/80">
                        Enter 2025 income above to calculate RRSP room.
                      </p>
                    ) : isOverLimit ? (
                      <p className="tabular-nums mt-2 text-xs text-rose-700">
                        Over limit by {cad.format(entry.yearlyContribution - entry.yearlyLimit)}.
                      </p>
                    ) : (
                      <p className="tabular-nums mt-2 text-xs text-forest-700/85">
                        Remaining room: {cad.format(remainingRoom)}.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
      </ModalOverlay>
    </section>
  );
}
