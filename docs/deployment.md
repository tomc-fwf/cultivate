# Deployment Runbook — Cultivate

> **Audience:** developers and operators deploying or maintaining the cultivate app on Railway.
> For day-to-day development setup see `README.md`.

---

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| Node.js | ≥ 18 (Docker image uses Node 20) |
| npm | ≥ 9 |
| Railway CLI | `npm i -g @railway/cli` — for first-time deploys and log tailing |
| Git access | Push access to the `master` branch |
| Environment variables | See table below — set in Railway dashboard before first deploy |

### Required environment variables (Railway)

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** | Random 48-byte hex string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DB_PATH` | No | Defaults to `/data/cultivate.db`. Set this to match the Railway volume mount path if changed. |
| `PORT` | No | Automatically injected by Railway. Do not set manually. |
| `NODE_ENV` | No | Set to `production` automatically by Dockerfile. |
| `ALLOWED_ORIGIN` | No | Set to `https://cultivate.hatstak.app` in production. |
| `FARMSTOCK_URL` | No | Enable farmstock crop input catalog integration. Both `FARMSTOCK_URL` and `FARMSTOCK_SERVICE_KEY` must be set together. |
| `FARMSTOCK_SERVICE_KEY` | No | Must match `CULTIVATE_SERVICE_KEY` on the farmstock Railway service. |
| `SENSORPUSH_EMAIL` | No | Enable SensorPush temperature/RH polling. Both `SENSORPUSH_EMAIL` and `SENSORPUSH_PASSWORD` must be set together. |
| `SENSORPUSH_PASSWORD` | No | SensorPush account password. |

See `.env.example` for descriptions of each variable.

---

## Initial setup (local dev)

```bash
# 1. Install backend dependencies
npm install

# 2. Install frontend dependencies
cd client && npm install && cd ..

# 3. Copy and edit environment variables
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET

# 4. Run migrations and start the dev server
npm run dev
# Backend: http://localhost:3002
# Frontend dev server: cd client && npm run dev → http://localhost:5174
```

The database is created automatically at `data/cultivate.db` on first start. The default admin account is seeded with PIN `0000` — change it immediately.

---

## Deploying to Railway

Railway deploys automatically on every push to `master` via the Dockerfile. Manual steps are only needed for first-time setup or environment variable changes.

### First-time setup

1. Create a new Railway project and link the repo.
2. Add a Railway **Volume** mounted at `/data` — this is where the SQLite database lives. Without a volume, the database is lost on every deploy.
3. Set environment variables in the Railway dashboard (Variables tab). At minimum set `JWT_SECRET`.
4. Push to `master` — Railway builds the Docker image and deploys.

### Subsequent deploys

```bash
# Standard deploy — push triggers automatic Railway build
git push origin master

# Check build and deploy logs
railway logs
# or in the Railway dashboard → Deployments → View Logs
```

### Health check

Railway calls `GET /health` to confirm the service started. The endpoint returns `200` when the database is initialized and the server is accepting connections.

```bash
# Verify health from any shell
curl https://cultivate.hatstak.app/health
# Expected: {"status":"ok","db":"ok"}
```

---

## Running the database backup

The backup scripts copy the SQLite database to a timestamped file and keep the 7 most recent backups.

### Linux / Railway volume (bash)

```bash
# Run manually — uses DB_PATH env var if set, otherwise data/cultivate.db
bash scripts/backup.sh

# With explicit paths
DB_PATH=/data/cultivate.db BACKUP_DIR=/data/backups bash scripts/backup.sh

# Add to crontab (run daily at 2 AM)
0 2 * * * DB_PATH=/data/cultivate.db BACKUP_DIR=/data/backups /app/scripts/backup.sh >> /data/backup.log 2>&1
```

### Windows dev machine (PowerShell)

```powershell
# Run manually — uses DB_PATH env var if set, otherwise data\cultivate.db
.\scripts\backup.ps1

# With explicit paths
.\scripts\backup.ps1 -DbPath "C:\projects\cultivate\data\cultivate.db" `
                     -BackupDir "C:\projects\cultivate\data\backups"

# Schedule via Windows Task Scheduler (runs daily at 2 AM)
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
             -Argument "-NonInteractive -File C:\projects\cultivate\scripts\backup.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
