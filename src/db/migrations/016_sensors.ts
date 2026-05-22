import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── cv_sensors ────────────────────────────────────────────────────────────
  // Master record per physical SensorPush device.
  // sensor_id is the SensorPush device ID (string, not auto-increment).
  await knex.schema.createTableIfNotExists('cv_sensors', (table) => {
    table.text('sensor_id').primary();
    table.text('device_name').notNullable();
    table.text('label').nullable();
    table.text('model').nullable();
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
    // sub_zone_id: for field sensors; null for pre-field locations
    table.text('sub_zone_id').nullable().references('sub_zone_id').inTable('cv_sub_zones');
    table.text('assigned_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('assigned_by').nullable().references('id').inTable('cv_users');
    table.text('unassigned_at').nullable();
    table.integer('unassigned_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Index for current-assignment lookups (location_id + unassigned_at IS NULL)
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_sensor_assignments_location_unassigned
     ON cv_sensor_location_assignments (location_id, unassigned_at)`
  );

  // ── cv_sensor_readings ───────────────────────────────────────────────────
  // Time-series environmental readings. Immutable append-only log.
  // location_id and sub_zone_id are denormalized from the active assignment
  // at ingest time for fast historical queries without joining assignment history.
  await knex.schema.createTableIfNotExists('cv_sensor_readings', (table) => {
    table.increments('reading_id');
    table.text('sensor_id').notNullable().references('sensor_id').inTable('cv_sensors');
    table.integer('location_id').notNullable().references('location_id').inTable('cv_locations');
    table.text('sub_zone_id').nullable();
    table.text('observed_at').notNullable();
    table.float('temp_f').notNullable();
    table.float('humidity_rh').notNullable();
    table.float('dew_point_f').notNullable();
    table.float('vpd_kpa').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Unique constraint so INSERT OR IGNORE handles duplicate readings gracefully
  await knex.schema.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time_unique
     ON cv_sensor_readings (sensor_id, observed_at)`
  );

  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time
     ON cv_sensor_readings (sensor_id, observed_at DESC)`
  );

  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_sensor_readings_location_time
     ON cv_sensor_readings (location_id, observed_at DESC)`
  );

  // ── cv_sensor_readings_hourly ────────────────────────────────────────────
  // Materialized hourly summary for Phase 3 trend charts.
  // Populated by the poller's downsampling step.
  // Full-resolution rows older than 90 days are deleted by the poller after
  // this table is populated; these summaries are the permanent record.
  await knex.schema.createTableIfNotExists('cv_sensor_readings_hourly', (table) => {
    table.increments('hourly_id');
    table.text('sensor_id').notNullable().references('sensor_id').inTable('cv_sensors');
    table.integer('location_id').notNullable().references('location_id').inTable('cv_locations');
    table.text('sub_zone_id').nullable();
    table.text('hour_at').notNullable();
    table.float('temp_f_avg').notNullable();
    table.float('temp_f_min').notNullable();
    table.float('temp_f_max').notNullable();
    table.float('humidity_rh_avg').notNullable();
    table.float('humidity_rh_min').notNullable();
    table.float('humidity_rh_max').notNullable();
    table.float('dew_point_f_avg').notNullable();
    table.float('vpd_kpa_avg').nullable();
    table.float('vpd_kpa_min').nullable();
    table.float('vpd_kpa_max').nullable();
    table.integer('sample_count').notNullable();
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
