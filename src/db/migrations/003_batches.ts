import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Strains
  await knex.schema.createTableIfNotExists('cv_strains', (table) => {
    table.increments('strain_id');
    table.text('name').notNullable();
    table.text('type').notNullable(); // "auto" | "photo"
    table.text('genetics').nullable();
    table.text('notes').nullable();
    table.integer('active').notNullable().defaultTo(1);
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Batches
  await knex.schema.createTableIfNotExists('cv_batches', (table) => {
    table.increments('batch_id');
    table.integer('strain_id').notNullable().references('strain_id').inTable('cv_strains');
    table.text('sub_zone_id').nullable().references('sub_zone_id').inTable('cv_sub_zones');
    table.text('metrc_plant_batch_uid').nullable();
    table.integer('plant_count_initial').notNullable();
    // plant_count_current is DERIVED — computed from active plant_assignments; do not edit directly
    table.text('status').notNullable().defaultTo('germ');
    // status: "germ" | "seedling" | "cult-hoop" | "field-veg" | "field-flower" | "flush" | "harvest" | "closed"
    table.text('sow_date').notNullable();
    table.text('transplant_date').nullable();
    table.text('field_move_date').nullable();
    table.text('harvest_date').nullable();
    table.text('closed_date').nullable();
    table.text('notes').nullable();
    table.integer('supervisor').nullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Batch stage recipes — records which recipe is active for a batch at a given time
  await knex.schema.createTableIfNotExists('cv_batch_stage_recipes', (table) => {
    table.increments('id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    // recipe_id will reference cv_fertigation_recipes once created in 006_recipes
    table.integer('recipe_id').notNullable();
    table.text('effective_from').notNullable();
    table.text('effective_to').nullable(); // null = currently active
    table.integer('authorized_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Plant assignments — the live registry of METRC plant tags to containers
  await knex.schema.createTableIfNotExists('cv_plant_assignments', (table) => {
    table.increments('assignment_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    table.text('metrc_plant_tag').notNullable(); // 24-char METRC UID
    table.text('assigned_at').notNullable();
    table.integer('assigned_by').nullable().references('id').inTable('cv_users');
    table.text('unassigned_at').nullable();
    // unassign_reason: "harvested" | "destroyed" | "died" | "moved" | "replaced" | "other"
    table.text('unassign_reason').nullable();
    table.text('unassign_notes').nullable();
    table.integer('unassigned_by').nullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Plant loss events — first-class records of mid-batch plant loss
  await knex.schema.createTableIfNotExists('cv_plant_loss_events', (table) => {
    table.increments('loss_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    table.integer('plant_assignment_id').notNullable().references('assignment_id').inTable('cv_plant_assignments');
    table.text('metrc_plant_tag').notNullable(); // denormalized at time of loss
    table.text('occurred_at').notNullable();
    table.text('discovered_at').notNullable();
    // loss_type: "death_natural" | "death_disease" | "death_pest" | "physical_damage" |
    //            "removal_culled" | "removal_quality" | "accidental" | "other"
    table.text('loss_type').notNullable();
    table.text('loss_cause').nullable();
    // plant_disposition: "disposed_compost" | "disposed_waste" | "quarantined" | "tested" | "other"
    table.text('plant_disposition').notNullable();
    table.integer('plant_count').notNullable().defaultTo(1);
    table.integer('reported_by').nullable().references('id').inTable('cv_users');
    // metrc_sync_status: "pending" | "synced" | "failed" | "not_required"
    table.text('metrc_sync_status').notNullable().defaultTo('pending');
    table.text('metrc_synced_at').nullable();
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_plant_loss_events');
  await knex.schema.dropTableIfExists('cv_plant_assignments');
  await knex.schema.dropTableIfExists('cv_batch_stage_recipes');
  await knex.schema.dropTableIfExists('cv_batches');
  await knex.schema.dropTableIfExists('cv_strains');
}
