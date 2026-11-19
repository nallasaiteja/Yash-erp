# Yash Power Tech ERP

AI-powered office, tender and project automation platform, built from
`Yash_Power_Tech_AI_Automation_Master_Development_Prompt.pdf`.

**Status: Phase 1 (Core ERP)**: authentication, users, roles & permissions, dashboard,
employees & HR, departments, attendance, leave, tasks, document repository, audit log.

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4, Recharts (`web/`) |
| Backend  | Python 3.12, FastAPI, SQLAlchemy 2, Alembic (`backend/`) |
| Database | PostgreSQL 16 (Docker) |

## Run

Requires Docker Desktop (running) and Node 20+.

```powershell
cd C:\Users\srika\yash-erp
docker compose up -d            # Postgres + API (migrations + seed run automatically)
cd web
npm install                     # first time only
npm run build; npm run start    # or: npm run dev
```

Open http://localhost:3000. API docs: http://localhost:8000/api/docs

First login: `admin@yashpowertech.local` / `Admin@12345` (change it under **My profile**).
Override with `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `JWT_SECRET` / `POSTGRES_PASSWORD` in a `.env` file next to `docker-compose.yml` before first start.

## Deploy to Render (public website)

The root `Dockerfile` builds one service: the web app is exported as static files and served by
FastAPI, so the site and the API share one address. `render.yaml` adds a Postgres database.
Uploaded files are stored in Postgres (`STORAGE=db`) because Render web services have no persistent disk.

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, connect GitHub, pick this repo.
3. Enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` when asked (this becomes the first login), then **Apply**.
4. The first build takes about 5–10 minutes. The site is at `https://yash-power-tech-erp.onrender.com` (or whatever Render shows).

Free plan limits: the service sleeps after 15 minutes idle (the first visit then takes about 1 minute), and the
free database **expires after 30 days**. For a permanent site, upgrade the web service to Starter and the
database to Basic in the Render dashboard (about $13/month total). Every `git push` to `main` redeploys.

## Tests

```powershell
docker cp backend/tests yash-api:/app/tests
docker exec yash-api pytest -q tests
```
(They create uniquely named test records. Reset the DB with `docker compose down -v`.)

## Security in Phase 1
- 15-minute JWT access tokens in memory, plus rotating refresh tokens in an httpOnly SameSite=Strict cookie.
  Reusing a rotated token revokes the whole session family.
- bcrypt password hashing, login rate limiting, permission checks on every endpoint, audit log of sensitive actions.
- Uploads: extension allow-list, 50 MB limit, SHA-256 duplicate detection, HR documents restricted.

Not yet done (planned for Phase 6, per the spec): MFA, malware scanning of uploads, encryption at rest,
object storage (files are on a Docker volume), backups/monitoring, HTTPS deployment.

## Adding a database change
Edit `backend/app/models.py`, then:
```powershell
docker compose run --rm --no-deps -v "${PWD}\backend:/app" api alembic revision --autogenerate -m "describe change"
docker compose up -d --build api
```

## Roadmap (from the spec)
2. AI Tender: discovery, OCR, analysis, eligibility, BOQ, deadline alerts
3. Projects & Procurement · 4. Finance, CRM, Contracts, Email/WhatsApp
5. AI agents, NL assistant, workflow builder, BI · 6. Production hardening & deployment
