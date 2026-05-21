import type { Knex } from 'knex';

// SQLite does not support modifying column nullability or renaming columns
// via ALTER TABLE in a way that Knex can abstract. This migration recreates
// cv_plant_assignments with the correct schema using the SQLite table-swap pattern:
//
//   1. Disable FK enforcement (required to drop a table with FK references)
//   2. Create cv_plant_assignments_new with the correct schema
//   3. Copy existing data, mapping old columns to new ones
//   4. Drop the old table
//   5. Rename the new table
//   6. Re-enable FK enforcement
//
// Changes from original schema:
//   assigned_at  → placed_at   (when plant went into the container)
//   assigned_by  → placed_by   (who placed the plant)
//   [new] tagged_at             (when METRC tag was associated; null until tagged)
//   [new] tagged_by             (who assigned the METRC tag)
//   metrc_plant_tag             NOW NULLABLE — null means placed but not yet tagged
//
// For existing rows (if any): placed_at = assigned_at, tagged_at = assigned_at,
// placed_by = assigned_by, tagged_by = assigned_by (old model treated these as
// one simultaneous event).

export async function up(knex: Knex): Promise<void> {
  await knex.raw('PRAGMA foreign_keys = OFF');

  try {
    await knex.schema.createTable('cv_plant_assignments_new', (table) => {
      table.increments('assignment_id');
      table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
      table.text('container_id').notNullable().references('container_id').inTable('cv_containers');

      // METRC plant tag — nullable until the tag is physically applied and scanned.
      // null = plant is in the container (planting plan committed) but not yet tagged.
      // A unique constraint on (metrc_plant_tag) where not null is enforced at the
      // application layer (SQLite partial indexes require SQLite 3.8.9+).
      table.text('metrc_plant_tag').nullable();

      // placed_at: when the plant went into this container (planting plan commit).
      // Previously called assigned_at when placement and tagging were one event.
      table.text('placed_at').notNullable();
      table.integer('placed_by').nullable().references('id').inTable('cv_users');

      // tagged_at / tagged_by: when the METRC tag was associated with this placement.
      // null until the operator walks the sub-zone and assigns tags.
      table.text('tagged_at').nullable();
      table.integer('tagged_by').nullable().references('id').inTable('cv_users');

      // Unassignment fields — unchanged
      table.text('unassigned_at').nullable();
      // unassign_reason: "harvested" | "destroyed" | "died" | "moved" | "replaced" | "other"
      table.text('unassign_reason').nullable();
      table.text('unassign_notes').nullable();
      table.integer('unassigned_by').nullable().references('id').inTable('cv_users');

      table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    });

    // Copy existing data. For old rows, tagged_at = placed_at = assigned_at
    // since the old model had no separation between placement and tagging.
    await knex.raw(`
      INSERT INTO cv_plant_assignments_new (
        assignment_id,
        batch_id,
        container_id,
        metrc_plant_tag,
        placed_at,
        placed_by,
        tagged_at,
        tagged_by,
        unassigned_at,
        unassign_reason,
        unassign_notes,
        unassigned_by,
        created_at
      )
      SELECT
        assignment_id,
        batch_id,
        container_id,
        metrc_plant_tag,
        assigned_at,
        assigned_by,
        assigned_at,
        assigned_by,
        unassigned_at,
        unassign_reason,
        unassign_notes,
        unassigned_by,
        created_at
      FROM cv_plant_assignments
    `);

    await knex.schema.dropTable('cv_plant_assignments');
    await knex.schema.renameTable('cv_plant_assignments_new', 'cv_plant_assignments');
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('PRAGMA foreign_keys = OFF');

  try {
    await knex.schema.createTable('cv_plant_assignments_old', (table) => {
      table.increments('assignment_id');
      table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
      table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
      table.text('metrc_plant_tag').notNullable();
      table.text('assigned_at').notNullable();
      table.integer('assigned_by').nullable().references('id').inTable('cv_users');
      table.text('unassigned_at').nullable();
      table.text('unassign_reason').nullable();
      table.text('unassign_notes').nullable();
      table.integer('unassigned_by').nullable().references('id').inTable('cv_users');
      table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    });

    // Rows with null metrc_plant_tag cannot be restored to the NOT NULL schema.
    // Only rows that were fully tagged are carried back.
    await knex.raw(`
      INSERT INTO cv_plant_assignments_old (
        assignment_id, batch_id, container_id, metrc_plant_tag,
        assigned_at, assigned_by, unassigned_at, unassign_reason,
        unassign_notes, unassigned_by, created_at
      )
      SELECT
        assignment_id, batch_id, container_id, metrc_plant_tag,
        placed_at, placed_by, unassigned_at, unassign_reason,
        unassign_notes, unassigned_by, created_at
      FROM cv_plant_assignments
      WHERE metrc_plant_tag IS NOT NULL
    `);

    await knex.schema.dropTable('cv_plant_assignments');
    await knex.schema.renameTable('cv_plant_assignments_old', 'cv_plant_assignments');
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}
