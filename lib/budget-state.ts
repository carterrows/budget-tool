import type { BudgetFrequency, BudgetState, ExpenseItem } from "./types";

export const MAX_INCOME = 20000;
export const MAX_EXPENSE = 10000;
export const MAX_INVESTMENT = 10000;

export const DEFAULT_STATE: BudgetState = {
  income: 0,
  expenses: [{ name: "Expense", amount: 0, frequency: "monthly" }],
  investments: {
    tfsa: 0,
    fhsa: 0,
    rrsp: 0
  },
  frequencies: {
    income: "monthly",
    investments: "monthly"
  }
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const normalizeAmount = (value: unknown, max: number) =>
  roundMoney(clamp(toNumber(value), 0, max));

const normalizeFrequency = (value: unknown): BudgetFrequency =>
  value === "bi-weekly" ? "bi-weekly" : "monthly";

const normalizeExpense = (
  value: unknown,
  fallbackFrequency: BudgetFrequency
): ExpenseItem | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ExpenseItem>;
  const name = typeof candidate.name === "string" ? candidate.name.slice(0, 64) : "";

  return {
    name: name.trim(),
    amount: normalizeAmount(candidate.amount, MAX_EXPENSE),
    frequency: normalizeFrequency(candidate.frequency ?? fallbackFrequency)
  };
};

export const sanitizeBudgetState = (input: unknown): BudgetState => {
  if (!input || typeof input !== "object") {
    return DEFAULT_STATE;
  }

  const candidate = input as Partial<BudgetState>;
  const expensesRaw = Array.isArray(candidate.expenses) ? candidate.expenses : [];

  const investmentsRaw = candidate.investments ?? {};
  const frequenciesRaw =
    candidate.frequencies && typeof candidate.frequencies === "object"
      ? (candidate.frequencies as Record<string, unknown>)
      : {};
  const defaultExpenseFrequency = normalizeFrequency(frequenciesRaw.expenses);

  const expenses = expensesRaw
    .map((expense) => normalizeExpense(expense, defaultExpenseFrequency))
    .filter((item): item is ExpenseItem => item !== null);

  if (expenses.length === 0) {
    expenses.push({ name: "Expense", amount: 0, frequency: defaultExpenseFrequency });
  }

  return {
    income: normalizeAmount(candidate.income, MAX_INCOME),
    expenses,
    investments: {
      tfsa: normalizeAmount(
        (investmentsRaw as Record<string, unknown>).tfsa,
        MAX_INVESTMENT
      ),
      fhsa: normalizeAmount(
        (investmentsRaw as Record<string, unknown>).fhsa,
        MAX_INVESTMENT
      ),
      rrsp: normalizeAmount(
        (investmentsRaw as Record<string, unknown>).rrsp,
        MAX_INVESTMENT
      )
    },
    frequencies: {
      income: normalizeFrequency(frequenciesRaw.income),
      investments: normalizeFrequency(frequenciesRaw.investments)
    }
  };
};

const toMonthlyAmount = (amount: number, frequency: BudgetFrequency) =>
  frequency === "bi-weekly" ? (amount * 26) / 12 : amount;

export const calculateTotals = (state: BudgetState) => {
  const monthlyIncome = toMonthlyAmount(state.income, state.frequencies.income);
  const totalExpenses = state.expenses.reduce(
    (sum, row) => sum + toMonthlyAmount(row.amount, row.frequency),
    0
  );
  const totalInvestments =
    toMonthlyAmount(state.investments.tfsa, state.frequencies.investments) +
    toMonthlyAmount(state.investments.fhsa, state.frequencies.investments) +
    toMonthlyAmount(state.investments.rrsp, state.frequencies.investments);

  return {
    monthlyIncome: roundMoney(monthlyIncome),
    totalExpenses: roundMoney(totalExpenses),
    totalInvestments: roundMoney(totalInvestments),
    leftover: roundMoney(monthlyIncome - totalExpenses - totalInvestments)
  };
};
