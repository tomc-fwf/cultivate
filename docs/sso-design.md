# SSO Shared Authentication Discovery and Design

**Date:** 2026-05-21  
**Apps in scope:** cultivate, farmstock, ff-dcs  
**Goal:** Single login across all three `hatstak.app` subdomains

---

## Section 1: Current Auth State per App

### 1.1 Cultivate (`cultivate.hatstak.app`)

**User table:** `cv_users`

| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | Display name |
| `pin_hash` | TEXT | bcrypt hash of 4-digit PIN |
| `role` | TEXT | `grower` \| `supervisor` \| `admin` |
| `active` | INTEGER | 0/1 |
| `failed_attempts` | INTEGER | Lockout counter |
| `locked_until` | TEXT (ISO-8601) | Set after 5 failures for 15 min |
| `email` | TEXT | Nullable |
| `last_login_at` | TEXT | Updated on login |

**Login mechanism:** User selects name from a picker list (no username typed), enters 4-digit PIN. No password, no email, no MFA.

**JWT config:**
- Secret: `process.env.JWT_SECRET` (fallback: `'cultivate-dev-secret'`)
- Expiry: `7d`
- Plugin: `@fastify/jwt`
- Claims: `{ id, name, role }` (integer `id`, not UUID)
- No `iss`, `aud`, or `type` claims

**Token storage:** `localStorage.getItem('cv_token')` — set at login, read by `client/src/api.js` on every request via `Authorization: Bearer <token>` header.

**Role model:**

| Role | Level | Description |
|------|-------|-------------|
| `grower` | 0 | Field staff — can log applications, observations |
| `supervisor` | 1 | Can approve batches, sign off on REI clearance, harvest decisions |
| `admin` | 2 | Full access including admin/label printing |

**Cross-app auth:** Farmstock accepts `Authorization: Service <CULTIVATE_SERVICE_KEY>` from cultivate for inventory reads (one-directional service key, not a user token).

---

### 1.2 Farmstock (`farmstock.hatstak.app`)

**User table:** `users`

| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | Display name |
| `pin_hash` | TEXT | bcrypt hash |
| `role` | TEXT | `worker` \| `manager` \| `admin` |
| `active` | INTEGER | 0/1 |
| `failed_attempts` | INTEGER | Lockout counter |
| `locked_until` | TEXT | 15-min lockout after 5 failures |
| `email` | TEXT | Nullable |

**Login mechanism:** Two-step — (1) farm-wide access code required first (bcrypt-verified against `settings` table), (2) user selects name from picker, enters PIN. The farm access code is a shared secret that gates who can even see the user list.

**JWT config:**
- Secret: `process.env.JWT_SECRET` (fallback: `'farmstock-dev-secret'`)
- Expiry: `7d`
- Plugin: `@fastify/jwt`
- Claims: `{ id, name, role }` (integer `id`)
- No `iss`, `aud`, or `type` claims

**Token storage:** `localStorage.getItem('fs_token')` — same pattern as cultivate, different localStorage key.

**Role model:**

| Role | Level | Description |
|------|-------|-------------|
| `worker` | 0 | Can log transactions, view inventory |
| `manager` | 1 | Can manage stock, suppliers, approve transactions |
| `admin` | 2 | Full access including settings |

**Cross-app auth:** `service-auth.middleware.ts` accepts `Authorization: Service <CULTIVATE_SERVICE_KEY>` for cultivate-to-farmstock API calls. No mechanism for farmstock to call cultivate.

---

### 1.3 FF-DCS (`ff-dcs.hatstak.app` or similar subdomain)

**User table:** `users` (primary user accounts)  
**Also:** `personnel` table for field staff with derived auth roles

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | uuid v4 |
| `username` | VARCHAR(50) | Unique |
| `email` | VARCHAR(255) | Unique |
| `password_hash` | VARCHAR(255) | bcrypt |
| `full_name` | VARCHAR(255) | |
| `role` | VARCHAR(50) | See role model below |
| `department` | VARCHAR(100) | Nullable |
| `is_active` | BOOLEAN | |
| `is_locked` | BOOLEAN | |
| `locked_until` | TIMESTAMP | |
| `failed_login_attempts` | INTEGER | |
| `must_change_password` | BOOLEAN | |
| `password_changed_at` | TIMESTAMP | |
| `last_login_at` | TIMESTAMP | |
| `created_at` / `updated_at` | TIMESTAMP | |

