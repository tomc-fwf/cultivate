# SensorPush Environmental Monitor Integration Design

**Status:** Design — not yet implemented  
**Target phase:** Phase 2 (polling + auto-fill) / Phase 3 (trend charts)  
**Related docs:** `docs/metrc-integration-design.md`, `docs/roadmap-phase2-4.md`, `docs/audit-regulatory-compliance.md`

---

## Overview

The cultivate operation uses SensorPush wireless temperature/humidity monitors in each growing area. This document designs the integration between the SensorPush Cloud API and the cultivate application so that:

1. Environmental readings are automatically ingested from all sensors on a 5-minute polling cycle
2. Forms that require ambient conditions (pesticide applications, fertigation, harvest batches) pre-fill from the nearest active sensor — producing auditor-trustworthy records rather than self-reported values
3. The Today screen and BatchDetail pages surface real-time VPD with stage-appropriate color coding
4. The historical readings database supports Phase 3 trend analysis against batch lifecycle events

The integration has zero dependencies on new hardware. SensorPush sensors already deployed by the operation are accessed via the existing SensorPush Cloud API.

---

## Section 1: SensorPush API Overview

### Base URL

```
https://api.sensorpush.com/api/v1/
```

All requests are `POST` with `Content-Type: application/json`. The SensorPush API does not use REST-style GET endpoints for data retrieval — all data endpoints use POST with a JSON request body.

### Authentication Flow

SensorPush uses a two-step OAuth flow that produces a short-lived access token.

#### Step 1 — Authorization

```
POST /oauth/authorize
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

Response:
```json
{
  "authorization": "<authorization_code>"
}
```

The authorization code is **not** a usable token. It is exchanged immediately for an access token.

#### Step 2 — Access Token

```
POST /oauth/accesstoken
Content-Type: application/json

{
  "authorization": "<authorization_code>"
}
```

Response:
```json
{
  "accesstoken": "<jwt_access_token>"
}
```

#### Using the Access Token

All subsequent requests include the access token as a Bearer token:

```
Authorization: <access_token>
```

Note: SensorPush uses the token value directly without the `Bearer` prefix — verify this against the current API documentation during implementation.

#### Token Refresh Strategy

SensorPush access tokens expire. The expiry is not documented by SensorPush and has been reported by users as varying between 1 hour and 24 hours. The recommended strategy:

1. Store the access token in memory (not database) on poller startup
2. On any `401 Unauthorized` response, re-authenticate using the stored credentials and retry the request once
3. Do not attempt proactive refresh via a timer — re-authenticate on demand when the token is rejected
4. Credentials (`SENSORPUSH_EMAIL`, `SENSORPUSH_PASSWORD`) are stored in environment variables only; never in the database

```typescript
// Token refresh pattern for the poller
async function withAuth<T>(apiCall: (token: string) => Promise<T>): Promise<T> {
  try {
    return await apiCall(currentToken);
  } catch (err: unknown) {
    if (isAuthError(err)) {
      currentToken = await authenticate();
      return apiCall(currentToken);
    }
    throw err;
  }
}
```

### Key Endpoints

#### List Sensors

```
POST /devices/sensors
Authorization: <token>
Content-Type: application/json

{}
```

Response:
```json
{
  "sensors": {
    "<sensor_id>": {
      "id": "<sensor_id>",
      "name": "Z1A Row 3 Center",
      "deviceId": "<device_id>",
      "battery": { "voltage": 2.85 },
      "rssi": -65,
      "temperature": { "c": 23.4 },
      "humidity": 62.1,
      "active": true,
      "lastSeen": "2026-05-21T18:42:00Z",
      "type": "HT1"
    }
  }
}
```

The response is a map keyed by sensor ID. The `temperature.c` and `humidity` fields contain the most recent reading at time of the devices list call.

#### Get Readings

```
POST /samples
Authorization: <token>
Content-Type: application/json

{
  "sensors": { "<sensor_id>": {} },
  "startTime": "2026-05-21T18:00:00.000Z",
  "stopTime": "2026-05-21T19:00:00.000Z",
  "limit": 100
}
```

- `sensors`: object with sensor IDs as keys (values can be empty `{}`)
- `startTime` / `stopTime`: ISO-8601 timestamps in UTC
- `limit`: maximum readings per sensor per request; default 100, max varies by account tier

Response:
```json
{
  "sensors": {
    "<sensor_id>": {
      "name": "Z1A Row 3 Center",
      "samples": [
        {
          "observed": "2026-05-21T18:05:00Z",
          "temperature": 23.4,
          "humidity": 62.1
        }
      ]
    }
  },
  "last_time": "2026-05-21T18:05:00Z",
  "total_samples": 12,
  "truncated": false
}
```

- `temperature` is in **Celsius** — must be converted to Fahrenheit before storage
- `humidity` is relative humidity percentage (0–100)
- `truncated: true` means `limit` was hit; paginate using `last_time` as the next `startTime`

#### Sensor Status

```
POST /reports/sensor
Authorization: <token>
Content-Type: application/json

