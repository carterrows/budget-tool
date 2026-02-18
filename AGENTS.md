# AGENTS.md

## Project Snapshot
- Name: `budget-tool`
- Purpose: self-hosted personal budgeting app with per-user saved state.
- Stack: Next.js App Router, React 19, TypeScript, Tailwind CSS, SQLite (`better-sqlite3`), cookie sessions.
- Deployment model: single Next.js service, usually run in Docker.

## Runtime and Build
- Package scripts:
  - `npm run dev` -> `next dev -p 4050`
  - `npm run build` -> `next build`
  - `npm run start` -> `next start -p 4050`
  - `npm run lint` -> `eslint .`
- `next.config.js` uses:
  - `output: "standalone"`
  - `serverExternalPackages: ["better-sqlite3"]`
- API/DB routes are Node runtime (`export const runtime = "nodejs"` where needed).

## Repository Map
- `app/page.tsx`: login/signup landing page.
- `app/budget/page.tsx`: authenticated budget UI page.
- `components/LoginForm.tsx`: login/signup/dev-login client form.
- `components/BudgetApp.tsx`: main budget editor UI + autosave + summary.
- `app/api/auth/*`: auth endpoints (`login`, `signup`, `logout`, `dev-login`).
- `app/api/me/route.ts`: current authenticated user.
- `app/api/state/route.ts`: load/save budget state.
- `lib/db.ts`: SQLite connection + schema bootstrap.
- `lib/auth.ts`: password hashing, sessions, cookie helpers, dev login helpers.
- `lib/budget-state.ts`: state defaults, validation/sanitization, totals.
- `lib/tax.ts`: Ontario 2026 tax/deduction model.
- `proxy.ts`: `/api/*` rate limiting + API security headers.
- `docker-compose.yml`: production-oriented compose.
- `docker-compose-dev.yml`: local HTTP testing compose.

## Data Model (SQLite)
Database path comes from `DATABASE_PATH` (default `/data/budget.db`, fallback to `./data/budget.db` if needed).

Tables created in `lib/db.ts`:
- `users(id, username UNIQUE, password_hash, created_at)`
- `states(user_id PRIMARY KEY -> users.id, state_json, updated_at)`
- `sessions(id, user_id -> users.id, token_hash UNIQUE, expires_at, created_at)`

Behavior:
- Per-user budget state is stored as JSON in `states.state_json`.
- State is upserted and overwritten on each save (single current snapshot per user).
- Session cleanup of expired rows runs periodically in-process.

## Auth and Session Model
- Session cookie name: `budget_session`.
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` controlled by `SECURE_COOKIES`.
- Session TTL: 30 days.
- Password hashing: `bcryptjs` (cost 12).
- CSRF check for mutating auth/state routes: `Origin` host must match request host (`lib/csrf.ts`).
- Dev login:
  - Enabled only when `NODE_ENV !== "production"` and `DEV_LOGIN_ENABLED !== "false"`.
  - Uses/creates user from `DEV_LOGIN_USERNAME` (default `dev-user`).

## API Surface
- `POST /api/auth/signup`
  - Requires `ALLOW_SIGNUP === "true"`.
  - Username regex: `^[a-z0-9_-]{3,32}$`.
  - Password length: 8-128.
- `POST /api/auth/login`
  - Validates credentials and sets session cookie.
- `POST /api/auth/logout`
  - Revokes current session token and clears cookie.
- `POST /api/auth/dev-login`
  - Non-production helper login.
- `GET /api/me`
  - Returns `{ username }` when authenticated, else 401.
- `GET /api/state`
  - Returns saved state or `DEFAULT_STATE`.
- `PUT /api/state`
  - Sanitizes and upserts submitted state.

## Budget Domain Rules
Sanitization happens server-side in `lib/budget-state.ts`.

Key limits:
- `yearlySalary <= 500000`
- bonus amount `<= 100000`
- bonus percent `<= 100`
- each expense `<= 10000`
- each investment bucket (`tfsa/fhsa/rrsp`) `<= 10000`

Frequency options:
- `"monthly"` or `"bi-weekly"` (converted to monthly equivalent in totals).

Client behavior:
- `components/BudgetApp.tsx` autosaves with ~800ms debounce after edits.
- Summary computes monthly net income, expenses, investments, leftover cash.

## Rate Limiting and Security Headers
`proxy.ts` applies to `/api/:path*`:
- Auth endpoints (`/api/auth/*`): stricter rate limit.
- Other API endpoints: general rate limit.
- Adds `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- Configurable with env vars below.

## Environment Variables
- `PORT` (default `4050`)
- `HOSTNAME` (default `0.0.0.0`)
- `DATABASE_PATH` (default `/data/budget.db`)
- `ALLOW_SIGNUP` (`"true"`/`"false"`)
- `SECURE_COOKIES` (`"true"`/`"false"`)
- `DEV_LOGIN_ENABLED` (`"false"` disables dev login in dev)
- `DEV_LOGIN_USERNAME` (defaults to `dev-user`)
- `API_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `API_RATE_LIMIT_GENERAL_MAX` (default `120`)
- `API_RATE_LIMIT_AUTH_MAX` (default `15`)

## Docker Notes
- Production compose (`docker-compose.yml`):
  - binds `127.0.0.1:4050:4050`
  - uses named volume `budget_data` mounted at `/data`
  - sets `SECURE_COOKIES: "true"`
  - sets API rate limit env vars
  - currently sets `ALLOW_SIGNUP: "true"` in file
- Dev compose (`docker-compose-dev.yml`):
  - binds `4050:4050`
  - uses `SECURE_COOKIES: "false"`

## Known Context/Gotchas
- `README.md` text about production `ALLOW_SIGNUP` may differ from current `docker-compose.yml`; check compose file as source of truth.
- There is no automated test suite in this repo right now.
- If adding DB-using API routes, keep Node runtime and server-only imports (`better-sqlite3`).
