# Cultivate

Cannabis cultivation tracking and compliance PWA for a licensed Minnesota grow facility. Replaces a paper-based system for recording daily crop input applications, plant batch management, container lifecycle, harvest events, and waste trim — all to the record-keeping standards required by Minnesota Statute 342.25 and METRC.

Deployed at [cultivate.hatstak.app](https://cultivate.hatstak.app) on Railway, served through Cloudflare.

---

## Overview

Cultivate tracks ~1,360 plants per year across 8 sub-zones and 1,180 containers. Every application of a fertilizer, foliar nutrient, amendment, or pesticide is logged with applicator, timestamp, lot number, and environmental data. Harvest events (partial and final) record wet weight per plant. Container history persists independently of batch history, capturing soil amendments, teardown, and startup between batches.

**Regulatory context:**
- **MN Statute 342.25** — cultivation records per plant batch, 5-year retention
- **MN Rule 4770** — "crop input" tracking for all four input classes (fertigation, foliar, soil amendment, pesticide)
- **MN Statute 18B.37** — pesticide application records (temp, wind speed, target pest, PHI/REI, applicator license)
- **METRC** — every plant batch maps to a METRC immature plant batch UID; applications export for METRC "Record Additives"

Records are **append-only** — no hard deletes on compliance tables. Mistakes are corrected via a follow-up entry with a `corrects_id` reference, preserving the original for the 5-year retention requirement.

---

## Architecture

### Backend
- **Runtime:** Node.js 18+ / TypeScript (strict)
- **Framework:** Fastify 5 with plugins: `@fastify/jwt`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/static`, `@fastify/cors`
- **Database:** SQLite via `better-sqlite3` (WAL mode, foreign keys enforced)
- **Migrations:** Knex (migrations table: `cv_knex_migrations`, separate from farmstock's)
- **Validation:** Zod on all POST/PATCH request bodies
- **Auth:** PIN-based JWT (7-day expiry), three roles: `grower` / `supervisor` / `admin`

### Frontend
- **Framework:** React 18 with React Router v6
- **Build:** Vite 5
- **Styling:** Tailwind CSS 3
- **Icons:** Lucide React
- **QR scanning:** `jsqr` (canvas-based, no external SDK)
- **QR generation:** `qrcode` (for container label printing)

### Cross-app Integration
The sibling app **farmstock** (at `C:\projects\farmstock`, deployed at `farmstock.hatstak.app`) is the master catalog for crop inputs. Cultivate fetches product data from farmstock's API at runtime:

| Environment Variable | Purpose |
|---|---|
| `FARMSTOCK_URL` | Base URL of the farmstock app (e.g. `https://farmstock.hatstak.app`) |
| `FARMSTOCK_SERVICE_KEY` | Must match `CULTIVATE_SERVICE_KEY` in farmstock's env |

Cultivate has its **own SQLite database** at `DB_PATH` (separate from farmstock). The integration is cross-app API calls (Option B), not a shared database file.

### Deployment
- **Backend:** Railway — auto-deploys on push to `master`
- **Frontend:** Built by Vite into `client/dist/`, served as static files by Fastify
- **CDN:** Cloudflare proxies `cultivate.hatstak.app` → Railway
- **Default port:** 3002

---

## Project Structure

```
cultivate/
  src/
    api/
      routes/                 # Fastify route plugins (one file per domain)
        auth.ts               #   PIN login, user list
        batches.ts            #   Plant batch CRUD + lifecycle transitions
        catalog.ts            #   Crop input catalog (proxies farmstock items API)
        containers.ts         #   Container reads + state dashboard
        container-amendments.ts
        container-lifecycle.ts #  Teardown, soil samples, startup, ready sign-off
        exports.ts            #   METRC additives, MDA pesticide report, cultivation record
        fertigation-applications.ts
        fertigation-recipes.ts
        foliar-applications.ts
        foliar-recipes.ts
        harvest.ts            #   Harvest batches, partial/final harvest, waste trim, force-close
        observations.ts
        pesticide-applications.ts
        plant-loss.ts         #   Mid-batch plant loss + replacement
        planting-plans.ts     #   Cult-hoop → field planting plans
        strains.ts
        tag-assignments.ts    #   METRC plant tag ↔ container assignments
      middleware/
        auth.middleware.ts    #   requireAuth / requireRole
      schemas/                #   Zod schemas (shared between routes)
      app.ts                  #   Fastify app factory (buildApp)
      server.ts               #   Entry point — calls initDB() + buildApp()
    db/
      migrations/             #   Knex migrations (001–014), run in order
        001_auth.ts           #   cv_users
        002_infrastructure.ts #   zones, sub_zones, rows, containers (seed data)
        003_batches.ts        #   plant_batches, strains
        004_containers.ts     #   container_state, container_state_transitions
        005_soil.ts           #   soil_samples, soil_sample_results, teardown/startup events
        006_recipes.ts        #   fertigation_recipes + ingredients, foliar_recipes + ingredients
        007_applications.ts   #   fertigation, foliar, pesticide applications; observations; amendments
        008_batch_stage_since.ts
        009_harvest.ts        #   harvest_batches, plant_harvest_events, waste_trim_events
        010_harvest_batch_type.ts
        011_locations.ts      #   locations (Germ-01, Seedlings, Cult-Hoop, Field)
        012_batch_location_phase_history.ts
        013_planting_plans.ts
        014_plant_assignments_restructure.ts
      index.ts                #   DB singleton, initDB(), setDB() for tests
    lib/
      domain-utils.ts         #   Pure domain functions: METRC naming, phase mapping
    tests/
      helpers/
        db.ts                 #   createTestContext() — in-memory SQLite + migrations + test users
        auth.ts               #   getTestToken(), authHeader()
        fixtures.ts           #   createTestStrain, createTestBatch, advanceBatchTo, etc.
      unit/
        domain-utils.test.ts  #   27 unit tests for domain-utils
      integration/
        batches.test.ts
        containers.test.ts
        harvest.test.ts
        plant-loss.test.ts
        applications/
          foliar.test.ts
          pesticide.test.ts
  client/
    src/
      pages/
        admin/                #   ContainerLabels — printable QR label sheets
        applications/         #   Fertigation, foliar, pesticide log + entry forms; REI dashboard; hub
        batches/              #   Batch list, new batch form, batch detail
        containers/           #   Container dashboard, detail, QR scanner, lifecycle forms
        exports/              #   METRC export, MDA report, cultivation record
        harvest/              #   Harvest dashboard, partial/final harvest, waste trim, weather-close
        inputs/               #   Crop input list + detail
        observations/         #   Observation log + new form
        recipes/              #   Fertigation + foliar recipe library
        strains/              #   Strain management
        Today.jsx             #   App home screen
        Login.jsx
      components/
        NavBar.jsx            #   Bottom nav (Today, Scan, Batches, Applications, Containers)
        OfflineIndicator.jsx
      api.js                  #   All fetch calls — single source of truth for the API surface
      App.jsx                 #   Router, AuthContext, Protected wrapper
  docs/
    harvest-model.md          #   Harvest batch and waste trim data model detail
    sibling-app-resolution.md #   Approved farmstock ↔ cultivate integration decisions
    test-plan.md              #   Full test inventory and business rule coverage map
    audit-api-security.md     #   API coverage and security findings
    audit-frontend-ux.md      #   Frontend UX completeness audit
    audit-regulatory-compliance.md  # Regulatory gap analysis (342.25, 4770, 18B.37, METRC)
  reference/
    autoflower_seedling_chart_letter.pdf  # Visual style reference for printed outputs
    usage of fifra-regulated products.pdf
```

---

## Prerequisites

- **Node.js 18+**
- The **farmstock sibling app** should be running or accessible, as cultivate fetches crop input catalog data from it. The app functions without it (product names fall back to `Input #N`), but PHI/REI enforcement and product classification require the farmstock connection.

---

## Development Setup

### 1. Clone and install dependencies

```bash
# Backend
npm install

# Frontend
cd client && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3002
DB_PATH=./data/cultivate.db
JWT_SECRET=your-secret-here
ALLOWED_ORIGIN=http://localhost:5174
NODE_ENV=development
FARMSTOCK_URL=https://farmstock.hatstak.app
FARMSTOCK_SERVICE_KEY=match-farmstock-CULTIVATE_SERVICE_KEY
```

The database directory (`./data/`) is created automatically on first run.

### 3. Start the backend dev server

```bash
npm run dev
```

This starts Fastify with `tsx` (no compile step). Migrations run automatically on startup. A default admin user is seeded if no users exist:
- **Select admin from the user list on the login screen**
- **Default PIN:** `0000` — change this immediately

### 4. Start the frontend dev server

```bash
cd client && npm run dev
```

Vite starts at `http://localhost:5174` by default. The frontend proxies API calls to port 3002 (configured in `vite.config.js`).

### 5. Run tests

```bash
npm test              # All tests (175 total)
npm run test:watch    # Watch mode
cd client && npm test # Frontend-only tests (34 tests)
```

---

## Database

**SQLite file** at the path set by `DB_PATH` (default: `./data/cultivate.db`).

All tables use the `cv_` prefix to namespace cultivate's schema within the shared SQLite file. Knex migrations run in the `cv_knex_migrations` table — separate from farmstock's migration tracking.

Physical infrastructure (zones, sub-zones, rows, all 1,180 containers) is **seed data loaded by migration 002** and is never modified through the UI. Container IDs follow the canonical format `Z{zone}-{sub}-R{row}-C{container}` (e.g. `Z1-A-R3-C12`).

### Running migrations manually

Migrations run automatically via `initDB()` when the server starts. To run them without starting the server:

```bash
npx knex migrate:latest --knexfile src/db/knex.config.ts
```

### Adding a migration

Create `src/db/migrations/NNN_description.ts` with `up()` and `down()`:

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_some_table', (t) => {
    t.text('new_column').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_some_table', (t) => {
    t.dropColumn('new_column');
  });
}
```

**Important:** If your change touches a table that farmstock also uses, flag the impact before migrating.

---

## Testing

Tests use **in-memory SQLite** — no production database is required. Each test suite runs full Knex migrations against a fresh in-memory DB.

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode for TDD
```

