import { DEFAULT_STATE, sanitizeBudgetState } from "./budget-state";
import { getDb } from "./db";
import { MAX_PLANS_PER_USER } from "./plan-config";
import type { BudgetState, InvestmentState } from "./types";

export { MAX_PLANS_PER_USER };

type PlanRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type StateRow = {
  state_json: string;
};

type OwnedStateRow = {
  state_json: string | null;
};

type SessionActivePlanRow = {
  active_plan_id: number | null;
};

export type BudgetPlan = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type PlanErrorCode =
  | "PLAN_LIMIT_REACHED"
  | "PLAN_NOT_FOUND"
  | "LAST_PLAN_DELETE_BLOCKED"
  | "INVALID_PLAN_NAME"
  | "INVALID_PLAN_COPY_SELECTION";

type InvestmentField = keyof InvestmentState;

const INVESTMENT_FIELDS: InvestmentField[] = [
  "tfsa",
  "fhsa",
  "rrsp",
  "emergencyFund"
];

export class PlanOperationError extends Error {
  code: PlanErrorCode;

  constructor(code: PlanErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const MAX_PLAN_NAME_LENGTH = 40;

const sanitizePlanName = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_PLAN_NAME_LENGTH) {
    return null;
  }

  return trimmed;
};

type CreatePlanCopyIncomeInput = {
  planId: number;
};

type CreatePlanCopyExpensesInput = {
  planId: number;
  expenseIndexes: number[];
};

type CreatePlanCopyInvestmentsInput = {
  planId: number;
  fields: InvestmentField[];
};

type CreatePlanCopyInput = {
  income?: CreatePlanCopyIncomeInput | null;
  expenses?: CreatePlanCopyExpensesInput | null;
  investments?: CreatePlanCopyInvestmentsInput | null;
};

const toPositiveInteger = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
};

const parseCopyIncomeInput = (input: unknown): CreatePlanCopyIncomeInput | null => {
  if (input === undefined || input === null) {
    return null;
  }

  if (!input || typeof input !== "object") {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Invalid income copy selection."
    );
  }

  const planId = toPositiveInteger((input as Record<string, unknown>).planId);
  if (!planId) {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Income copy requires a valid source plan."
    );
  }

  return { planId };
};

const parseCopyExpensesInput = (input: unknown): CreatePlanCopyExpensesInput | null => {
  if (input === undefined || input === null) {
    return null;
  }

  if (!input || typeof input !== "object") {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Invalid expenses copy selection."
    );
  }

  const candidate = input as Record<string, unknown>;
  const planId = toPositiveInteger(candidate.planId);
  if (!planId) {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Expenses copy requires a valid source plan."
    );
  }

  if (!Array.isArray(candidate.expenseIndexes)) {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Expenses copy requires selected entries."
    );
  }

  const normalized = new Set<number>();
  for (const value of candidate.expenseIndexes) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new PlanOperationError(
        "INVALID_PLAN_COPY_SELECTION",
        "Expenses copy contains invalid entries."
      );
    }
    normalized.add(value);
  }

  return {
    planId,
    expenseIndexes: [...normalized].sort((left, right) => left - right)
  };
};

const parseCopyInvestmentsInput = (
  input: unknown
): CreatePlanCopyInvestmentsInput | null => {
  if (input === undefined || input === null) {
    return null;
  }

  if (!input || typeof input !== "object") {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Invalid investments copy selection."
    );
  }

  const candidate = input as Record<string, unknown>;
  const planId = toPositiveInteger(candidate.planId);
  if (!planId) {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Investments copy requires a valid source plan."
    );
  }

  if (!Array.isArray(candidate.fields)) {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Investments copy requires selected entries."
    );
  }

  const normalized = new Set<InvestmentField>();
  for (const value of candidate.fields) {
    if (typeof value !== "string" || !INVESTMENT_FIELDS.includes(value as InvestmentField)) {
      throw new PlanOperationError(
        "INVALID_PLAN_COPY_SELECTION",
        "Investments copy contains invalid entries."
      );
    }
    normalized.add(value as InvestmentField);
  }

  return {
    planId,
    fields: [...normalized]
  };
};