Register-ScheduledTask -TaskName "CultivateDbBackup" -Action $action -Trigger $trigger
```

Backups are stored in `data/backups/` (dev) or `/data/backups/` (Railway volume). The script logs each run to stdout.

> **Note on Railway volumes:** Railway does not provide built-in cron. To run backups on a schedule, either (a) add a second Railway service running a cron container, or (b) use a Railway cron job (available in the Jobs section of the dashboard). The `/data` volume must be shared between the main service and the cron job.

---

## Checking Felix is running

Felix is a background Claude Code dispatcher running as a Windows Scheduled Task on the development machine. It is separate from the Railway deployment.

```powershell
# Check Felix task state
Get-ScheduledTask -TaskName Felix | Select-Object State

# Tail the current day's log
Get-Content "C:\Users\Tom\.felix\logs\combined-$(Get-Date -Format yyyy-MM-dd).log" -Tail 30 -Wait

# Start Felix if it is stopped
Start-ScheduledTask -TaskName Felix

# Check the pending inbox
Get-ChildItem "C:\Users\Tom\felix-inbox\pending\"
```

Felix runs tasks against `C:\projects\cultivate`. New tasks are queued by dropping a JSON file into the pending inbox — see `CLAUDE.md` for the task file format.

---

## Troubleshooting

### Felix is hung or not processing tasks

1. Check the log file — Felix logs each task start, output, and completion.
2. Look for a task file stuck in `C:\Users\Tom\felix-inbox\processing\` — Felix moves files there while executing.
3. If a task is stuck: move the file back to `pending\` or delete it, then `Start-ScheduledTask -TaskName Felix`.
4. If Felix itself is unresponsive: `Stop-ScheduledTask -TaskName Felix; Start-ScheduledTask -TaskName Felix`.

### Database is locked (`SQLITE_BUSY` or `database is locked`)

SQLite allows only one writer at a time. In development this usually means two server processes are running against the same file.

```bash
# Find processes holding the DB open (Linux/Mac)
lsof data/cultivate.db

# Windows
handle.exe data\cultivate.db   # Sysinternals Handle tool
```

The app sets `PRAGMA busy_timeout` — transient lock errors usually resolve within a second. Persistent errors indicate a zombie process.

### Migration failed on startup

Knex runs `cv_knex_migrations` to track which migrations have run. If a migration fails mid-way, the DB may be in a partial state.

```bash
# Check which migrations have run
sqlite3 data/cultivate.db "SELECT * FROM cv_knex_migrations ORDER BY id;"

# To roll back the last migration manually (dev only — never on production data)
# Edit the migration's down() function, then:
npx knex migrate:rollback --knexfile src/db/knexfile.ts
```

For production: restore from the most recent backup, fix the migration source, and redeploy.

### Server won't start — `JWT_SECRET` missing warning

The server starts with a dev fallback (`cultivate-dev-secret`) but logs a warning if `JWT_SECRET` is not set in production. Set the variable in the Railway dashboard and redeploy.

### Railway deploy succeeds but health check fails

1. Check deploy logs for migration errors or port binding failures.
2. Verify the Railway volume is mounted at `/data` — if the volume was removed, `initDB()` creates the file in a non-persistent location and subsequent restarts lose all data.
3. Confirm `DB_PATH=/data/cultivate.db` is set (or inherited from Dockerfile `ENV`).

### Farmstock integration returns empty product names

If `FARMSTOCK_URL` / `FARMSTOCK_SERVICE_KEY` are not set, product names in METRC exports and cultivation records fall back to `"Input #N"`. This is expected behavior. To enable real product names, set both variables and confirm the farmstock service is reachable from the cultivate Railway service.

### SensorPush auto-fill not working on forms

1. Confirm `SENSORPUSH_EMAIL` and `SENSORPUSH_PASSWORD` are set.
2. Hit `POST /api/sensors/poll` (admin role required) to trigger a manual poll and check the response.
3. Confirm sensors are assigned to locations in the Sensor Management admin page (`/admin/sensors`).
4. Check that the sensor has reported a reading within the last 30 minutes — stale readings beyond 30 min are flagged as "offline" and auto-fill is skipped.