{
  "sensors": ["<sensor_id>"]
}
```

Response includes battery voltage, signal strength (RSSI), firmware version, and last seen timestamp. Use this to populate `cv_sensors.battery_pct` and `cv_sensors.last_seen_at` during polling.

Battery percentage estimation from voltage (HT1/HT2):
- ≥ 2.90V → 100%
- 2.70–2.89V → linear interpolation to ~50%
- 2.50–2.69V → linear interpolation to ~20%
- < 2.50V → 0% (replace immediately)

### Rate Limits

SensorPush has not published official rate limit documentation. Observed behavior from community reports:

- Safe polling interval: **5 minutes minimum** between `/samples` calls per sensor
- `/devices/sensors` call: safe to call once per polling cycle
- Recommend a **1-second delay between requests** for different sensors within a single polling cycle
- On `429 Too Many Requests`: backoff exponentially, starting at 30 seconds

The poller implementation should record `last_polled_at` per sensor and never poll the same sensor more frequently than every 4 minutes.

### Data Available Per Reading

| Field | Source | Unit | Derived |
|-------|--------|------|---------|
| `temp_f` | SensorPush `temperature` × 9/5 + 32 | °F | No |
| `humidity_rh` | SensorPush `humidity` | % | No |
| `dew_point_f` | Calculated from temp + RH | °F | Yes — Magnus formula |
| `vpd_kpa` | Calculated from temp + RH | kPa | Yes — VPD formula |

Dew point and VPD are calculated at ingest time and stored in `cv_sensor_readings` to avoid recomputing during dashboard queries.

---

## Section 2: Sensor-to-Location Assignment Design

### Concept

The operation has sensors physically placed in growing areas. A sensor's location is not fixed forever — a sensor might be moved from Germ-01 to Z2A at the start of a new season. The assignment model tracks this history so that:

- Any reading can be attributed to the correct location at the time it was recorded
- Historical queries can join readings to locations without ambiguity
- Admin UI can show current assignments and allow reassignment

### Migration: `src/db/migrations/016_sensors.ts`

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── cv_sensors ────────────────────────────────────────────────────────────
  // Master record per physical SensorPush device.
  // sensor_id is the SensorPush device ID (string, not auto-increment).
  await knex.schema.createTableIfNotExists('cv_sensors', (table) => {
    table.text('sensor_id').primary();
    table.text('device_name').notNullable();       // name from SensorPush account
    table.text('label').nullable();                // our label, e.g. "Z1A Row 3 Center"
    table.text('model').nullable();                // "HT1", "HT2", etc.
    table.integer('active').notNullable().defaultTo(1);
    table.text('last_seen_at').nullable();
    table.integer('battery_pct').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // ── cv_sensor_location_assignments ───────────────────────────────────────
  // Tracks which sensor is assigned to which location over time.
  // Append-only: unassigned_at is set when a sensor is moved; a new row
  // is inserted for the new location. Never delete assignment rows.
  await knex.schema.createTableIfNotExists('cv_sensor_location_assignments', (table) => {
    table.increments('assignment_id');
    table.text('sensor_id').notNullable().references('sensor_id').inTable('cv_sensors');
    table.integer('location_id').notNullable().references('location_id').inTable('cv_locations');
    // sub_zone_id: for field sensors, which physical sub-zone the sensor is in.
    // Null for pre-field sensors (Germ-01, Seedlings, Cult-Hoop).
    table.text('sub_zone_id').nullable().references('sub_zone_id').inTable('cv_sub_zones');
    table.text('assigned_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('assigned_by').nullable().references('id').inTable('cv_users');
    table.text('unassigned_at').nullable();
    table.integer('unassigned_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // ── cv_sensor_readings ───────────────────────────────────────────────────
  // Time-series environmental readings. Immutable append-only log.
  // At 12 sensors × 288 readings/day = 3,456 rows/day.
  // Over 5 years = ~6.3 million rows. Indexed on (sensor_id, observed_at)
  // and (location_id, observed_at) for typical query patterns.
  await knex.schema.createTableIfNotExists('cv_sensor_readings', (table) => {
    table.increments('reading_id');
    table.text('sensor_id').notNullable().references('sensor_id').inTable('cv_sensors');
    // location_id denormalized from assignment at ingest time.
    // Allows historical queries without joining through assignment history.
    table.integer('location_id').notNullable().references('location_id').inTable('cv_locations');
    // sub_zone_id denormalized similarly; null for pre-field locations.
    table.text('sub_zone_id').nullable();
    table.text('observed_at').notNullable();       // UTC ISO-8601 from SensorPush
    table.real('temp_f').notNullable();            // converted from Celsius at ingest
    table.real('humidity_rh').notNullable();       // relative humidity %
    table.real('dew_point_f').notNullable();       // computed: Magnus formula
    table.real('vpd_kpa').nullable();              // computed: VPD formula
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Indexes for time-series query patterns
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time
     ON cv_sensor_readings (sensor_id, observed_at)`
  );
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_sensor_readings_location_time
     ON cv_sensor_readings (location_id, observed_at)`
  );
  // For "current reading" queries: most recent per location
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_sensor_readings_location_time_desc
     ON cv_sensor_readings (location_id, observed_at DESC)`
  );

  // ── cv_sensor_readings_hourly ────────────────────────────────────────────
  // Materialized hourly summary for Phase 3 trend charts.
  // Populated by the poller's downsampling step (not by a SQLite view —
  // a real table is faster for chart queries spanning months).
  // Full-resolution rows older than 90 days are deleted by the poller's
  // retention job; this table is the permanent record.
  await knex.schema.createTableIfNotExists('cv_sensor_readings_hourly', (table) => {
    table.increments('hourly_id');
    table.text('sensor_id').notNullable().references('sensor_id').inTable('cv_sensors');
    table.integer('location_id').notNullable().references('location_id').inTable('cv_locations');
    table.text('sub_zone_id').nullable();
    table.text('hour_at').notNullable();           // UTC hour, e.g. "2026-05-21T18:00:00Z"
    table.real('temp_f_avg').notNullable();
    table.real('temp_f_min').notNullable();
    table.real('temp_f_max').notNullable();
    table.real('humidity_rh_avg').notNullable();
    table.real('humidity_rh_min').notNullable();
    table.real('humidity_rh_max').notNullable();
    table.real('dew_point_f_avg').notNullable();
    table.real('vpd_kpa_avg').nullable();
    table.real('vpd_kpa_min').nullable();
    table.real('vpd_kpa_max').nullable();
    table.integer('sample_count').notNullable();   // how many raw readings this hour summarizes
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  await knex.schema.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_readings_hourly_sensor_hour
     ON cv_sensor_readings_hourly (sensor_id, hour_at)`
  );
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_sensor_readings_hourly_location_hour
     ON cv_sensor_readings_hourly (location_id, hour_at)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_sensor_readings_hourly');
  await knex.schema.dropTableIfExists('cv_sensor_readings');
  await knex.schema.dropTableIfExists('cv_sensor_location_assignments');
  await knex.schema.dropTableIfExists('cv_sensors');
}
```

### Retention Policy

Full-resolution readings are kept for **90 days** (configurable via `SENSORPUSH_RETENTION_DAYS`). Before deleting any full-resolution rows, the poller's hourly downsampling step must have already written the hourly summary for that hour:

```
DELETE FROM cv_sensor_readings
WHERE observed_at < datetime('now', '-90 days')
  AND strftime('%Y-%m-%dT%H:00:00Z', observed_at) IN (
    SELECT hour_at FROM cv_sensor_readings_hourly
    WHERE sensor_id = cv_sensor_readings.sensor_id
  )
```

This prevents data loss if the downsampler falls behind.

### Location Coverage

Based on the 11 locations seeded in `011_locations.ts`:

| location_id | name | Expected sensor | sub_zone_id |
|-------------|------|----------------|-------------|
| 1 | Germ-01 | 1 sensor (germination chamber) | null |
| 2 | Seedlings | 1 sensor (seedling area) | null |
| 3 | Cult-Hoop | 1 sensor (hoophouse) | null |
| 4–11 | Z1A–Z4B | 1 sensor per sub-zone = 8 sensors | Z1A–Z4B |

**Total: 11 sensors maximum.** At 288 readings/sensor/day × 11 sensors = 3,168 rows/day.

For large sub-zones (A sub-zones: 150 containers, 30-gal pots), the operation may choose to deploy 2–3 sensors at different positions within the sub-zone. The schema supports this: multiple active assignments to the same location_id are allowed. The "current reading" for a location uses the most recent reading across all assigned sensors:

```sql
SELECT r.*
FROM cv_sensor_readings r
JOIN cv_sensor_location_assignments a ON a.sensor_id = r.sensor_id AND a.unassigned_at IS NULL
WHERE a.location_id = ?
ORDER BY r.observed_at DESC
LIMIT 1
```

---

## Section 3: Polling Architecture

Three options evaluated:

### Option A: Integrated with Fastify (setInterval on server startup)

Polling loop starts inside `src/api/app.ts` using `setInterval`.

**Pros:** No additional process; single deployment artifact.

**Cons:**
- Polling stops if the Fastify server restarts (Railway auto-restarts on crash — gaps in data during restart window)
- A slow API call can block the event loop in Node.js single-thread environments
- Ties environmental data collection to application server health

### Option B: Separate polling script — `src/sensor-poller.ts`

A standalone Node.js script run on a schedule via Windows Task Scheduler (development) or a Railway cron job (production).

**Pros:**
- Fully decoupled from the API server; data collection continues when the server is down for deployment
- Independent failure domain — a bug in the poller doesn't affect the API
- Can be run, tested, and restarted without touching the main application

**Cons:**
- Second scheduled task to manage in both development and production environments

### Option C: On-demand polling + cache

Poll SensorPush when the `/api/sensors/current` dashboard endpoint is called. Cache result for 5 minutes in the DB via `cv_sensors.last_polled_at`.

**Pros:** No background process at all; trivial to implement.

**Cons:**
- No historical data collected unless users actively view dashboards
- Dashboard load time includes a live API call (adds 500ms–2s latency)
- Compliance value is reduced — auto-fill only works if a user recently loaded the dashboard

### Recommendation

**Option B (separate poller) for production, Option C as Phase 1 fallback.**

For Phase 1, implement Option C. It requires zero infrastructure change: add a `GET /api/sensors/current` route that calls SensorPush on-demand and caches for 5 minutes. Auto-fill works for typical field workflows where the applicator loads the dashboard before entering the grow area.

For Phase 2, add `src/sensor-poller.ts` as a scheduled task. This builds the historical database needed for Phase 3 trend charts and makes auto-fill reliable even if the dashboard hasn't been loaded recently.

### Phase 1: On-Demand Implementation (Option C)

```typescript
// On GET /api/sensors/current?location_id=X
// 1. Check cv_sensors for any sensor assigned to this location
// 2. If last_seen_at is within 5 minutes, return cached reading
//    (most recent row from cv_sensor_readings)
// 3. Otherwise: call SensorPush /samples for sensors at this location,
//    ingest the new readings, return the most recent

const CACHE_MINUTES = 5;

async function getCurrentReading(locationId: number): Promise<SensorReading | null> {
  const db = getDB();
  const sensor = db.prepare(`
    SELECT s.sensor_id, s.last_seen_at
    FROM cv_sensors s
    JOIN cv_sensor_location_assignments a ON a.sensor_id = s.sensor_id
    WHERE a.location_id = ? AND a.unassigned_at IS NULL AND s.active = 1
    ORDER BY s.last_seen_at DESC
    LIMIT 1
  `).get(locationId) as { sensor_id: string; last_seen_at: string | null } | undefined;

  if (!sensor) return null;

  const cacheThreshold = new Date(Date.now() - CACHE_MINUTES * 60 * 1000).toISOString();
  if (sensor.last_seen_at && sensor.last_seen_at > cacheThreshold) {
    // Cache is fresh — return most recent stored reading
    return db.prepare(`
      SELECT * FROM cv_sensor_readings
      WHERE sensor_id = ? ORDER BY observed_at DESC LIMIT 1
    `).get(sensor.sensor_id) as SensorReading | null;
  }

  // Cache stale — poll SensorPush
  return await pollSensorAndStore(sensor.sensor_id, locationId);
}
```

### Phase 2: Background Poller — `src/sensor-poller.ts`

The poller is a standalone TypeScript script that shares the database layer (`src/db/index.ts`) but has no dependency on Fastify.

#### Poller Logic

```typescript
// src/sensor-poller.ts — runs every 5 minutes via Task Scheduler / Railway cron

async function runPollCycle(): Promise<void> {
  const db = getDB();
  const token = await authenticate();

  // 1. Load all active sensor assignments
  const assignments = db.prepare(`
    SELECT s.sensor_id, a.location_id, a.sub_zone_id, s.last_seen_at
    FROM cv_sensors s
    JOIN cv_sensor_location_assignments a ON a.sensor_id = s.sensor_id
    WHERE a.unassigned_at IS NULL AND s.active = 1
  `).all() as SensorAssignment[];

  for (const assignment of assignments) {
    await sleep(1000); // 1-second between sensors to stay within rate limits

    try {
      // 2. Fetch readings since last poll (or last 15 minutes if never polled)
      const since = assignment.last_seen_at
        ? assignment.last_seen_at
        : new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const readings = await fetchReadings(token, assignment.sensor_id, since);

      // 3. Calculate derived metrics and insert readings
      const insert = db.prepare(`
        INSERT OR IGNORE INTO cv_sensor_readings
          (sensor_id, location_id, sub_zone_id, observed_at, temp_f, humidity_rh, dew_point_f, vpd_kpa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((rows: SensorSample[]) => {
        for (const row of rows) {
          const tempC = (row.temperature_f - 32) * 5 / 9;
          const dewPointF = calcDewPointF(tempC, row.humidity_rh);
          const vpdKpa = calcVPD(tempC, row.humidity_rh);
          insert.run(
            assignment.sensor_id,
            assignment.location_id,
            assignment.sub_zone_id,
            row.observed_at,
            row.temperature_f,
            row.humidity_rh,
            dewPointF,
            vpdKpa
          );
        }
      });

      insertMany(readings);

      // 4. Update sensor metadata
      const report = await fetchSensorReport(token, assignment.sensor_id);
      db.prepare(`
        UPDATE cv_sensors SET last_seen_at = ?, battery_pct = ?, updated_at = datetime('now')
        WHERE sensor_id = ?
      `).run(report.lastSeen, estimateBatteryPct(report.batteryVoltage), assignment.sensor_id);

    } catch (err) {
      console.error(`[sensor-poller] Failed to poll ${assignment.sensor_id}:`, err);
      // Continue with remaining sensors — don't abort the full cycle
    }
  }

  // 5. Hourly downsampling (runs on poller start and on the hour)
  await downsampleToHourly(db);

  // 6. Retention: delete full-resolution rows older than RETENTION_DAYS
  //    (only after downsampling confirms hourly row exists)
  await applyRetentionPolicy(db);
}
```

#### Dew Point Formula (Magnus Approximation)

```typescript
function calcDewPointF(tempC: number, rh: number): number {
  const a = 17.625;
  const b = 243.04;
  const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  const dewPointC = (b * gamma) / (a - gamma);
  return dewPointC * 9 / 5 + 32;
}
```

The Magnus approximation has ±0.35°C accuracy for temperatures between −40°C and +60°C — fully adequate for cultivation monitoring.

#### VPD Formula

```typescript
function calcVPD(tempC: number, rh: number): number {
  // Tetens equation for saturation vapor pressure (kPa)
  const svp = 0.6108 * Math.exp(17.27 * tempC / (tempC + 237.3));
  // Actual vapor pressure
  const avp = svp * (rh / 100);
  // VPD
  return svp - avp;
}
```

#### VPD Stage Thresholds (Alert Configuration)

| Stage | Status column | Min VPD (kPa) | Max VPD (kPa) | Notes |
|-------|---------------|--------------|--------------|-------|
| Seedling (`seedling`) | — | 0.4 | 0.8 | High humidity tolerance; root development |
| Veg (`cult-hoop`, `field-veg`) | — | 0.8 | 1.2 | Transpiration-driven growth |
| Early flower (`field-flower` wk 1–2) | — | 1.0 | 1.5 | Transition zone |
| Late flower (`field-flower` wk 3+) | — | 1.5 | 2.0 | Mold risk at high RH; push VPD up |
| Flush (`flush`) | — | 1.2 | 1.8 | Similar to late flower |
| Harvest window/harvesting | — | 1.2 | 2.0 | Minimize mold during drying |

These thresholds are stored as application-layer constants in `src/lib/sensor-thresholds.ts` (not the database) since they are agronomic standards, not user-configurable data.

#### Windows Task Scheduler Setup (Development)

```powershell
# Register the poller as a scheduled task (run every 5 minutes)
$action = New-ScheduledTaskAction `
  -Execute "node" `
  -Argument "C:\projects\cultivate\dist\sensor-poller.js" `
  -WorkingDirectory "C:\projects\cultivate"

$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 4)

Register-ScheduledTask `
  -TaskName "CultivateSensorPoller" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest
