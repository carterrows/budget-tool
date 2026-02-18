export type ExpenseItem = {
  name: string;
  amount: number;
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
};
