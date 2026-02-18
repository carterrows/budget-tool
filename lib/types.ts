export type BudgetFrequency = "monthly" | "bi-weekly";
export type BonusType = "none" | "amount" | "percentage";

export type ExpenseItem = {
  name: string;
  amount: number;
  frequency: BudgetFrequency;
};

export type BudgetFrequencies = {
  investments: BudgetFrequency;
};

export type InvestmentState = {
  tfsa: number;
  fhsa: number;
  rrsp: number;
};

export type BudgetState = {
  yearlySalary: number;
  bonusType: BonusType;
  bonusValue: number;
  expenses: ExpenseItem[];
  investments: InvestmentState;
  frequencies: BudgetFrequencies;
};