```

#### Railway Cron Job Setup (Production)

Add to `railway.toml` or as a separate Railway service pointing to the same Docker image:

```toml
[cron]
schedule = "*/5 * * * *"
command = "node dist/sensor-poller.js"
```

---

## Section 4: Auto-Fill Integration

This is the highest compliance value of the entire integration. Several forms currently require manual entry of ambient conditions that are already known from sensors. Auto-fill produces records that are traceable to calibrated instrumentation rather than staff recollection.

### Forms That Benefit

| Form | Component | Fields auto-filled | Impact |
|------|-----------|-------------------|--------|
| Pesticide application | `PesticideNew.jsx` | `ambient_temp_f`, `ambient_rh` | **High** — MN 18B.37 required fields; sensor-sourced values are auditor-trustworthy |
| Fertigation application | `FertigationNew.jsx` | `ambient_temp_f`, `ambient_rh` | Medium — nice to have; not regulatory required |
| Harvest batch creation | `HarvestDashboard.jsx` | `ambient_temp_f`, `ambient_rh` | **High** — harvest conditions matter for yield quality and METRC records |
| Foliar application | `FoliarNew.jsx` | `ambient_temp_f`, `ambient_rh` | Medium |
| Waste trim (future) | `WasteTrimForm.jsx` | Could add ambient fields | Low |

### API Endpoint for Auto-Fill

```
GET /api/sensors/current?location_id=4
```

Response:

```json
{
  "location_id": 4,
  "location_name": "Z1A",
  "sensor_id": "ABC123",
  "sensor_label": "Z1A Row 3 Center",
  "observed_at": "2026-05-21T18:42:00Z",
  "age_seconds": 180,
  "temp_f": 74.3,
  "humidity_rh": 58.2,
  "dew_point_f": 59.8,
  "vpd_kpa": 1.34,
  "vpd_stage_status": "optimal"
}
```

`age_seconds` is the number of seconds since the reading was taken. The frontend uses this to display the recency badge and to decide whether to show a "stale" warning.

### Frontend Auto-Fill Pattern

When a form mounts with a known batch context, it looks up the current location's sensor reading:

```javascript
// In PesticideNew.jsx (and other forms)
useEffect(() => {
  if (!batch?.location_id) return;

  api.getSensorCurrentReading(batch.location_id)
    .then(reading => {
      if (reading && reading.age_seconds < 600) { // < 10 minutes old
        setSensorReading(reading);
        // Pre-fill only if the field is currently empty
        if (!ambientTemp) setAmbientTemp(reading.temp_f.toFixed(1));
        if (!ambientRh) setAmbientRh(reading.humidity_rh.toFixed(1));
      }
    })
    .catch(() => { /* silently ignore — sensor unavailable */ });
}, [batch?.location_id]);
```

### Sensor Badge Component

A reusable `SensorBadge` component displays the auto-fill source next to pre-filled fields:

```jsx
// client/src/components/SensorBadge.jsx
// Usage: <SensorBadge reading={sensorReading} />
// Renders: "From sensor — 3 min ago" in small muted text below the input