**Login mechanism:** Username + password (bcrypt). Optional TOTP MFA (second step). Password reset via email token. Invite-based account creation. Personnel can log in with credentials derived from the `personnel` table (their `id` is prefixed `personnel:<n>`).

**JWT config:**
- Secret: `process.env.JWT_SECRET` (required, min 32 chars — startup fails without it)
- Expiry: configurable via DB settings (default: access=900s / 15min, refresh=28800s / 8hr)
- Plugin: `@fastify/jwt`
- Claims: `{ sub, jti, username, full_name, role, department, type, personnel_id?, is_personnel? }`
- **Has `iss: 'ff-dcs'` and `aud: 'ff-dcs-api'` claims** — verified on every request
- `type` claim distinguishes `access`, `refresh`, and `mfa_pending` tokens

**Token storage:** httpOnly cookies `access_token` + `refresh_token` (secure in prod, SameSite=none for cross-origin; SameSite=lax in dev). Also accepts `Authorization: Bearer` header as fallback. CSRF protection via double-submit cookie pattern (`csrf_token` + `X-CSRF-Token` header).

**Role model:** Permission-based via `ROLE_PERMISSIONS` map. Roles include (at minimum): `admin`, `quality_manager`, `quality_specialist`, `manager`, `user`, `viewer`. Personnel roles are derived from their functional role in the `personnel` table.

**Additional infrastructure:**
- Token blacklist service (in-memory, survives restart via expiry tracking)
- Session table in DB with idle-timeout and IP-binding audit
- Max 3 concurrent sessions per user (oldest revoked on overflow)
- Password history (last 5), password expiry (90 days), strength validation
- WebSocket token endpoint (30-second short-lived token for WS connections)
- Swagger/OpenAPI docs at `/docs`

---

### 1.4 User Record Duplication Analysis

| Dimension | Cultivate | Farmstock | FF-DCS |
|-----------|-----------|-----------|--------|
| Table name | `cv_users` | `users` | `users` |
| PK type | INTEGER auto | INTEGER auto | UUID |
| Auth method | PIN | Farm-code + PIN | Password + optional MFA |
| Same person in all three? | Yes — Tom exists in all | Yes | Yes |
| Records synchronized? | No | No | No |
| Same IDs across apps? | No | No | No |

**Current state:** User records are completely duplicated. The same person (Tom, and any future staff) must be created separately in each app. Role changes made in one app do not propagate. Deactivating a user in one app leaves them active in others.

**What would break with shared users:** Cultivate and farmstock use PIN auth with integer user IDs; ff-dcs uses password auth with UUIDs. A naive merge requires choosing one auth method and one ID type — or bridging them.

---

## Section 2: SSO Requirements

### 2.1 What "shared login" means for this operation

1. **Single credentials** — one username/PIN (or username/password) works in all three apps. No per-app accounts.
2. **Session continuity** — logging in on one app should mean all apps on the same device recognize the session without re-prompting.
3. **Single user management** — adding a user, changing their role, or deactivating them happens in one place and takes effect everywhere within an acceptable window.
4. **Role model alignment** — at minimum, the apps must agree on who is an admin vs. a regular user. App-specific role nuance is acceptable as long as it maps cleanly from a unified model.

### 2.2 Key constraints

**Offline tolerance (cultivate-specific, non-negotiable):**  
Cultivate is used in the field with spotty WiFi. Any SSO design must not break when the network is unavailable. This rules out any design where every API request validates against a central auth service. JWT-based auth where tokens are validated locally satisfies this — the token is cryptographically verifiable without a network call.

**Short-lived token incompatibility:**  
FF-DCS uses 15-minute access tokens with refresh flow. Cultivate and farmstock use 7-day tokens. In the field, a 15-minute token without background refresh support would log staff out mid-row-walk. The unified token expiry must be longer (7-day or configurable), which requires relaxing ff-dcs's strict token policy for cross-app tokens.