const parseCreatePlanCopyInput = (input: unknown): CreatePlanCopyInput => {
  if (input === undefined || input === null) {
    return {};
  }

  if (!input || typeof input !== "object") {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Invalid create plan options."
    );
  }

  const copyCandidate = (input as Record<string, unknown>).copy;
  if (copyCandidate === undefined || copyCandidate === null) {
    return {};
  }

  if (!copyCandidate || typeof copyCandidate !== "object") {
    throw new PlanOperationError(
      "INVALID_PLAN_COPY_SELECTION",
      "Invalid plan copy options."
    );
  }

  const source = copyCandidate as Record<string, unknown>;
  return {
    income: parseCopyIncomeInput(source.income),
    expenses: parseCopyExpensesInput(source.expenses),
    investments: parseCopyInvestmentsInput(source.investments)
  };
};

const toPlan = (row: PlanRow): BudgetPlan => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const getPlanRowsForUser = (userId: number): PlanRow[] => {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT id, name, created_at, updated_at
      FROM plans
      WHERE user_id = ?
      ORDER BY id ASC
      `
    )
    .all(userId) as PlanRow[];
};

const getNextPlanName = (existingNames: string[]): string => {
  for (let index = 1; index <= MAX_PLANS_PER_USER; index += 1) {
    const candidate = `Plan ${index}`;
    if (!existingNames.includes(candidate)) {
      return candidate;
    }
  }

  return `Plan ${existingNames.length + 1}`;
};

export const ensureUserPlansInitialized = (userId: number) => {
  const existingPlans = getPlanRowsForUser(userId);
  if (existingPlans.length > 0) {
    return existingPlans.map(toPlan);
  }

  const db = getDb();
  const initialize = db.transaction((targetUserId: number) => {
    const currentPlans = getPlanRowsForUser(targetUserId);
    if (currentPlans.length > 0) {
      return currentPlans;
    }

    const now = new Date().toISOString();
    const created = db
      .prepare("INSERT INTO plans (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(targetUserId, "Plan 1", now, now);
    const planId = Number(created.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO plan_states (plan_id, state_json, updated_at)
      VALUES (?, ?, ?)
      `
    ).run(planId, JSON.stringify(DEFAULT_STATE), now);

    db.prepare(
      `
      UPDATE sessions
      SET active_plan_id = ?
      WHERE user_id = ? AND active_plan_id IS NULL
      `
    ).run(planId, targetUserId);

    return getPlanRowsForUser(targetUserId);
  });

  return initialize(userId).map(toPlan);
};

const getPlanForUserOrNull = (userId: number, planId: number): BudgetPlan | null => {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT id, name, created_at, updated_at
      FROM plans
      WHERE user_id = ? AND id = ?
      LIMIT 1
      `
    )
    .get(userId, planId) as PlanRow | undefined;

  return row ? toPlan(row) : null;
};

const getSessionActivePlanId = (sessionId: number, userId: number): number | null => {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT active_plan_id
      FROM sessions
      WHERE id = ? AND user_id = ?
      LIMIT 1
      `
    )
    .get(sessionId, userId) as SessionActivePlanRow | undefined;

  return row?.active_plan_id ?? null;
};