function SensorBadge({ reading }) {
  if (!reading) return null;
  const minutes = Math.round(reading.age_seconds / 60);
  const label = minutes < 1 ? 'just now' : `${minutes} min ago`;
  const stale = reading.age_seconds > 600;

  return (
    <span className={`text-xs mt-1 ${stale ? 'text-amber-600' : 'text-muted-foreground'}`}>
      {stale ? '⚠ Sensor data stale — ' : ''}From sensor — {label}
    </span>
  );
}
```

### Override Behavior

Auto-filled values are **editable**. The form field shows the sensor value as a pre-fill, not a locked read-only value. If the operator changes the value:

1. The field value updates normally
2. The `SensorBadge` is hidden (operator has overridden it)
3. The application record stores the manually-entered value
4. No record of the override is kept in the application record — the sensor reading can be cross-referenced from `cv_sensor_readings` via timestamp if needed for audit

### Graceful Degradation

When no sensor is assigned to the batch's location, or when the SensorPush API is unavailable:

- Fields remain empty (manual entry required — same as before the integration)
- No error shown; the SensorBadge simply doesn't appear
- This preserves the behavior pre-integration for users in locations without sensors

---

## Section 5: Dashboard Integration

### Today Screen — "Current Conditions" Panel

Location in the Today screen layout (below active REIs, above pending tasks):

```
┌─────────────────────────────────────────────────────────┐
│  Current Conditions                        Updated 2m ago │
├─────────────────────────────────────────────────────────┤
│  Z1A   72°F  RH 58%  VPD 1.3 kPa  ●  Optimal (Flower)  │
│  Z1B   71°F  RH 61%  VPD 1.1 kPa  ●  Optimal (Veg)     │
│  Z2A   75°F  RH 72%  VPD 0.8 kPa  ●  High humidity ⚠   │
│  Z2B   73°F  RH 55%  VPD 1.5 kPa  ●  Optimal (Flower)  │
│  Seedlings  68°F  RH 70%  VPD 0.7 kPa  ●  Optimal      │
│  Germ-01    ─ No recent reading ─                        │
└─────────────────────────────────────────────────────────┘
```

VPD color coding:
- **Green** — within optimal range for the current batch stage
- **Amber** — marginal (±20% outside optimal range)
- **Red** — significantly out of range (>20% outside optimal range, or no reading for >30 minutes)

Implementation: the Today screen already calls multiple API endpoints at mount. Add `api.getSensorCurrentReadings()` (plural — all locations at once) as a parallel call alongside existing fetches:

```javascript
// In Today.jsx, add to the parallel fetches:
const [conditions, setConditions] = useState([]);

