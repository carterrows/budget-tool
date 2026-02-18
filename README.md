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

## Quick Start (Docker on Raspberry Pi 5)
1. From repo root:
   ```bash
   docker compose up --build -d
   ```
2. Open:
   ```text
   http://<pi-ip>:4050
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
  - `SECURE_COOKIES: "false"` for HTTP on local LAN (default in compose)
  - Set `SECURE_COOKIES: "true"` when serving over HTTPS

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

Example for host port `5050`:
```yaml
environment:
  PORT: 4050
ports:
  - "5050:4050"
```

Then:
```bash
docker compose up -d --build
```