**Auth method gap:**  
Cultivate and farmstock use 4-digit PIN; ff-dcs uses password + MFA. A unified login must pick one method per user context (field devices vs. desktop management), or use a bridging approach where the token is issued by whichever app's auth system the user logged into.

**Subdomain context:**  
All apps share `*.hatstak.app`. Cookies set with `domain=.hatstak.app` are visible to all subdomains in the browser. This is the foundation of the "log in once, all apps share the session" approach.

**Session expiry:**  
Field staff on tablets should not be required to re-authenticate during a 10-hour workday. Session expiry for field devices should be at least 12 hours; desktop/admin sessions can be shorter.

---

## Section 3: Architecture Options

### Option A: Shared JWT secret

**Description:** Set the same `JWT_SECRET` value in all three apps' environment variables. Any app can issue a token; all apps can verify tokens issued by any other app.

**Changes required:**
- Set identical `JWT_SECRET` across cultivate, farmstock, ff-dcs Railway environment variables
- FF-DCS currently requires `iss: 'ff-dcs'` and `aud: 'ff-dcs-api'` — its `verify` config would need to be relaxed to accept tokens from other issuers, or cultivate/farmstock would need to add matching `iss`/`aud` claims
- Token expiry alignment: ff-dcs would need to issue longer-lived tokens for cross-app sessions, or cultivate/farmstock would need to implement token refresh
- User IDs remain per-app (integer vs UUID) — tokens from different apps carry different ID formats; each app's business logic must handle this

**Cookie strategy (combined with Option E):**  
Set cookie on `.hatstak.app` domain after login so other subdomains receive it automatically.

**What breaks:**  
FF-DCS `iss`/`aud` verification. FF-DCS's 15-min expiry for field use (needs configuration change). User ID type mismatch across apps (tokens from cultivate carry integer IDs that ff-dcs cannot look up in its UUID-PK users table).

| | Score |
|--|--|
| Feasibility | 3/5 — works with config changes but has structural gaps |
| Effort | S (hours to M for ff-dcs iss/aud relaxation) |
| Risk | Medium — ff-dcs security posture is weakened by relaxing iss/aud verification |
| Recommendation | Quick win for cultivate ↔ farmstock; partial solution for ff-dcs |

---

### Option B: Shared user table (extend current shared DB)

**Description:** Cultivate and farmstock already share a SQLite database (approved in docs/sibling-app-resolution.md, Option A). Create a canonical `users` table in the shared DB that both apps read from. FF-DCS connects to the same DB for user lookups or syncs users via a one-way push.

**Changes required:**
- Migrate cultivate's `cv_users` and farmstock's `users` into a single canonical table (likely `cv_users` with a role mapping)
- Both apps switch from their per-app user tables to the shared table
- Both apps share the same `JWT_SECRET`
- FF-DCS: either (a) add a `cv_users` FK to its `users` table for cross-reference, or (b) sync users from ff-dcs's user management into `cv_users` via a lightweight API call on user change
- Token format: cultivate and farmstock continue to use integer IDs from the shared table; ff-dcs maps `cv_users.id → uuid` for its own token

**What breaks:**  
FF-DCS remains a separate DB (Knex + separate file). Users managed in ff-dcs (via invite flow, MFA, password policy) would need a sync mechanism to push into `cv_users`. PIN vs password auth split: field staff use PIN on cultivate/farmstock, same staff would use password on ff-dcs.

| | Score |
|--|--|
| Feasibility | 4/5 — clean for cultivate ↔ farmstock; requires sync for ff-dcs |
| Effort | M (1-2 days) for cultivate+farmstock; L (3-5 days) for ff-dcs sync |
| Risk | Low for cultivate+farmstock; medium for ff-dcs (sync lag, divergence) |
| Recommendation | **Best path for cultivate ↔ farmstock.** FF-DCS integration is a follow-on. |

---

### Option C: Central auth service (`auth.hatstak.app`)