useEffect(() => {
  Promise.all([
    api.getTodayData(),
    api.getSensorCurrentReadings(),   // new
  ]).then(([today, sensorData]) => {
    setTodayData(today);
    setConditions(sensorData);
  });
}, []);
```

### Compliance Dashboard Panel — Environmental Alerts

A new panel in the compliance section (alongside REI status and METRC sync status) showing:

1. **Out-of-range VPD alerts** — any location with a batch where current VPD is more than 20% outside the stage-appropriate range
2. **Silent sensors** — any sensor that hasn't reported in > 30 minutes (battery or connectivity issue)
3. **Unassigned sensors** — sensors synced from SensorPush but not yet assigned to a location

```
┌─────────────────────────────────────────────────────────┐
│  Environmental Alerts                                    │
├─────────────────────────────────────────────────────────┤
│  ⚠  Z2A: RH 72% — high humidity during flower stage    │
│      VPD 0.8 kPa (target: 1.0–1.5 kPa)                 │
│  ●  All sensors reporting (last check 2 min ago)        │
└─────────────────────────────────────────────────────────┘
```

### BatchDetail Panel

When viewing a batch in `field-veg` or `field-flower` status, the batch detail page shows a "Current Conditions" section:

```
Current Conditions — Z1A
  Temp: 72°F   RH: 58%   Dew point: 56°F   VPD: 1.3 kPa
  Stage target: 1.0–1.5 kPa (Flower)  ● Optimal
  Trend: ↑ 2°F warmer than 24h average  → similar humidity
  Last reading: 3 minutes ago
