# ServiceNow Interview Questions Platform

A role-based web app for organizing and studying ServiceNow interview questions by module, with writer/admin content management, security-question password recovery, and multi-format import/export.

## Adjustments made to the original spec

Two conflicts in the requirements were resolved before implementation (see conversation for full rationale):

1. **Writer permissions**: §1 said writers can only edit/delete *their own* questions; the permission table and §6.5 said writers have full edit/delete rights over *all* questions. Implemented the broader rule (table + §6.5) since it was stated twice and is simpler to reason about — writers and admins both have full content rights; only user/role management is admin-only.
2. **Favorites duplication**: the schema had both a `favorites` table and an `is_favorite_for` JSON column on `questions`. Kept only the `favorites` table (relational, avoids drift).

Scope trims from the original doc (flagged, not silently dropped): scheduled/automated exports and outbound email notifications are not implemented — both require a job scheduler / mail service outside this app's runtime. In-app notifications (bell icon) are implemented as the practical substitute for the "notify writer when their question is edited" requirement.

## Stack

- **Backend**: Node.js/Express, Prisma ORM, SQLite by default (zero setup) — schema is written to be Postgres-compatible, see below.
- **Frontend**: React + Vite + Tailwind CSS, Monaco Editor (bundled locally, not CDN-loaded) for code-format questions.
- **Auth**: JWT + bcrypt. Password reset is security-question-only, per spec (no email).

## Project layout

```
backend/    Express API, Prisma schema, Jest+Supertest test suite
frontend/   React SPA
docker-compose.yml, backend/Dockerfile, frontend/Dockerfile
```

## Local setup

### Backend

```bash
cd backend
npm install
cp .env.example .env        # edit JWT_SECRET before anything but local dev
npx prisma db push          # creates dev.db (SQLite)
npm run seed                # optional: sample ServiceNow modules/questions
npm run dev                 # http://localhost:4000
```

The seed script creates an admin user `admin` / `AdminPass123` if no admin exists yet — **change this password immediately if you seed a shared environment.** Alternatively, register through the UI: the *first* user to register on an empty database automatically becomes admin.

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to localhost:4000
```

### Running tests

```bash
cd backend
npm test                    # 68 tests: auth, sessions, settings, RBAC, modules, questions,
                             # import/export, audit logs, notifications, comments, saved searches
```

Tests run against an isolated `test.db` (created/reset by `tests/globalSetup.js`), not your dev database.

## Switching to PostgreSQL

The schema uses `String` fields instead of native enums (SQLite has no enum support) so it works unmodified against Postgres too:

1. In `backend/prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL="postgresql://user:pass@host:5432/db"`.
3. `npx prisma db push`.

## Deployment (Docker)

```bash
cp backend/.env.example backend/.env   # set a real JWT_SECRET
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
```

This brings up the API on :4000 and the frontend (nginx, reverse-proxying `/api` to the backend) on :8080.

**Note on `db push` in the container entrypoint**: this project ships `schema.prisma` as the single source of truth rather than a migration history, so the container runs `prisma db push --accept-data-loss` on boot. That flag makes push non-interactive but means an incompatible schema change *can* drop data on deploy. For a production team, switch to `prisma migrate deploy` with committed migration files instead — see [Prisma's migrate docs](https://www.prisma.io/docs/orm/prisma-migrate).

## Security notes

- Passwords: bcrypt, 12 rounds. Policy (min length, letter/number requirements), lockout threshold/duration, and session timeout are admin-configurable at runtime via Admin Panel → Settings (`GET/PATCH /api/settings`) — defaults: 8+ chars with a letter and number, 5 failed logins → 15 minute lock, 8h sessions.
- Sessions are tracked server-side (`Session` table): every JWT carries a session id, and `authenticate` middleware checks the session is still active on every request. This makes sign-out, "sign out all other devices", and admin force-logout actually revoke access immediately — a stolen JWT alone isn't enough once its session is revoked. Password reset (self-service or security-question-based) revokes all sessions automatically.
- Rate limiting on `/api/auth/*` (20 req/15min in production) and a general API limiter.
- All inputs validated server-side with Zod; Prisma parameterizes all queries (no raw SQL string interpolation).
- CSV/Excel export sanitizes cells that start with `=`, `+`, `-`, `@` to prevent formula-injection when files are reopened in Excel/Sheets.
- File uploads (import) are limited to 10MB/5 files and restricted to `.json/.csv/.xlsx/.xml` by extension.
- `helmet` + configurable CORS origin (`CORS_ORIGIN` env var; defaults to reflecting all origins, which is fine for local dev only — **set this explicitly in production**).
- Known residual risk (documented, not blocking): `exceljs`'s pinned transitive `uuid` has an unpatched moderate advisory (buffer bounds check, only reachable if a raw buffer is passed to uuid — not something this app does); Monaco's bundled `dompurify` has open advisories used only for editor-internal hover/tooltip sanitization, not for rendering arbitrary user HTML anywhere in this app.

## Features implemented

- Registration with 3–5 security questions; forgot-password flow presents 3 random questions and requires ≥2 correct answers to reset.
- Roles: Regular User (read-only), Writer (full content CRUD, import/export, stats), Admin (+ user management, audit logs).
- Modules: create/rename/soft-delete (⋯ menu), question-count badge, stats.
- Questions: text/code/both formats, Monaco syntax highlighting, difficulty, tags, per-module auto-incrementing serial numbers (race-safe), search/filter/sort, list/card view, favorites, duplicate, bulk delete/tag/difficulty/move, edit history with rollback.
- Import/export: JSON, CSV, Excel (.xlsx), XML, PDF (export only) — preview-before-commit, serial number preservation with gap retention, conflict resolution (skip/overwrite/renumber).
- Admin panel: user table with role toggle, forced password reset, deactivate/reactivate, force-logout-all-devices; audit log viewer + CSV export; stats dashboard; **Settings tab** for password policy / lockout / session timeout / registration toggle.
- **Collaboration**: threaded comments on questions (admin can pin), in-app notification bell (question edited/deleted by someone else, role changed, new comment) with unread badge and mark-read.
- **Session management**: Profile page lists your active sessions (device/IP/last-active) with per-session revoke and "sign out all other devices"; admins can force-logout any user.
- **UX affordances**: Cmd/Ctrl+K focuses search from anywhere, Esc closes modals, Ctrl/Cmd+S saves the question form, undo toast (with a real "Undo" action, not just a message) after deleting a question, saved search filters (named, per-user), recent-search autocomplete via browser history.
- Dark mode (persisted, respects OS preference on first load).

See `docs/API.md` for the full endpoint reference.