**Test infrastructure** (`src/tests/helpers/`):
- `db.ts` — `createTestContext()` returns a fully-migrated in-memory DB + Fastify app + seeded users (admin/supervisor/grower)
- `auth.ts` — `getTestToken(role)` / `authHeader(role)` for signing test JWTs
- `fixtures.ts` — factories: `createTestStrain`, `createTestBatch`, `advanceBatchTo`, `createHarvestBatch`, `createPlantAssignment`, container state helpers, `insertStageOverride`

**Current test count:** 175 tests — all passing.

See `docs/test-plan.md` for the full business rule inventory and test coverage map.

---

## API Routes

All routes are prefixed with `/api`. Auth middleware (`requireAuth`) is required on every route. Role requirements:

| Role | Can do |
|---|---|
| `grower` | Log applications, observations, plant loss, harvest events |
| `supervisor` | Everything above + batch transitions, recipe versioning, startup sign-off, force-close harvest |
| `admin` | Everything above + user management, container label printing |

**Route prefixes:**

| Prefix | File | Description |
|---|---|---|
| `/api/auth` | `auth.ts` | Login (PIN), user list |
| `/api/batches` | `batches.ts` | Plant batch lifecycle |
| `/api/recipes/fertigation` | `fertigation-recipes.ts` | Recipe library (immutable on approval) |
| `/api/recipes/foliar` | `foliar-recipes.ts` | Foliar recipe library |
| `/api/catalog` | `catalog.ts` | Crop input catalog (proxies farmstock) |
| `/api/strains` | `strains.ts` | Strain management |
| `/api/containers` | `containers.ts` + `container-lifecycle.ts` | Container state, teardown, soil samples, startup |
| `/api/applications/fertigation` | `fertigation-applications.ts` | Drip irrigation log |
| `/api/applications/foliar` | `foliar-applications.ts` | Foliar spray log (non-pesticide) |
| `/api/applications/amendments` | `container-amendments.ts` | Soil amendment log |
| `/api/applications/pesticide` | `pesticide-applications.ts` | Pesticide log (full MDA compliance fields) |
| `/api/observations` | `observations.ts` | Observations + harvest readiness |
| `/api/harvest` | `harvest.ts` | Harvest batches, partial/final harvest, waste trim, force-close |
| `/api/plant-loss` | `plant-loss.ts` | Mid-batch loss + replacement |
| `/api/tag-assignments` | `tag-assignments.ts` | METRC plant tag ↔ container |
| `/api/planting-plans` | `planting-plans.ts` | Cult-hoop → field planting plans |
| `/api/exports` | `exports.ts` | METRC additives CSV, MDA pesticide report, cultivation record JSON |