```

The trend arrows are computed by comparing the current reading against the 24-hour average from `cv_sensor_readings_hourly`. API endpoint: `GET /api/sensors/current?location_id=X` already includes this data.

### ContainerDetail Panel

For field containers, show the current sensor reading for the container's sub-zone:

```
Environment (Z1A)
  72°F  •  RH 58%  •  VPD 1.3 kPa  •  3 min ago
```

No additional API call needed — `ContainerDetail.jsx` already loads the batch, which has a `location_id`. Reuse the same sensor hook already used by forms.

### Historical Charts (Phase 3)

Three chart types for Phase 3:

1. **Temperature / RH over batch lifecycle** — x-axis is batch age (days since sow), y-axis is temp °F and RH %. Batch stage transitions overlaid as vertical markers. Source: `cv_sensor_readings_hourly`.

2. **VPD trend** — same x-axis, with stage-optimal VPD band highlighted as a shaded region. Helps identify stress events.

3. **Cross-batch environmental comparison** — same strain, different sub-zones or seasons: how similar were the environmental conditions? Source: `cv_sensor_readings_hourly` joined to `cv_batch_location_history`.

All Phase 3 charts use `recharts` (already selected in `docs/roadmap-phase2-4.md`). The hourly summary table keeps chart query latency under 200ms even for full season views.

---

## Section 6: API Routes

New route file: `src/api/routes/sensors.ts`  
Register in `src/api/app.ts` at prefix `/api/sensors`.

### Route Inventory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sensors` | requireAuth | List all sensors with current status |
| POST | `/api/sensors/sync` | requireRole('admin') | Pull latest sensor list from SensorPush |
| GET | `/api/sensors/current` | requireAuth | Current readings for all assigned sensors (or ?location_id=X) |
| GET | `/api/sensors/:sensorId/readings` | requireAuth | Historical readings with ?start&end&resolution params |
| POST | `/api/sensors/:sensorId/assign` | requireRole('admin') | Assign sensor to a location |
| POST | `/api/sensors/:sensorId/unassign` | requireRole('admin') | Unassign sensor |
| GET | `/api/sensors/assignments` | requireAuth | List all current assignments |

### Route Specifications

#### `GET /api/sensors`

Returns all sensors in `cv_sensors` with their current assignment (if any) and the most recent reading timestamp.

```json
[
  {
    "sensor_id": "ABC123",
    "device_name": "Germ-01 Sensor",
    "label": "Germ-01 Center",
    "model": "HT1",
    "active": 1,
    "last_seen_at": "2026-05-21T18:42:00Z",
    "battery_pct": 82,
    "current_location_id": 1,
    "current_location_name": "Germ-01",
    "current_sub_zone_id": null,
    "latest_reading": {
      "observed_at": "2026-05-21T18:42:00Z",
      "temp_f": 68.2,
      "humidity_rh": 72.1,
      "dew_point_f": 60.8,
      "vpd_kpa": 0.71
    }
  }
]
```

#### `POST /api/sensors/sync`

Calls SensorPush `/devices/sensors`, upserts `cv_sensors` rows, returns count of new/updated sensors. Admin only.

```json
{ "synced": 11, "new": 2, "updated": 9 }
```

#### `GET /api/sensors/current`

Query params: `location_id` (optional integer)

If `location_id` provided: returns reading for that location only. If omitted: returns current reading for all active locations with assigned sensors.

```json
[
  {
    "location_id": 4,
    "location_name": "Z1A",
    "sub_zone_id": "Z1A",
    "sensor_id": "ABC123",
    "sensor_label": "Z1A Row 3 Center",
    "observed_at": "2026-05-21T18:42:00Z",
    "age_seconds": 180,
    "temp_f": 74.3,
    "humidity_rh": 58.2,
    "dew_point_f": 59.8,
    "vpd_kpa": 1.34,
    "vpd_stage_status": "optimal",
    "vpd_stage_range": { "min": 1.0, "max": 1.5 },
    "active_batch": {
      "batch_id": 7,
      "status": "field-flower",
      "strain_name": "Northern Lights Auto"
    }
  }
]
```

