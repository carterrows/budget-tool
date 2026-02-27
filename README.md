# Budget Tool

Self-hosted personal budgeting app built with Next.js App Router, TypeScript, Tailwind CSS, SQLite, and cookie sessions.

The app supports up to 3 budget plans per user and keeps user state isolated by account.

![Budget Tool demo](public/demo.gif)

## Features
- Username/password auth with server-side sessions.
- Optional dev login shortcut outside production.
- Multi-plan support:
  - up to 3 plans per user
  - switch, create, rename, and delete plans
  - dedicated plans management page
- Budget editor with:
  - yearly salary
  - bonus (none, fixed amount, or % of salary)
  - expenses (monthly or bi-weekly frequency)
  - investments: `tfsa`, `fhsa`, `rrsp`, `emergencyFund` (monthly or bi-weekly per bucket)
- Autosave (~800ms debounce) to SQLite state for the active plan.
- Monthly summary: net income, total expenses, total investments, leftover cash.
- Expanded summary popup: allocation percentages, coverage ratio, and 12-month projections.
- Ontario 2026 income tax/deduction model used for monthly net income.

## Tech Stack
- Next.js 16 App Router (single service)
- React 19 + TypeScript
- Tailwind CSS
- SQLite via `better-sqlite3`
- `bcryptjs` password hashing
- Cookie sessions (`HttpOnly`, `SameSite=Lax`)

## Local Development
1. Install dependencies:
   ```bash
   npm ci
   ```
2. Start dev server:
   ```bash
   npm run dev
   ```
3. Open:
   - `http://localhost:4050`

Notes:
- `Sign Up` is enabled only when `ALLOW_SIGNUP=true`.
- `Continue as Dev User` is available only when:
  - `NODE_ENV !== "production"`
  - `DEV_LOGIN_ENABLED !== "false"`
- `DEV_LOGIN_USERNAME` defaults to `dev-user` and must match `^[a-z0-9_-]{3,32}$`.

## Production Docker (`docker-compose.yml`)
Run:
```bash
docker compose up --build -d
```

Current production-oriented defaults:
- `NODE_ENV: production`
- `PORT: 4050`
- `HOSTNAME: 0.0.0.0`
- `DATABASE_PATH: /data/budget.db`
- `ALLOW_SIGNUP: "false"`
- `SECURE_COOKIES: "true"` (expects HTTPS)
- Rate limits enabled for all `/api/*`
- Host bind: `127.0.0.1:4050:4050`

## Local HTTP Docker Testing (`docker-compose-dev.yml`)
Run:
```bash
docker compose -f docker-compose-dev.yml up --build -d
```

Current defaults:
- `NODE_ENV: production`
- `ALLOW_SIGNUP: "true"`
- `SECURE_COOKIES: "false"`
- Host bind: `4050:4050`
- Uses host-native container architecture by default (faster on Windows/x86_64 and ARM hosts).

Important:
- Because this file sets `NODE_ENV: production`, dev login is disabled in this mode.
- If you need to force ARM images on non-ARM hosts, set `DOCKER_DEFAULT_PLATFORM=linux/arm64` before running compose.

## Environment Variables
- `PORT` (default `4050`)
- `HOSTNAME` (default `0.0.0.0`)
- `DATABASE_PATH` (default `/data/budget.db`, fallback `./data/budget.db` if directory creation fails)
- `ALLOW_SIGNUP` (`"true"` or `"false"`)
- `SECURE_COOKIES` (`"true"` or `"false"`)
- `DEV_LOGIN_ENABLED` (`"false"` disables dev login outside production)
- `DEV_LOGIN_USERNAME` (default `dev-user`)
- `API_RATE_LIMIT_WINDOW_MS` (default `60000`, clamped)
- `API_RATE_LIMIT_GENERAL_MAX` (default `120`, clamped)
- `API_RATE_LIMIT_AUTH_MAX` (default `15`, clamped)

## Authentication and Sessions
- Session cookie: `budget_session`
- Session TTL: 30 days
- Session storage table: `sessions`
- Expired session cleanup runs in-process periodically during requests
- Mutating auth/state/plan routes enforce origin/host match (`Origin` vs `Host`/`X-Forwarded-Host`)

## API Endpoints
- `POST /api/auth/signup`
  - Requires `ALLOW_SIGNUP === "true"`
  - Username: `^[a-z0-9_-]{3,32}$`
  - Password length: `8-128`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/dev-login` (non-production only, if enabled)
- `GET /api/me` -> returns `{ username }` when authenticated
- `GET /api/state` -> returns state for active plan and plan metadata
- `PUT /api/state` -> sanitizes and saves full current state for active plan
- `GET /api/plans` -> returns plans list, active plan id, max plans
- `POST /api/plans` -> creates a new default-state plan and makes it active
- `POST /api/plans/switch` -> sets active plan for current session
- `PATCH /api/plans/:planId` -> renames plan
- `DELETE /api/plans/:planId` -> deletes plan (cannot delete last remaining plan)

## Budget Limits and Sanitization
Server-side sanitization happens in `lib/budget-state.ts`.

Limits:
- `yearlySalary <= 500000`
- bonus amount `<= 100000`
- bonus percent `<= 100`
- each expense amount `<= 10000`
- each investment bucket (`tfsa`, `fhsa`, `rrsp`, `emergencyFund`) `<= 10000`

Frequency values:
- `monthly`
- `bi-weekly` (converted to monthly equivalent for totals)

## Database Model
Tables:
- `users(id, username UNIQUE, password_hash, created_at)`
- `plans(id, user_id, name, created_at, updated_at)`
- `plan_states(plan_id PRIMARY KEY, state_json, updated_at)`
- `sessions(id, user_id, token_hash UNIQUE, active_plan_id, expires_at, created_at)`

State persistence:
- one JSON snapshot per plan in `plan_states.state_json`
- active plan stored per session in `sessions.active_plan_id`
- overwrite-on-save via upsert for active plan

## API Security Headers and Rate Limits
Applied by `proxy.ts` on `/api/:path*`.

Headers:
- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: same-origin`
- `Content-Security-Policy: default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
- `Permissions-Policy` (sensitive browser APIs disabled)
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-DNS-Prefetch-Control: off`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` on `429`

Default limits:
- `/api/auth/*`: 15 requests / 60 seconds / client IP
- other `/api/*`: 120 requests / 60 seconds / client IP

## Backup
Back up `/data/budget.db` from the volume/container.

Examples:
```bash
docker compose exec budget-app sh -c "cp /data/budget.db /data/budget-backup.db"
```

```bash
docker cp <container_id>:/data/budget.db ./budget.db
```

## Ports
To change host port, update:
- `ports` mapping in compose
- `PORT` environment value if container port changes

Example (host `5050` -> container `4050`):
```yaml
environment:
  PORT: 4050
ports:
  - "127.0.0.1:5050:4050"
```

Then rebuild/restart:
```bash
docker compose up -d --build
```

## Scripts
- `npm run dev` -> `next dev -p 4050`
- `npm run build` -> `next build`
- `npm run start` -> `next start -p 4050`
- `npm run lint` -> `eslint .`

## Current Gaps
- No automated test suite is configured yet.
