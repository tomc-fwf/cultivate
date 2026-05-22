import { getDB } from '../db/index.js';
import { sensorPushClient } from './sensorpush-client.js';
import { celsiusToFahrenheit, calcDewPoint, calcVPD } from './domain-utils.js';

interface SensorAssignment {
  sensor_id: string;
  location_id: number;
  sub_zone_id: string | null;
  last_seen_at: string | null;
}

interface SensorSample {
  observed: string;
  temperature: number; // Celsius from SensorPush
  humidity: number;    // RH %
}

function estimateBatteryPct(voltage: number): number {
  if (voltage >= 2.90) return 100;
  if (voltage >= 2.70) return Math.round(50 + ((voltage - 2.70) / 0.20) * 50);
  if (voltage >= 2.50) return Math.round(20 + ((voltage - 2.50) / 0.20) * 30);
  return 0;
}

export async function pollSensors(): Promise<{ updated: number; errors: string[] }> {
  const db = getDB();

  const assignments = db.prepare(`
    SELECT DISTINCT s.sensor_id, csa.location_id, csa.sub_zone_id, s.last_seen_at
    FROM cv_sensors s
    JOIN cv_sensor_location_assignments csa ON csa.sensor_id = s.sensor_id
    WHERE s.active = 1 AND csa.unassigned_at IS NULL
  `).all() as SensorAssignment[];

  if (assignments.length === 0) return { updated: 0, errors: [] };

  const sensorIds = [...new Set(assignments.map(a => a.sensor_id))];

  // Build a lookup: sensor_id → assignment info
  const assignmentMap = new Map<string, SensorAssignment>();
  for (const a of assignments) {
    assignmentMap.set(a.sensor_id, a);
  }

  const startTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  let samplesData: Record<string, unknown>;
  let sensorsData: Record<string, unknown>;

  try {
    [samplesData, sensorsData] = await Promise.all([
      sensorPushClient.getSamples(sensorIds, startTime, 50) as Promise<Record<string, unknown>>,
      sensorPushClient.getSensors() as Promise<Record<string, unknown>>,
    ]);
  } catch (err) {
    return { updated: 0, errors: [(err as Error).message] };
  }

  let updated = 0;
  const errors: string[] = [];

  const insertReading = db.prepare(`
    INSERT OR IGNORE INTO cv_sensor_readings
      (sensor_id, location_id, sub_zone_id, observed_at, temp_f, humidity_rh, dew_point_f, vpd_kpa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateSensor = db.prepare(`
    UPDATE cv_sensors
    SET last_seen_at = ?, battery_pct = ?, updated_at = datetime('now')
    WHERE sensor_id = ?
  `);

  db.transaction(() => {
    // Process sample readings
    const sensors = (samplesData as { sensors?: Record<string, { samples?: SensorSample[] }> }).sensors ?? {};
    for (const [sensorId, sensorData] of Object.entries(sensors)) {
      const assignment = assignmentMap.get(sensorId);
      if (!assignment) continue;

      const samples = sensorData.samples ?? [];
      for (const sample of samples) {
        const tempC = sample.temperature;
        const tempF = celsiusToFahrenheit(tempC);
        const dewF = calcDewPoint(tempC, sample.humidity);
        const vpd = calcVPD(tempC, sample.humidity);

        const info = insertReading.run(
          sensorId,
          assignment.location_id,
          assignment.sub_zone_id,
          sample.observed,
          tempF,
          sample.humidity,
          dewF,
          vpd
        );
        if (info.changes > 0) updated++;
      }
    }

    // Update sensor metadata
    const sensorList = (sensorsData as { sensors?: Record<string, { lastSeen?: string; battery?: { voltage?: number } }> }).sensors ?? {};
    for (const [sensorId, info] of Object.entries(sensorList)) {
      const batteryVoltage = info.battery?.voltage ?? 0;
      const batteryPct = estimateBatteryPct(batteryVoltage);
      updateSensor.run(info.lastSeen ?? null, batteryPct, sensorId);
    }
  })();

  // Hourly downsampling for completed hours
  try {
    downsampleToHourly(db);
  } catch (err) {
    errors.push(`Hourly downsampling failed: ${(err as Error).message}`);
  }

  return { updated, errors };
}

function downsampleToHourly(db: ReturnType<typeof getDB>): void {
  // Find hours with raw readings that don't yet have an hourly summary
  const pendingHours = db.prepare(`
    SELECT sensor_id,
           location_id,
           sub_zone_id,
           strftime('%Y-%m-%dT%H:00:00Z', observed_at) AS hour_at
    FROM cv_sensor_readings
    WHERE observed_at < strftime('%Y-%m-%dT%H:00:00Z', 'now')
      AND strftime('%Y-%m-%dT%H:00:00Z', observed_at) NOT IN (
        SELECT hour_at FROM cv_sensor_readings_hourly
        WHERE cv_sensor_readings_hourly.sensor_id = cv_sensor_readings.sensor_id
      )
    GROUP BY sensor_id, location_id, sub_zone_id, hour_at
    LIMIT 50
  `).all() as Array<{ sensor_id: string; location_id: number; sub_zone_id: string | null; hour_at: string }>;

  const insertHourly = db.prepare(`
    INSERT OR IGNORE INTO cv_sensor_readings_hourly
      (sensor_id, location_id, sub_zone_id, hour_at,
       temp_f_avg, temp_f_min, temp_f_max,
       humidity_rh_avg, humidity_rh_min, humidity_rh_max,
       dew_point_f_avg, vpd_kpa_avg, vpd_kpa_min, vpd_kpa_max, sample_count)
    SELECT sensor_id, location_id, sub_zone_id,
           strftime('%Y-%m-%dT%H:00:00Z', observed_at) AS hour_at,
           AVG(temp_f), MIN(temp_f), MAX(temp_f),
           AVG(humidity_rh), MIN(humidity_rh), MAX(humidity_rh),
           AVG(dew_point_f),
           AVG(vpd_kpa), MIN(vpd_kpa), MAX(vpd_kpa),
           COUNT(*)
    FROM cv_sensor_readings
    WHERE sensor_id = ? AND strftime('%Y-%m-%dT%H:00:00Z', observed_at) = ?
    GROUP BY sensor_id, location_id, sub_zone_id, strftime('%Y-%m-%dT%H:00:00Z', observed_at)
  `);

  for (const row of pendingHours) {
    insertHourly.run(row.sensor_id, row.hour_at);
  }
}