**Description:** New lightweight Fastify service owns the user table, login, and token issuance. All apps redirect to `auth.hatstak.app` for login and receive a JWT valid across all apps.

**Changes required:**
- New Railway service to deploy and maintain
- OAuth2 authorization code flow or simpler token exchange
- All three apps rewrite their login UI to redirect rather than self-authenticate
- Field use: redirect flow requires network connectivity for every login

**What breaks:**  
Offline login is impossible (redirect requires network). New service is a new single point of failure. Adds deployment complexity for a two-person operation.

| | Score |
|--|--|
| Feasibility | 2/5 — offline requirement is a hard blocker |
| Effort | XL (1+ week) |
| Risk | High (new infrastructure, offline failure mode) |
| Recommendation | Not suitable for this operation's field-use constraint |

---

### Option D: FF-DCS as auth provider

**Description:** FF-DCS owns the user table and login. Cultivate and farmstock redirect to ff-dcs for login and receive a JWT. FF-DCS exposes `GET /api/v1/auth/verify` for token validation.

**Changes required:**
- Cultivate and farmstock remove their login flows, redirect to ff-dcs
- FF-DCS issues tokens with sufficient expiry for field use
- FF-DCS must support PIN auth for field staff (currently only password+MFA)
- Network call to ff-dcs for every protected request if apps call `/verify` — kills offline use

**What breaks:**  
Offline use (same problem as Option C if verification requires network call). PIN auth not supported in ff-dcs. All apps depend on ff-dcs availability — ff-dcs outage = nobody can work in any app.

**Variant:** FF-DCS issues the tokens (JWT), all apps verify locally using shared secret. This avoids the per-request network call but still requires network for the initial login redirect.

| | Score |
|--|--|
| Feasibility | 3/5 (with shared secret variant) |
| Effort | L (3-5 days) |
| Risk | High (ff-dcs availability couples all apps; PIN auth gap) |
| Recommendation | Not suitable as primary; could be incorporated in Phase 3 for admin-only users |

---

### Option E: Shared httpOnly cookie with subdomain scope

**Description:** This is a strategy that combines with Options A or B, not a standalone option. All apps set `Set-Cookie: access_token=<jwt>; Domain=.hatstak.app; HttpOnly; Secure; SameSite=Lax` on login. Because the cookie domain spans all subdomains, logging in at `cultivate.hatstak.app` means the cookie is sent automatically to `farmstock.hatstak.app` and vice versa.

**Current state:**
- Cultivate and farmstock store tokens in localStorage (per-app, per-subdomain, not shared)
- FF-DCS already uses httpOnly cookies but without a `.hatstak.app` domain scope

**Changes required for cultivate and farmstock:**
- Add `@fastify/cookie` dependency
- On login, set cookie with `domain: '.hatstak.app'` instead of returning token in response body
- Update `client/src/api.js` in each app: remove `localStorage` read; cookies are sent automatically by the browser — no `Authorization` header needed
- Update auth middleware to read from cookie first (as ff-dcs already does)
- Add `credentials: 'include'` to all `fetch` calls if the API is on the same domain (it is — cultivate serves its own API, so cookies are same-origin)

**CORS note:** Since each app serves its own frontend and API on the same origin, and the cookie is set with `path=/`, there's no CORS issue for same-origin requests. The cookie crosses subdomains automatically in the browser without any JS involvement.

**Cloudflare considerations:**
- Ensure `Cache-Control: no-store` or `private` on all `/api/auth/*` endpoints — Cloudflare must never cache auth responses
- Railway sets `CF-Cache-Status: MISS` for dynamic routes by default, but explicit cache rules should be added for auth paths
- Session cookies with `domain=.hatstak.app` pass through Cloudflare unchanged — no configuration needed

| | Score |
|--|--|
| Feasibility | 5/5 — subdomain cookie sharing is standard, well-supported |
| Effort | S (hours per app) |
| Risk | Low — well-understood pattern; CSRF needs attention (see Section 7) |
| Recommendation | **Recommended as part of Phase 1** — pairs with Options A or B |

---

## Section 4: Recommended Approach