`vpd_stage_status` is computed server-side by joining the location's current active batch (if any) to the VPD thresholds in `src/lib/sensor-thresholds.ts`. Values: `"optimal"`, `"marginal"`, `"out_of_range"`, `"no_batch"`.

#### `GET /api/sensors/:sensorId/readings`

Query params:
- `start` (ISO-8601, required)
- `end` (ISO-8601, defaults to now)
- `resolution` (`"raw"` | `"hourly"`, defaults to `"hourly"`)

Returns paginated readings. `"raw"` returns from `cv_sensor_readings` (only available for the last 90 days); `"hourly"` returns from `cv_sensor_readings_hourly`.

Maximum range for `"raw"`: 7 days (enforced server-side to prevent unbounded queries).

#### `POST /api/sensors/:sensorId/assign`

Request body (Zod schema):
```typescript
z.object({
  location_id: z.number().int().positive(),
  sub_zone_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})
```

Creates a new `cv_sensor_location_assignments` row. If the sensor has an existing active assignment to a different location, that assignment is closed with `unassigned_at = now()` and `unassigned_by = requesting user` in the same transaction.

#### `POST /api/sensors/:sensorId/unassign`

Request body: `{ notes?: string }`

Sets `unassigned_at` and `unassigned_by` on the current active assignment. Sensor remains in `cv_sensors` but will show as unassigned.

#### `GET /api/sensors/assignments`

Returns all current (non-unassigned) assignments with sensor and location details:

```json
[
  {
    "assignment_id": 1,
    "sensor_id": "ABC123",
    "sensor_label": "Z1A Row 3 Center",
    "location_id": 4,
    "location_name": "Z1A",
    "sub_zone_id": "Z1A",
    "assigned_at": "2026-05-01T00:00:00Z",
    "assigned_by_name": "Tom"
  }
]
```

### `client/src/api.js` Methods to Add

```javascript
// Sensor API methods
getSensors: () => request('/api/sensors'),
syncSensors: () => request('/api/sensors/sync', { method: 'POST', body: {} }),
getSensorCurrentReading: (locationId) =>
  request(`/api/sensors/current?location_id=${locationId}`),
getSensorCurrentReadings: () => request('/api/sensors/current'),
getSensorReadings: (sensorId, params) =>
  request(`/api/sensors/${sensorId}/readings?${new URLSearchParams(params)}`),
assignSensor: (sensorId, body) =>
  request(`/api/sensors/${sensorId}/assign`, { method: 'POST', body }),
unassignSensor: (sensorId, body) =>
  request(`/api/sensors/${sensorId}/unassign`, { method: 'POST', body }),
getSensorAssignments: () => request('/api/sensors/assignments'),
```

---

## Section 7: Environment Variables Required

### New Variables

```bash
# SensorPush Cloud API credentials
SENSORPUSH_EMAIL=your-sensorpush-account@email.com
SENSORPUSH_PASSWORD=your-sensorpush-password

# Polling configuration
SENSORPUSH_POLL_INTERVAL_MINUTES=5    # Default: 5. Minimum: 5 (rate limit protection)
SENSORPUSH_RETENTION_DAYS=90          # Default: 90. Full-resolution reading retention.
```

### Updated `.env.example`

```bash
PORT=3002
DB_PATH=./data/cultivate.db
JWT_SECRET=cultivate-dev-secret-change-in-production
ALLOWED_ORIGIN=http://localhost:5174
NODE_ENV=development
FARMSTOCK_URL=https://farmstock.hatstak.app
FARMSTOCK_SERVICE_KEY=change-me-match-farmstock-CULTIVATE_SERVICE_KEY

# SensorPush integration (optional — features degrade gracefully if not set)
SENSORPUSH_EMAIL=
SENSORPUSH_PASSWORD=
SENSORPUSH_POLL_INTERVAL_MINUTES=5
SENSORPUSH_RETENTION_DAYS=90
```

### `docs/environment-variables.md` Additions

Create `docs/environment-variables.md` if it doesn't exist:

```markdown
## SensorPush Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENSORPUSH_EMAIL` | For sensor features | — | SensorPush account email |
| `SENSORPUSH_PASSWORD` | For sensor features | — | SensorPush account password |
| `SENSORPUSH_POLL_INTERVAL_MINUTES` | No | `5` | Polling interval in minutes. Do not set below 5. |
| `SENSORPUSH_RETENTION_DAYS` | No | `90` | Days to keep full-resolution readings before downsampling |
```

### Security Notes

- `SENSORPUSH_PASSWORD` is a plaintext credential in the environment. It must **never** be committed to git, included in logs, or returned by any API endpoint.
- The poller accesses credentials via `process.env` only; they are never stored in the database.
- If the SensorPush account supports API key authentication (check current SensorPush documentation — their API has been updated since initial release), prefer API keys over email/password credentials.
- Railway secrets manager should be used for production values; never use the `.env` file on Railway deployments.

---

## Section 8: Compliance Value

### 1. MN 18B.37 Ambient Conditions — From Instrumentation, Not Memory

MN Statute 18B.37 requires ambient temperature and wind speed on every pesticide application record. Currently, applicators enter these values manually — they recall what the temperature was or estimate from experience.

With SensorPush auto-fill:
- `ambient_temp_f` is populated from a calibrated sensor at the exact time of application
- `ambient_rh` is similarly sourced
- The reading's `observed_at` timestamp is within 5 minutes of the application timestamp
- The sensor's `sensor_id` can be cross-referenced in `cv_sensor_readings` to show the precise reading used

**Audit impact:** If an MDA inspector asks "how do you know it was 72°F when you applied ZeroTol?" the answer is "from our calibrated SensorPush HT1 sensor in Z1A, which recorded 72.3°F at 14:38 UTC — 2 minutes before the application." This is materially stronger than "the applicator remembered." This matters most when defending pesticide records under Statute 18B.37.

**Note on wind speed:** SensorPush sensors do not measure wind speed. The `wind_speed_mph` field on pesticide applications remains manually entered. Phase 3 could add a Davis Instruments or similar wind sensor if the operation determines wind data is worth the additional instrumentation.

### 2. Harvest Batch Conditions — Traceable Environmental Record

`cv_harvest_batches.ambient_temp_f` and `.ambient_rh` are required for METRC harvest batch records. Currently manually entered at the time of harvest batch creation.

With auto-fill, the conditions at the time harvest began are sourced from the sensor deployed in the batch's sub-zone. This creates a verifiable record:

> "Batch 2026-AUTO-3 harvested under these conditions: 74°F, 52% RH, VPD 1.58 kPa — as recorded by sensor Z1A-Row3 at 06:12 UTC."

This is useful for:
- METRC audit if conditions are questioned
- Internal post-harvest analysis (did the harvest conditions correlate with cure quality?)
- Mold/disease investigation if a batch fails lab testing — was the RH too high during harvest?

### 3. Environmental Stress Documentation

When a batch has unexpected disease, pest pressure, or yield variance, investigators ask: what were the conditions? With 5-year retention of hourly environmental data, the operation can produce:

```
Batch 2026-PHOTO-2 (Z2A, Northern Lights Photo)
VPD chart: Days 45–52 of flower showed sustained VPD below 0.8 kPa 
(ambient RH 78–82%) — favorable for Botrytis cinerea. Observed B. cinerea 
at containers Z2-A-R3-C08 through C14 on Day 53.
```

This documentation strengthens both internal response (we know why this happened) and external position if a contaminated batch is tested and questioned by OCM.

### 4. REI Verification Support

When REI is active on a sub-zone, workers are not permitted to re-enter. The sensor record provides indirect verification:

- If re-entry would expose workers to pesticide residue, any legitimate activity in the zone would require REI clearance
- The fact that no REI clearance was logged, combined with sensor readings showing no unusual activity patterns (e.g., no data gaps suggesting the sensor was physically disturbed), supports the claim that the REI was honored
- This is circumstantial, not direct, but adds a layer of documentation that paper-based records cannot provide

### 5. Pre-Harvest Gate — Environmental Compliance Check

The pre-harvest gate checklist in `docs/ocm-reporting-requirements.md` (Section 6) can be extended:

```
□ All ambient condition fields on pesticide applications within past 30 days 
  are sensor-sourced (badge: "From sensor") rather than manual
□ Harvest batch conditions pre-filled from sensor data
□ No out-of-range VPD alerts active in the batch's sub-zone
```

### 6. Audit Trail Linkage

For each pesticide application record that has sensor-sourced ambient data, the audit record can include:

```
ambient_temp_f: 72.3°F
  Source: cv_sensor_readings.reading_id = 84231
  Sensor: Z1A Row 3 Center (SensorPush HT1, battery 82%)
  Reading observed_at: 2026-05-21T14:38:02Z
  Application applied_at: 2026-05-21T14:40:11Z
  Delta: 2 minutes
```

This linkage requires storing `sensor_reading_id` on the application record. Add this as an optional FK column in a follow-up migration:

```sql
-- Future: migration 017 (or bundled with 016)
ALTER TABLE cv_applications_pesticide ADD COLUMN sensor_reading_id INTEGER
  REFERENCES cv_sensor_readings(reading_id);
ALTER TABLE cv_applications_fertigation ADD COLUMN sensor_reading_id INTEGER
  REFERENCES cv_sensor_readings(reading_id);
ALTER TABLE cv_harvest_batches ADD COLUMN sensor_reading_id INTEGER
  REFERENCES cv_sensor_readings(reading_id);
```

When auto-fill populates the form, the frontend receives the `reading_id` of the reading used. On form submit, this is passed as an optional field and stored. This creates an auditable chain: application record → sensor reading → sensor device → SensorPush account.

---

## Implementation Sequence

| Phase | Item | Effort |
|-------|------|--------|
| Phase 2 | Migration `016_sensors.ts` | S |
| Phase 2 | `POST /api/sensors/sync` — admin sync from SensorPush | S |
| Phase 2 | Sensor assignment admin UI | S |
| Phase 2 | `GET /api/sensors/current` — on-demand poll with 5-min cache (Option C) | M |
| Phase 2 | Auto-fill integration in `PesticideNew.jsx`, `FertigationNew.jsx`, `HarvestDashboard.jsx` | M |
| Phase 2 | `SensorBadge` component | S |
| Phase 2 | Today screen "Current Conditions" panel | M |
| Phase 2 | `src/sensor-poller.ts` — background polling script | M |
| Phase 2 | Windows Task Scheduler registration for poller | S |
| Phase 2 | Hourly downsampling + 90-day retention in poller | S |
| Phase 3 | `GET /api/sensors/:sensorId/readings` with resolution param | S |
| Phase 3 | Batch lifecycle temperature/RH/VPD trend charts in `BatchDetail.jsx` | L |
| Phase 3 | Cross-batch environmental comparison analytics | L |
| Future | `sensor_reading_id` FK on application tables (audit linkage) | S |
| Future | Wind speed sensor integration (Davis Instruments or equivalent) | M |

---

*Last updated: 2026-05-21. Design document — not yet implemented.*