`GET /health` returns `{ status: 'ok', app: 'cultivate' }` — used by Railway health checks.

**Error shape:** `{ error: string }` always. Validation failures add `{ issues: ZodIssue[] }`.

**HTTP status codes:** 200 (success), 201 (created), 400 (validation), 401 (unauthenticated), 403 (forbidden), 404 (not found), 422 (business rule redirect — e.g. pesticide product in foliar form), 500 (unexpected).

---

## Build and Deployment

### Local production build

```bash
npm run build
```

This compiles TypeScript (`tsc`) and builds the Vite frontend. Output: `dist/` (backend) and `client/dist/` (frontend). Fastify serves `client/dist/` as static files and falls back to `index.html` for all non-`/api` routes (SPA routing).

### Start compiled server

```bash
npm start
# → node dist/api/server.js
```

### Railway deployment

Pushes to `master` auto-deploy via Railway's GitHub integration.

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment variables:** Set in Railway dashboard (same keys as `.env.example`)
- **Database:** Railway volume mounted at the path set by `DB_PATH`

`index.html` is served with `Cache-Control: no-cache` so Cloudflare/browsers always revalidate on each deploy. Hashed JS/CSS assets are cached indefinitely via content-hash filenames.

---

## Key Domain Concepts

**Plant Batch** — one strain occupying one sub-zone for one season-run. The METRC unit. Lifecycle: `germ → seedling → cult-hoop → field-veg → field-flower → flush → harvest_window → harvesting → closed`.