const loadOwnedPlanState = (userId: number, planId: number): BudgetState => {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT ps.state_json
      FROM plans p
      LEFT JOIN plan_states ps ON ps.plan_id = p.id
      WHERE p.user_id = ? AND p.id = ?
      LIMIT 1
      `
    )
    .get(userId, planId) as OwnedStateRow | undefined;

  if (!row) {
    throw new PlanOperationError("PLAN_NOT_FOUND", "Plan not found.");
  }

  if (!row.state_json) {
    return DEFAULT_STATE;
  }

  try {
    return sanitizeBudgetState(JSON.parse(row.state_json));
  } catch {
    return DEFAULT_STATE;
  }
};

const buildPlanStateFromCopyInput = (userId: number, input: unknown): BudgetState => {
  const copy = parseCreatePlanCopyInput(input);
  const hasCopySelection = Boolean(copy.income || copy.expenses || copy.investments);
  if (!hasCopySelection) {
    return DEFAULT_STATE;
  }

  const nextState = sanitizeBudgetState(DEFAULT_STATE);
  const sourceStates = new Map<number, BudgetState>();
  const getSourceState = (planId: number) => {
    const existing = sourceStates.get(planId);
    if (existing) {
      return existing;
    }

    const loaded = loadOwnedPlanState(userId, planId);
    sourceStates.set(planId, loaded);
    return loaded;
  };

  if (copy.income) {
    const source = getSourceState(copy.income.planId);
    nextState.yearlySalary = source.yearlySalary;
    nextState.bonusType = source.bonusType;
    nextState.bonusValue = source.bonusValue;
    nextState.rrspIncome2025 = source.rrspIncome2025;
  }

  if (copy.expenses) {
    const source = getSourceState(copy.expenses.planId);
    const selected = new Set(copy.expenses.expenseIndexes);
    const selectedExpenses = source.expenses
      .filter((_, index) => selected.has(index))
      .map((expense) => ({ ...expense }));
    if (selectedExpenses.length > 0) {
      nextState.expenses = selectedExpenses;
    }
  }

  if (copy.investments) {
    const source = getSourceState(copy.investments.planId);
    for (const field of copy.investments.fields) {
      nextState.investments[field] = source.investments[field];
      nextState.frequencies.investments[field] = source.frequencies.investments[field];
    }
  }

  return sanitizeBudgetState(nextState);
};

const setSessionActivePlanId = (sessionId: number, userId: number, planId: number) => {
  const db = getDb();
  db.prepare(
    `
    UPDATE sessions
    SET active_plan_id = ?
    WHERE id = ? AND user_id = ?
    `
  ).run(planId, sessionId, userId);
};

export const listPlansForSession = (
  userId: number,
  sessionId: number,
  activePlanId: number | null
) => {
  const plans = ensureUserPlansInitialized(userId);
  const selectedPlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0];

  if (!selectedPlan) {
    throw new Error("Unable to resolve a plan for the current user.");
  }

  if (selectedPlan.id !== activePlanId) {
    setSessionActivePlanId(sessionId, userId, selectedPlan.id);
  }

  return {
    plans,
    activePlanId: selectedPlan.id
  };
};

export const getActivePlanForSession = (
  userId: number,
  sessionId: number,
  activePlanId: number | null
) => {
  const resolved = listPlansForSession(userId, sessionId, activePlanId);
  const activePlan = resolved.plans.find((plan) => plan.id === resolved.activePlanId);

  if (!activePlan) {
    throw new Error("Unable to resolve active plan.");
  }

  return activePlan;
};

export const getPlanStateForUser = (userId: number, planId: number) => {
  ensureUserPlansInitialized(userId);
  const plan = getPlanForUserOrNull(userId, planId);

  if (!plan) {
    throw new PlanOperationError("PLAN_NOT_FOUND", "Plan not found.");
  }

  const state = loadOwnedPlanState(userId, planId);

  return {
    plan,
    state
  };
};

export const switchActivePlanForSession = (userId: number, sessionId: number, planId: number) => {
  ensureUserPlansInitialized(userId);
  const plan = getPlanForUserOrNull(userId, planId);

  if (!plan) {
    throw new PlanOperationError("PLAN_NOT_FOUND", "Plan not found.");
  }

  setSessionActivePlanId(sessionId, userId, plan.id);
  return plan;
};

export const createPlanForSession = (
  userId: number,
  sessionId: number,
  createOptionsInput?: unknown
) => {
  ensureUserPlansInitialized(userId);
  const db = getDb();

  const create = db.transaction(
    (
      targetUserId: number,
      targetSessionId: number,
      targetCreateOptionsInput: unknown
    ) => {
      const plans = getPlanRowsForUser(targetUserId);
      if (plans.length >= MAX_PLANS_PER_USER) {
        throw new PlanOperationError("PLAN_LIMIT_REACHED", "Plan limit reached.");
      }

      const now = new Date().toISOString();
      const planName = getNextPlanName(plans.map((plan) => plan.name));
      const initialState = buildPlanStateFromCopyInput(
        targetUserId,
        targetCreateOptionsInput
      );
      const created = db
        .prepare("INSERT INTO plans (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(targetUserId, planName, now, now);
      const planId = Number(created.lastInsertRowid);

      db.prepare(
        `
        INSERT INTO plan_states (plan_id, state_json, updated_at)
        VALUES (?, ?, ?)
        `
      ).run(planId, JSON.stringify(initialState), now);

      db.prepare(
        `
        UPDATE sessions
        SET active_plan_id = ?
        WHERE id = ? AND user_id = ?
        `
      ).run(planId, targetSessionId, targetUserId);

      const createdPlan = getPlanForUserOrNull(targetUserId, planId);
      if (!createdPlan) {
        throw new Error("Unable to create plan.");
      }

      return {
        plan: createdPlan,
        plans: getPlanRowsForUser(targetUserId).map(toPlan)
      };
    }
  );

  const result = create(userId, sessionId, createOptionsInput);

  return {
    ...result,
    activePlanId: result.plan.id
  };
};

export const deletePlanForSession = (userId: number, sessionId: number, planId: number) => {
  ensureUserPlansInitialized(userId);
  const db = getDb();

  const remove = db.transaction((targetUserId: number, targetSessionId: number, targetPlanId: number) => {
    const plans = getPlanRowsForUser(targetUserId);
    const hasPlan = plans.some((plan) => plan.id === targetPlanId);

    if (!hasPlan) {
      throw new PlanOperationError("PLAN_NOT_FOUND", "Plan not found.");
    }

    if (plans.length <= 1) {
      throw new PlanOperationError(
        "LAST_PLAN_DELETE_BLOCKED",
        "At least one plan is required."
      );
    }

    db.prepare("DELETE FROM plans WHERE id = ? AND user_id = ?").run(targetPlanId, targetUserId);

    const remaining = getPlanRowsForUser(targetUserId).map(toPlan);
    const sessionActivePlanId = getSessionActivePlanId(targetSessionId, targetUserId);
    const activePlanStillValid = remaining.some((plan) => plan.id === sessionActivePlanId);
    const nextActivePlan = activePlanStillValid
      ? (sessionActivePlanId as number)
      : remaining[0]?.id;

    if (!nextActivePlan) {
      throw new Error("Unable to resolve remaining plan.");
    }

    if (!activePlanStillValid) {
      setSessionActivePlanId(targetSessionId, targetUserId, nextActivePlan);
    }

    return {
      plans: remaining,
      activePlanId: nextActivePlan
    };
  });

  return remove(userId, sessionId, planId);
};

export const renamePlanForSession = (
  userId: number,
  sessionId: number,
  planId: number,
  nextNameInput: unknown
) => {
  ensureUserPlansInitialized(userId);
  const nextName = sanitizePlanName(nextNameInput);

  if (!nextName) {
    throw new PlanOperationError(
      "INVALID_PLAN_NAME",
      "Plan name must be between 1 and 40 characters."
    );
  }

  const db = getDb();
  const update = db.transaction(
    (
      targetUserId: number,
      targetSessionId: number,
      targetPlanId: number,
      targetName: string
    ) => {
      const existingPlan = getPlanForUserOrNull(targetUserId, targetPlanId);
      if (!existingPlan) {
        throw new PlanOperationError("PLAN_NOT_FOUND", "Plan not found.");
      }

      const now = new Date().toISOString();
      db.prepare(
        `
        UPDATE plans
        SET name = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        `
      ).run(targetName, now, targetPlanId, targetUserId);

      const sessionActivePlanId = getSessionActivePlanId(targetSessionId, targetUserId);
      const listPayload = listPlansForSession(
        targetUserId,
        targetSessionId,
        sessionActivePlanId
      );
      const activePlan = listPayload.plans.find(
        (plan) => plan.id === listPayload.activePlanId
      );

      if (!activePlan) {
        throw new Error("Unable to resolve active plan.");
      }

      return {
        ...listPayload,
        activePlan
      };
    }
  );

  return update(userId, sessionId, planId, nextName);
};

export const loadPlanState = (planId: number): BudgetState => {
  const db = getDb();
  const row = db
    .prepare("SELECT state_json FROM plan_states WHERE plan_id = ? LIMIT 1")
    .get(planId) as StateRow | undefined;

  if (!row) {
    return DEFAULT_STATE;
  }

  try {
    return sanitizeBudgetState(JSON.parse(row.state_json));
  } catch {
    return DEFAULT_STATE;
  }
};

export const savePlanState = (planId: number, stateInput: unknown) => {
  const db = getDb();
  const state = sanitizeBudgetState(stateInput);
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO plan_states (plan_id, state_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(plan_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
    `
  ).run(planId, JSON.stringify(state), now);

  db.prepare("UPDATE plans SET updated_at = ? WHERE id = ?").run(now, planId);

  return {
    state,
    updatedAt: now
  };
};
