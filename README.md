# Budget Tool v1

Self-hosted personal budgeting app built with Next.js App Router, TypeScript, Tailwind CSS, SQLite, and cookie sessions.  
This version stores one current budget state per user and keeps user data isolated.

## Stack
- Next.js (single service)
- TypeScript
- Tailwind CSS
- SQLite at `/data/budget.db`
- Route handlers for API (`/api/*`)
- Password hashing with bcrypt (`bcryptjs`)
- HttpOnly session cookies (`SameSite=Lax`)

## Local Development (`npm run dev`)
- Run:
  ```bash
  npm run dev
  ```
- In development, the login page shows **Continue as Dev User** by default.  
  Clicking it creates/uses a local dev account and signs you in without manual signup.
- Optional overrides:
  - `DEV_LOGIN_ENABLED=false` disables this button
  - `DEV_LOGIN_USERNAME=your-name` changes the dev account username (must match username rules)

## Quick Start (Docker on Raspberry Pi 5)
1. From repo root:
   ```bash
   docker compose up --build -d
   ```
2. Open:
   ```text
   Through your HTTPS reverse proxy (recommended production setup)
   ```
3. Note:
   - `docker-compose.yml` is production-oriented: binds to `127.0.0.1:4050` and sets `SECURE_COOKIES=true`.
   - For local HTTP testing, use:
     ```bash
     docker compose -f docker-compose-dev.yml up --build -d
     ```

## Create Initial Users
This app uses a **Create Account (Sign Up) page** guarded by `ALLOW_SIGNUP`.

- In `docker-compose.yml`, keep:
  ```yaml
  ALLOW_SIGNUP: "true"
  ```
- Visit `/` and create accounts (for you and your girlfriend).
- After both accounts exist, set:
  ```yaml
  ALLOW_SIGNUP: "false"
  ```
  then restart:
  ```bash
  docker compose up -d --build
  ```

Username rules:
- 3-32 chars
- lowercase letters, numbers, `_`, `-`

## Database Persistence
- SQLite file path in container: `/data/budget.db`
- Docker named volume: `budget_data`
- Cookie security:
  - Production compose uses `SECURE_COOKIES: "true"` (HTTPS required)
  - Dev compose uses `SECURE_COOKIES: "false"` for plain HTTP testing

State is stored per user in `states.state_json` and overwritten on each save (no month history in v1).

## Backup
Back up by copying `/data/budget.db` from the container volume.

Example:
```bash
docker compose exec budget-app sh -c "cp /data/budget.db /data/budget-backup.db"
```

Or copy directly from the running container:
```bash
docker cp <container_id>:/data/budget.db ./budget.db
```

## Change Port
Edit `docker-compose.yml`:
- `ports` mapping (left side is host port)
- `PORT` environment variable (must match container port)

Example for host port `5050` on localhost-only bind:
```yaml
environment:
  PORT: 4050
ports:
  - "127.0.0.1:5050:4050"
```

Then:
```bash
docker compose up -d --build
```