**Container** — a single pot, permanently identified by position (`Z1-A-R3-C12`). First-class tracked entity with its own lifecycle (`ready → active → empty → teardown → startup → ready`). Container history persists across batches.

**Harvest Batch** — a METRC harvest lot; plants harvested together in a 1–2 day window. Normally one per plant batch; a weather event force-closes the current harvest batch and opens a new one for remaining plants.

**Partial Harvest** — product (wet weight) removed from a living plant. Multiple allowed per plant. METRC term is "manicure" — that term is **never used** in the UI or codebase.

**Waste Trim** — material removed and disposed as waste (not product). Distinct from harvest events. Has its own disposal lifecycle: `collected → held → disposed → reported`.

**PHI / REI** — Pre-Harvest Interval and Re-Entry Interval. PHI uses `phi_days_operational` (the operation's enforced interval, always ≥ the label PHI). REI triggers a full-screen acknowledgment modal and blocks re-entry until cleared.

**EPA number = pesticide.** Any product with an EPA registration number is classified as a pesticide regardless of whether it is organic or OMRI-listed. The data layer enforces this with a CHECK constraint — no UI override exists.

For the full domain model, see `CLAUDE.md` (Domain Glossary + Operational Model sections).

---

## Regulatory Notes

| Requirement | Implementation |
|---|---|
| MN Statute 342.25 — 5-year retention | Append-only compliance tables; `corrects_id` pattern for amendments |
| MN Statute 342.25 — cultivation record | `GET /api/exports/cultivation-record/:batchId` — full batch history including all applications, observations, recipe versions, harvest weights, waste trim |
| MN Rule 4770 — crop input tracking | Four distinct application tables: fertigation, foliar, amendment, pesticide |
| MN Statute 18B.37 — pesticide records | Pesticide table captures target pest, ambient temp, wind speed, PHI compliance, REI expiry, applicator license |
| METRC — batch tracking | `metrc_plant_batch_uid` on every batch; METRC sync status tracked per record |
| METRC — additives export | `GET /api/exports/metrc-additives` — all four application types, CSV format |
| MDA pesticide report | `GET /api/exports/mda-pesticide` — field-for-field per 18B.37; available on demand |

See `docs/audit-regulatory-compliance.md` for the full compliance gap analysis.

---

## Documents

| File | Contents |
|---|---|
| `CLAUDE.md` | Authoritative project brief — domain model, business rules, application surface, field UX requirements |
| `docs/harvest-model.md` | Harvest batch, partial harvest, final harvest, and waste trim data model detail |
| `docs/sibling-app-resolution.md` | Approved farmstock ↔ cultivate integration decisions (Option B, separate DBs) |
| `docs/test-plan.md` | Full test inventory — 66 business rules, Tier 1/2/3 test groups |
| `docs/audit-api-security.md` | API coverage and security findings |
| `docs/audit-frontend-ux.md` | Frontend UX completeness audit against field UX requirements |
| `docs/audit-regulatory-compliance.md` | Regulatory gap analysis — 342.25, 4770, 18B.37, METRC |