### Summary

The pragmatic path for this small, field-first operation is a **two-phase approach**:

**Phase 1 (hours, zero new infrastructure):** Shared JWT secret + shared `.hatstak.app` domain cookie. Login in cultivate or farmstock → cookie is set → farmstock or cultivate recognizes the session without re-login. This is complete SSO between cultivate and farmstock with a half-day of work.

**Phase 2 (1-2 days):** Consolidate `cv_users` (cultivate) and `users` (farmstock) into a single user table in the shared DB. Single place to create/deactivate users; role changes propagate instantly. FF-DCS remains separate but can sync admin users via API on Phase 3.

**Phase 3 (future, opt-in):** If ff-dcs's user management (MFA, departments, audit trail, invite flow) is needed for cultivate/farmstock users, expose ff-dcs as the canonical user source. Issue tokens from ff-dcs, verify locally in all apps using shared secret.

---

## Section 5: Implementation Plan

### Phase 1: Shared JWT secret + `.hatstak.app` domain cookie (hours)

#### Step 1: Align JWT_SECRET in Railway

1. Go to Railway → cultivate service → Variables → set `JWT_SECRET=<strong-random-32+-char-value>`
2. Same value to farmstock service → Variables → `JWT_SECRET=<same-value>`
3. FF-DCS already enforces `JWT_SECRET` at startup — set same value there too (optional in Phase 1 if ff-dcs token format is incompatible; set it when Phase 3 begins)

After this step, a token issued by cultivate can be verified by farmstock and vice versa — the math works. But the token isn't shared yet because they're stored in separate `localStorage` keys.

#### Step 2: Add cookie support to cultivate

**`package.json`:** add `@fastify/cookie`

**`src/api/app.ts`:**
```typescript
import fastifyCookie from '@fastify/cookie';

// After fastifyJwt registration:
await app.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET!,
  hook: 'onRequest',
  parseOptions: {}
});
```

**`src/api/routes/auth.ts`** — change login and refresh to set cookie:
```typescript
// After token signing:
const isProduction = process.env.NODE_ENV === 'production';
reply.setCookie('hatstak_token', token, {
  domain: isProduction ? '.hatstak.app' : undefined, // undefined = current domain in dev
  path: '/',
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'lax' : 'lax',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
});
return reply.send({ token, worker: { id: user.id, name: user.name, role: user.role } });
// Still return token in body for backwards compatibility with any API clients
```

**`src/api/middleware/auth.middleware.ts`** — read cookie first:
```typescript
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Try cookie first (browser SSO path)
    const cookieToken = request.cookies?.hatstak_token;
    if (cookieToken) {
      // Manually verify since @fastify/jwt's jwtVerify reads Authorization header by default
      const decoded = request.server.jwt.verify(cookieToken) as any;
      request.user = decoded;
      return;
    }
    // Fall back to Authorization header (API clients, tests)
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'Not authenticated' });
  }
}
```

**`client/src/api.js`** — read cookie fallback (browser sends cookie automatically, but keep localStorage for offline):
```javascript
const getToken = () => localStorage.getItem('cv_token');
// No change needed — fetch sends cookies automatically for same-origin requests.
// The Authorization header continues to work; cookie is bonus for cross-subdomain.
```

**Login page** — on login success, continue storing token in `cv_token` localStorage as before (backward compat, offline use). The cookie is the SSO bridge; localStorage is the offline-capable credential.

#### Step 3: Apply same changes to farmstock

Mirror Step 2 in farmstock. Cookie name: `hatstak_token` (same name so all apps share the same cookie). The `fs_token` localStorage key remains for farmstock's offline use.

#### Step 4: Update middleware to recognize cross-app tokens

The JWT claim shape differs slightly (cultivate/farmstock: `{ id, name, role }` vs a future unified shape). In Phase 1, each app only uses tokens it issued itself (localStorage path), so no change needed. The cookie path doesn't need the app to understand the other app's user IDs yet — it just needs to accept the token as valid.

For the cookie to actually auto-login the user in app B when they visit from app A, app B's login page must check for a valid cookie on load and skip the login form. This is the UX implementation step:

**`client/src/pages/Login.jsx` (cultivate) — add auto-login on mount:**
```javascript
useEffect(() => {
  // If a valid cookie-backed session exists, call /auth/refresh to get a fresh token
  api.refreshToken()
    .then(({ token, worker }) => {
      localStorage.setItem('cv_token', token);
      setUser(worker);
      navigate('/');
    })
    .catch(() => { /* show login form */ });
}, []);
```

The `/auth/refresh` endpoint already has `requireAuth` — if the cookie is valid, it issues a new app-specific token and the user is in.

#### Step 5: Cloudflare cache rules

Add a Cloudflare Cache Rule (or Transform Rule) for `cultivate.hatstak.app/api/auth/*`: set `Cache-Control: no-store`. This prevents Cloudflare from ever caching login responses or tokens.

#### Step 6: Testing

1. Log into cultivate normally → `cv_token` in localStorage, `hatstak_token` cookie set with `domain=.hatstak.app`
2. Open `farmstock.hatstak.app` in same browser tab → cookie is sent automatically
3. farmstock's login page calls `/auth/refresh` with the cookie → issues `fs_token` → user is in without entering PIN
4. Verify: deactivate user in cultivate → farmstock refresh should return 401 (both apps query their own user table — Phase 2 will unify this)

---

### Phase 2: Shared user table (1-2 days)

#### Step 1: Canonicalize the shared user table

The shared SQLite DB (currently used by both cultivate and farmstock for domain data) gets a canonical user table:

