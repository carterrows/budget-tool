import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

declare global {
  var __budgetDb: Database.Database | undefined;
  var __budgetDbPath: string | undefined;
}

const tryEnsureDirectory = (filePath: string): boolean => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    return true;
  } catch {
    return false;
  }
};

const resolveDatabasePath = (): string => {
  const preferredPath = process.env.DATABASE_PATH ?? "/data/budget.db";

  if (tryEnsureDirectory(preferredPath)) {
    return preferredPath;
  }

  const fallbackPath = path.join(process.cwd(), "data", "budget.db");
  tryEnsureDirectory(fallbackPath);
  return fallbackPath;
};

const initDatabase = (db: Database.Database) => {
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS states (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);

    CREATE TABLE IF NOT EXISTS plan_states (
      plan_id INTEGER PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      active_plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  const sessionColumns = db
    .prepare("PRAGMA table_info(sessions)")
    .all() as Array<{ name: string }>;
  const hasActivePlanColumn = sessionColumns.some(
    (column) => column.name === "active_plan_id"
  );

  if (!hasActivePlanColumn) {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN active_plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL"
    );
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_active_plan_id ON sessions(active_plan_id)");
};

const databasePath = global.__budgetDbPath ?? resolveDatabasePath();
const database = global.__budgetDb ?? new Database(databasePath);

if (!global.__budgetDb) {
  initDatabase(database);
  global.__budgetDb = database;
  global.__budgetDbPath = databasePath;
}

export const getDb = () => database;
