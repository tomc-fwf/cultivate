import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { sensorPushClient } from '../../lib/sensorpush-client.js';
import { pollSensors } from '../../lib/sensor-poller.js';
import { z } from 'zod';

interface SensorIdParams { sensorId: string }
interface AssignmentIdParams { assignmentId: string }

const AssignSensorSchema = z.object({
  sensor_id: z.string().min(1),
  location_id: z.number().int().positive(),
  sub_zone_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type AssignSensorBody = z.infer<typeof AssignSensorSchema>;

const ReadingsQuerySchema = z.object({
  start: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'start must be a valid ISO date' }),
  end: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'end must be a valid ISO date' }).optional(),
  resolution: z.enum(['raw', 'hourly']).default('raw'),
});

const CurrentConditionsQuerySchema = z.object({
  location_id: z.string().regex(/^\d+$/, 'location_id must be a positive integer').optional(),
  sub_zone_id: z.string().optional(),
});

const CACHE_MINUTES = 5;
const STALE_MINUTES = 30;

const sensorsRoutes: FastifyPluginAsync = async (app) => {
  // GET / — list all sensors with current assignment and latest reading
  app.get('/', { preHandler: requireAuth }, async (_req, reply) => {
    const db = getDB();
    const sensors = db.prepare(`
      SELECT s.*,
             a.location_id AS current_location_id,
             l.name AS current_location_name,
             a.sub_zone_id AS current_sub_zone_id
      FROM cv_sensors s
      LEFT JOIN cv_sensor_location_assignments a ON a.sensor_id = s.sensor_id AND a.unassigned_at IS NULL
      LEFT JOIN cv_locations l ON l.location_id = a.location_id
      ORDER BY s.device_name
    `).all() as Array<Record<string, unknown>>;

    const enriched = sensors.map(sensor => {
      const latest = db.prepare(`
        SELECT observed_at, temp_f, humidity_rh, dew_point_f, vpd_kpa
        FROM cv_sensor_readings
        WHERE sensor_id = ?
        ORDER BY observed_at DESC
        LIMIT 1
      `).get(sensor['sensor_id']) as Record<string, unknown> | undefined;

      return { ...sensor, latest_reading: latest ?? null };
    });

    return reply.send(enriched);
  });

  // POST /sync — upsert sensors from SensorPush into cv_sensors
  app.post('/sync', { preHandler: requireRole('admin') }, async (_req, reply) => {
    const db = getDB();
    const data = await sensorPushClient.getSensors() as {
      sensors?: Record<string, {
        id?: string;
        name?: string;
        type?: string;
        active?: boolean;
        lastSeen?: string;
        battery?: { voltage?: number };
      }>;
    };

    const sensors = data.sensors ?? {};
    let newCount = 0;
    let updatedCount = 0;

    const upsert = db.prepare(`
      INSERT INTO cv_sensors (sensor_id, device_name, model, active, last_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(sensor_id) DO UPDATE SET
        device_name = excluded.device_name,
        model = excluded.model,
        active = excluded.active,
        last_seen_at = excluded.last_seen_at,
        updated_at = datetime('now')
    `);

    const checkExists = db.prepare(`SELECT sensor_id FROM cv_sensors WHERE sensor_id = ?`);

    db.transaction(() => {
      for (const [sensorId, info] of Object.entries(sensors)) {
        const exists = checkExists.get(sensorId);
        if (!exists) newCount++;
        else updatedCount++;

        upsert.run(
          sensorId,
          info.name ?? sensorId,
          info.type ?? null,
          info.active ? 1 : 0,
          info.lastSeen ?? null
        );
      }
    })();

    return reply.code(200).send({ synced: newCount + updatedCount, new: newCount, updated: updatedCount });
  });

  // GET /assignments — list current assignments
  app.get('/assignments', { preHandler: requireAuth }, async (_req, reply) => {
    const db = getDB();
    const assignments = db.prepare(`
      SELECT csa.*,
             s.device_name AS sensor_device_name,
             s.label AS sensor_label,
             l.name AS location_name,
             u.name AS assigned_by_name
      FROM cv_sensor_location_assignments csa
      JOIN cv_sensors s ON s.sensor_id = csa.sensor_id
      JOIN cv_locations l ON l.location_id = csa.location_id
      LEFT JOIN cv_users u ON u.id = csa.assigned_by
      WHERE csa.unassigned_at IS NULL
      ORDER BY l.name, s.device_name
    `).all();
    return reply.send(assignments);
  });

  // POST /assignments — assign a sensor to a location
  app.post<{ Body: AssignSensorBody }>('/assignments', { preHandler: requireRole('supervisor') }, async (req, reply) => {
    let body: AssignSensorBody;
    try {
      body = AssignSensorSchema.parse(req.body);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
      throw e;
    }

    const db = getDB();
    const user = (req as unknown as { user: { id: number } }).user;

    // Validate sensor exists
    const sensor = db.prepare(`SELECT sensor_id FROM cv_sensors WHERE sensor_id = ?`).get(body.sensor_id);
    if (!sensor) return reply.code(404).send({ error: 'Sensor not found' });

    // Validate location exists
    const location = db.prepare(`SELECT location_id FROM cv_locations WHERE location_id = ?`).get(body.location_id);
    if (!location) return reply.code(404).send({ error: 'Location not found' });

    const now = new Date().toISOString();

    const result = db.transaction(() => {
      // Close any existing active assignment for this sensor
      db.prepare(`
        UPDATE cv_sensor_location_assignments
        SET unassigned_at = ?, unassigned_by = ?
        WHERE sensor_id = ? AND unassigned_at IS NULL
      `).run(now, user.id, body.sensor_id);

      // Create new assignment
      const info = db.prepare(`
        INSERT INTO cv_sensor_location_assignments
          (sensor_id, location_id, sub_zone_id, assigned_at, assigned_by, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        body.sensor_id,
        body.location_id,
        body.sub_zone_id ?? null,
        now,
        user.id,
        body.notes ?? null
      );

      return db.prepare(`
        SELECT csa.*, l.name AS location_name
        FROM cv_sensor_location_assignments csa
        JOIN cv_locations l ON l.location_id = csa.location_id
        WHERE csa.assignment_id = ?
      `).get(info.lastInsertRowid);
    })();

    return reply.code(201).send(result);
  });

  // DELETE /assignments/:assignmentId — unassign
  app.delete<{ Params: AssignmentIdParams }>('/assignments/:assignmentId', { preHandler: requireRole('supervisor') }, async (req, reply) => {
    const db = getDB();
    const user = (req as unknown as { user: { id: number } }).user;
    const assignmentId = parseInt(req.params.assignmentId, 10);

    const assignment = db.prepare(`
      SELECT * FROM cv_sensor_location_assignments WHERE assignment_id = ? AND unassigned_at IS NULL
    `).get(assignmentId);
    if (!assignment) return reply.code(404).send({ error: 'Assignment not found or already unassigned' });

    db.prepare(`
      UPDATE cv_sensor_location_assignments
      SET unassigned_at = datetime('now'), unassigned_by = ?
      WHERE assignment_id = ?
    `).run(user.id, assignmentId);

    return reply.code(200).send({ success: true });
  });

  // GET /current — current readings for all assigned sensors (or filtered by location/sub_zone)
  app.get('/current', { preHandler: requireAuth }, async (req, reply) => {
    let qParsed: z.infer<typeof CurrentConditionsQuerySchema>;
    try {
      qParsed = CurrentConditionsQuerySchema.parse(req.query);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
      throw e;
    }

    const db = getDB();
    const locationId = qParsed.location_id ? parseInt(qParsed.location_id, 10) : null;
    const subZoneId = qParsed.sub_zone_id ?? null;
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
    const cacheThreshold = new Date(Date.now() - CACHE_MINUTES * 60 * 1000).toISOString();

    // Get all active assignments (optionally filtered)
    let whereClause = 'csa.unassigned_at IS NULL AND s.active = 1';
    const params: unknown[] = [];
    if (locationId) { whereClause += ' AND csa.location_id = ?'; params.push(locationId); }
    else if (subZoneId) { whereClause += ' AND csa.sub_zone_id = ?'; params.push(subZoneId); }

    const assignments = db.prepare(`
      SELECT s.sensor_id, s.device_name, s.label AS sensor_label, s.last_seen_at,
             csa.location_id, l.name AS location_name, csa.sub_zone_id
      FROM cv_sensors s
      JOIN cv_sensor_location_assignments csa ON csa.sensor_id = s.sensor_id
      JOIN cv_locations l ON l.location_id = csa.location_id
      WHERE ${whereClause}
      ORDER BY l.name
    `).all(...params) as Array<{
      sensor_id: string;
      device_name: string;
      sensor_label: string | null;
      last_seen_at: string | null;
      location_id: number;
      location_name: string;
      sub_zone_id: string | null;
    }>;

    // For each sensor, check cache freshness; poll on-demand if stale
    const sensorsToPoll = assignments
      .filter(a => !a.last_seen_at || a.last_seen_at < cacheThreshold)
      .map(a => a.sensor_id);

    if (sensorsToPoll.length > 0 && process.env.SENSORPUSH_EMAIL) {
      try {
        // On-demand poll for stale sensors (Option C behavior)
        const startTime = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
        await sensorPushClient.getSamples(sensorsToPoll, startTime, 10);
      } catch {
        // Silently ignore — return whatever is in the DB
      }
    }

    const results = assignments.map(a => {
      const reading = db.prepare(`
        SELECT reading_id, observed_at, temp_f, humidity_rh, dew_point_f, vpd_kpa
        FROM cv_sensor_readings
        WHERE sensor_id = ? AND observed_at >= ?
        ORDER BY observed_at DESC
        LIMIT 1
      `).get(a.sensor_id, staleThreshold) as Record<string, unknown> | undefined;

      const ageSec = reading
        ? Math.round((Date.now() - new Date(reading['observed_at'] as string).getTime()) / 1000)
        : null;

      return {
        sensor_id: a.sensor_id,
        sensor_label: a.sensor_label ?? a.device_name,
        location_id: a.location_id,
        location_name: a.location_name,
        sub_zone_id: a.sub_zone_id,
        observed_at: reading?.['observed_at'] ?? null,
        age_seconds: ageSec,
        temp_f: reading?.['temp_f'] ?? null,
        humidity_rh: reading?.['humidity_rh'] ?? null,
        dew_point_f: reading?.['dew_point_f'] ?? null,
        vpd_kpa: reading?.['vpd_kpa'] ?? null,
      };
    });

    return reply.send(results);
  });

  // GET /:sensorId/readings — historical readings
  app.get<{ Params: SensorIdParams }>('/:sensorId/readings', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDB();
    const sensorId = req.params.sensorId;

    const sensor = db.prepare(`SELECT sensor_id FROM cv_sensors WHERE sensor_id = ?`).get(sensorId);
    if (!sensor) return reply.code(404).send({ error: 'Sensor not found' });

    let parsed: z.infer<typeof ReadingsQuerySchema>;
    try {
      parsed = ReadingsQuerySchema.parse(req.query);
    } catch (err: unknown) {
      const ze = err as { issues?: unknown[] };
      return reply.code(400).send({ error: 'Validation failed', issues: ze.issues });
    }

    const { start, end, resolution } = parsed;
    const endTime = end ?? new Date().toISOString();

    if (resolution === 'raw') {
      // Limit raw queries to 7 days to prevent unbounded results
      const startDate = new Date(start);
      const endDate = new Date(endTime);
      if (endDate.getTime() - startDate.getTime() > 7 * 24 * 60 * 60 * 1000) {
        return reply.code(400).send({ error: 'Raw resolution is limited to a 7-day range. Use hourly for longer ranges.' });
      }

      const readings = db.prepare(`
        SELECT reading_id, observed_at, temp_f, humidity_rh, dew_point_f, vpd_kpa
        FROM cv_sensor_readings
        WHERE sensor_id = ? AND observed_at >= ? AND observed_at <= ?
        ORDER BY observed_at ASC
        LIMIT 2016
      `).all(sensorId, start, endTime);
      return reply.send(readings);
    }

    // Hourly resolution
    const readings = db.prepare(`
      SELECT hourly_id, hour_at,
             temp_f_avg, temp_f_min, temp_f_max,
             humidity_rh_avg, humidity_rh_min, humidity_rh_max,
             dew_point_f_avg, vpd_kpa_avg, vpd_kpa_min, vpd_kpa_max,
             sample_count
      FROM cv_sensor_readings_hourly
      WHERE sensor_id = ? AND hour_at >= ? AND hour_at <= ?
      ORDER BY hour_at ASC
    `).all(sensorId, start, endTime);
    return reply.send(readings);
  });

  // POST /poll — manually trigger a poll cycle
  app.post('/poll', { preHandler: requireRole('admin') }, async (_req, reply) => {
    if (!process.env.SENSORPUSH_EMAIL) {
      return reply.code(400).send({ error: 'SENSORPUSH_EMAIL not configured' });
    }
    const result = await pollSensors();
    return reply.send(result);
  });
};

export default sensorsRoutes;