```sql
-- Migration: add to the shared DB
CREATE TABLE hatstak_users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  pin_hash    TEXT NOT NULL,           -- bcrypt 4-digit PIN for field apps
  role        TEXT NOT NULL DEFAULT 'grower', -- unified role (see Section 6)
  active      INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Step 2: Migrate existing users

Write a one-time migration script that:
1. Reads `cv_users` (cultivate) — canonical source if different entries exist
2. Reads `users` (farmstock) — merge by `name` or `email`
3. Inserts into `hatstak_users` with unified roles (see Section 6 mapping)
4. Records the old `cv_users.id` and `farmstock.users.id` for cross-reference during transition

#### Step 3: Update cultivate to use `hatstak_users`

- Change `cv_users` SELECT queries in `auth.ts` to use `hatstak_users`
- FK references from application tables (e.g. `cv_applications_fertigation.applicator`) continue to reference `cv_users.id` during transition; add a view or alias
- Long term: migrate all FKs to reference `hatstak_users.id` in a follow-on migration

#### Step 4: Update farmstock to use `hatstak_users`

- Same change in farmstock's `auth.ts` — query `hatstak_users` instead of `users`
- Farmstock's role model (`worker/manager/admin`) maps to the unified model via query

#### Step 5: FF-DCS user linkage (optional in Phase 2)

Add `hatstak_user_id` nullable FK to ff-dcs's `users` table. When an ff-dcs admin is also a cultivate/farmstock user, link the records. Deactivation in ff-dcs can trigger a PATCH call to cultivate's API to deactivate the linked `hatstak_users` record. This is a best-effort sync, not real-time coupling.

---

## Section 6: Role Model Unification

### Current roles per app

| App | Roles | Hierarchy |
|-----|-------|-----------|
| Cultivate | `grower`, `supervisor`, `admin` | grower < supervisor < admin |
| Farmstock | `worker`, `manager`, `admin` | worker < manager < admin |
| FF-DCS | `admin`, `quality_manager`, `quality_specialist`, `manager`, `user`, `viewer` + personnel-derived roles | Fine-grained via ROLE_PERMISSIONS map |

### Proposed unified role set

For cultivate + farmstock (the two apps that will share a user table), a unified role set:

| Unified Role | Cultivate Mapping | Farmstock Mapping | Description |
|---|---|---|---|
| `grower` | `grower` | `worker` | Field staff — logs applications, observations, transactions |
| `supervisor` | `supervisor` | `manager` | Approves transitions, signs off on compliance actions |
| `admin` | `admin` | `admin` | Full access including user management, settings |

**Implementation:** The `hatstak_users.role` column stores the unified role. Each app's `requireRole` middleware maps the unified role to its own level:

- Cultivate: `ROLE_LEVEL = { grower: 0, supervisor: 1, admin: 2 }` — no change
- Farmstock: change `ROLE_LEVEL = { worker: 0, manager: 1, admin: 2 }` to `{ grower: 0, supervisor: 1, admin: 2 }` and update any UI labels that show "worker" to show "grower" (or vice versa — pick one display name)

### FF-DCS role mapping

FF-DCS uses a richer ROLE_PERMISSIONS system. When a user logs into ff-dcs who also has a `hatstak_user_id` link, their ff-dcs role is independent. A `quality_manager` in ff-dcs might be a `supervisor` in cultivate. The link is maintained manually via the `hatstak_user_id` FK.

**JWT claims for unified tokens** (Phase 2):

```json
{
  "id": 42,
  "name": "Tom",
  "role": "admin",
  "email": "tom@fairwaterfarm.com"
}
```

FF-DCS tokens (different issuer, different claims) are not mixed with cultivate/farmstock tokens — they remain separate in Phase 1 and 2.

### App-scoped roles (future, optional)

If cultivate eventually needs roles that farmstock doesn't (e.g. `metrc_reporter` for METRC-specific permissions), add a `cv_role_overrides` table in the cultivate-scoped schema rather than expanding `hatstak_users`. JWT claims include only the base role; fine-grained permissions are resolved server-side from the override table.

---

## Section 7: Security Considerations

### 7.1 Token expiry and refresh across apps

**Current state:** cultivate and farmstock issue 7-day JWTs with no refresh requirement. FF-DCS issues 15-minute access tokens with 8-hour refresh tokens.

**Unified recommendation for cultivate/farmstock:** Keep 7-day tokens for Phase 1. Consider reducing to 24-hour tokens with auto-refresh in Phase 2 to limit exposure window. Cultivate's offline use requires that a locally-cached token remains valid for a full workday without network access — 24h is the minimum viable expiry.

**FF-DCS** should not be forced to adopt longer tokens. Its 15-min + refresh model is correct for a document management system that staff use at their desk with reliable connectivity.

### 7.2 User deactivation propagation

**Current state:** Deactivating a user in cultivate has no effect on farmstock or ff-dcs. A user with a valid 7-day JWT continues to have access for up to 7 days after deactivation.

**Phase 1 mitigation:** Each app queries its own user table on the `/refresh` endpoint. A deactivated user in cultivate will fail refresh — their token will not be renewed. But their existing token (for up to 7 days) still works for stateless API calls.

**Phase 2 improvement:** With a shared `hatstak_users` table, deactivation in either cultivate or farmstock admin UI deactivates across both apps instantly. API calls hit the user table on every auth check (requireAuth calls `getDB()...cv_users` — this should be confirmed is an indexed lookup).

**Phase 3 improvement:** Add token revocation on deactivation (token blacklist or short-lived tokens + refresh). Acceptable as a future enhancement.

### 7.3 httpOnly cookie vs localStorage security tradeoff

| | localStorage | httpOnly Cookie |
|--|--|--|
| XSS theft | Vulnerable — any JS on page can read | Safe — JS cannot access |
| CSRF | Safe — not sent cross-origin automatically | Vulnerable — sent automatically; needs CSRF protection |
| Offline access | Easy — JS reads directly | Requires service worker or cached token |
| Cross-subdomain | Not shared | Shared with `domain=.hatstak.app` |

**Recommendation:** httpOnly cookies for SSO (the cross-subdomain token), localStorage for offline-capable apps (cultivate, farmstock). The cookie is the SSO bridge; localStorage is the resilience fallback. This dual-storage approach is the right tradeoff for field use.

### 7.4 CSRF protection

Cultivate and farmstock do not currently implement CSRF protection because they use `Authorization: Bearer` headers (not cookies) for all requests. If cookie auth is added, CSRF becomes a real attack vector.

**Minimum CSRF mitigation for cultivate and farmstock (Phase 1):**

The apps are single-origin — frontend and backend are served from the same subdomain. With `SameSite=Lax` cookies, cross-site POST requests do not include the cookie (only same-site and top-level navigations do). This provides meaningful CSRF protection for most attack vectors without any token mechanism.

Do NOT use `SameSite=None` (which ff-dcs uses for cross-origin requests in production) — cultivate and farmstock don't need cross-origin cookie sending. `SameSite=Lax` is correct and sufficient.

**If stricter protection is required in Phase 2:**  
Implement the double-submit pattern as ff-dcs does: set a readable `hatstak_csrf` cookie (not httpOnly) on login, require the client to echo it as `X-CSRF-Token` header on all state-changing requests. State-changing request middleware validates they match.

### 7.5 Cloudflare auth endpoint caching

Cloudflare must never cache auth responses. Add these rules:

```
# Cloudflare Cache Rule (applied to all three apps)
URL pattern: *.hatstak.app/api/auth/*
Cache status: Bypass
```

Additionally, all auth route handlers should set `reply.header('Cache-Control', 'no-store, private')` explicitly.

### 7.6 Offline use in cultivate

The field-use offline requirement is met by the dual-storage design:

1. On login: server sets `hatstak_token` cookie (SSO bridge) + response body contains token → client stores in `localStorage['cv_token']`
2. Online operation: cookie is sent automatically, `Authorization: Bearer <localStorage token>` is also sent
3. Offline operation: browser can't contact server; fetch fails; offline-first queue (IndexedDB, see roadmap Phase 2.3) stores operations locally
4. Token validation: `@fastify/jwt` verifies the token cryptographically — no network call to a central auth service. Token expires in 7 days. Field staff will be online at least once per day (app sync requires connectivity), so refresh happens naturally
5. On reconnect: sync queue flushes; `/auth/refresh` renews the token; cookie is updated

### 7.7 Token blacklist / revocation

Neither cultivate nor farmstock has a token blacklist. FF-DCS has an in-memory blacklist (populated on logout, keyed by `jti`).

For Phase 1: acceptable. Deactivated users' tokens remain valid for up to 7 days (mitigated by the refresh check).

For Phase 2: if near-instant revocation is required (e.g., terminated employee), implement a shared blacklist in the shared SQLite DB — a `token_blacklist` table keyed by `jti` (added at the JWT claim level in Phase 1) with an `expires_at` column so it self-purges.

---

## Section 8: Key Structural Differences to Resolve

Before Phase 1 implementation begins, these specific incompatibilities need resolution decisions:

| # | Issue | Current State | Resolution |
|---|-------|--------------|------------|
| 1 | **FF-DCS iss/aud claims** | FF-DCS tokens have `iss: 'ff-dcs'` and `aud: 'ff-dcs-api'` — other apps would reject them | Phase 1: skip ff-dcs from shared token. Phase 3: relax ff-dcs verify config for cross-app tokens |
| 2 | **Token expiry mismatch** | ff-dcs=15min; cultivate/farmstock=7d | Phase 1: keep separate. Phase 3: ff-dcs issues 24h tokens for cross-app cookie |
| 3 | **User ID type mismatch** | cultivate/farmstock: INTEGER; ff-dcs: UUID | Phase 2: unified table uses INTEGER (simpler, consistent with existing FKs). ff-dcs link via `hatstak_user_id` FK |
| 4 | **Auth method mismatch** | cultivate/farmstock: PIN; ff-dcs: password+MFA | Keep separate. Field apps use PIN; ff-dcs uses password. Not merged in Phase 1 or 2. |
| 5 | **Role name mismatch** | grower/supervisor/admin vs worker/manager/admin | Phase 2: unified role set uses cultivate names (grower/supervisor/admin). Farmstock UI updates labels |
| 6 | **CRIT-01 security gap** | `GET /api/auth/users` has no auth in cultivate (known issue) | Fix before Phase 1: add `requireAuth` preHandler. Cookie-based SSO increases exposure of an unprotected user list endpoint |

---

*Commit: `docs: SSO shared authentication discovery and design`*
