export type BudgetFrequency = "monthly" | "bi-weekly";

export type ExpenseItem = {
  name: string;
  amount: number;
  frequency: BudgetFrequency;
};

export type BudgetFrequencies = {
  income: BudgetFrequency;
  investments: BudgetFrequency;
};

export type InvestmentState = {
  tfsa: number;
  fhsa: number;
  rrsp: number;
};

export type BudgetState = {
  income: number;
  expenses: ExpenseItem[];
  investments: InvestmentState;
  frequencies: BudgetFrequencies;
};
