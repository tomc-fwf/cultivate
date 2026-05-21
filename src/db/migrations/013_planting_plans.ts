import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── cv_planting_plans ────────────────────────────────────────────────────
  // A versioned draft layout for placing a plant batch into field containers.
  // Created by admin; committed in full or partially; superseded (not deleted)
  // when the layout needs to change.
  //
  // Lifecycle:
  //   draft      — being built; no containers locked yet
  //   active     — at least one item committed; locked containers cannot be
  //                changed even in a new version of this plan
  //   superseded — a newer version of the plan has been created; this version's
  //                uncommitted items are cancelled, committed items remain
  //   cancelled  — abandoned before any items were committed
  //
  // Versioning: when a plan needs to change after partial commit, create a new
  // cv_planting_plans row with version+1 and supersedes_plan_id pointing here.
  // The new plan is pre-populated with the uncommitted items from this plan.
  // Committed items from this plan stay committed and are not carried forward —
  // they are locked (active plant_assignment exists for those containers).
  await knex.schema.createTableIfNotExists('cv_planting_plans', (table) => {
    table.increments('plan_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('sub_zone_id').notNullable().references('sub_zone_id').inTable('cv_sub_zones');
    table.integer('version').notNullable().defaultTo(1);
    // status: "draft" | "active" | "superseded" | "cancelled"
    table.text('status').notNullable().defaultTo('draft');
    // Points to the plan this version supersedes (null for version 1)
    table.integer('supersedes_plan_id').nullable().references('plan_id').inTable('cv_planting_plans');
    // Total number of plants this plan intends to place (informational)
    table.integer('plants_to_place').notNullable();
    table.text('notes').nullable();
    // Admin only — enforced at the API layer
    table.integer('created_by').nullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    // Set when the first plan item is committed
    table.text('activated_at').nullable();
    table.text('superseded_at').nullable();
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // ── cv_planting_plan_items ────────────────────────────────────────────────
  // Individual container assignments within a planting plan.
  // Each item represents one container receiving plants_count plants from the batch.
  //
  // Item lifecycle:
  //   draft     — planned but not yet physically placed
  //   committed — plant physically placed; cv_plant_assignment record created;
  //               container state → active; this item is now LOCKED
  //   cancelled — removed from the plan before commit (superseded plan flow)
  //
  // Locking rule: any container with an active cv_plant_assignment cannot be
  // included in a new plan version. The API enforces this at plan creation time
  // by checking cv_plant_assignments for active (unassigned_at IS NULL) records
  // against any container in the target sub-zone.
  await knex.schema.createTableIfNotExists('cv_planting_plan_items', (table) => {
    table.increments('item_id');
    table.integer('plan_id').notNullable().references('plan_id').inTable('cv_planting_plans');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    // Number of plants placed in this container (1 default; 2 for autoflower density)
    table.integer('plants_count').notNullable().defaultTo(1);
    // status: "draft" | "committed" | "cancelled"
    table.text('status').notNullable().defaultTo('draft');
    table.text('committed_at').nullable();
    table.integer('committed_by').nullable().references('id').inTable('cv_users');
    // Set when commit creates the plant_assignment — links plan item to the live record
    table.integer('plant_assignment_id').nullable().references('assignment_id').inTable('cv_plant_assignments');
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // ── FK: cv_batch_location_history.planting_plan_id ───────────────────────
  // Add the deferred FK from 012 now that cv_planting_plans exists.
  // SQLite doesn't enforce FK constraints added via ALTER TABLE (the column
  // was already created in 012 without the references clause), so we add a
  // comment-only note here. The application layer ensures referential integrity
  // for this column via the commit workflow.
  // (No schema change needed — the column exists; this comment documents intent.)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_planting_plan_items');
  await knex.schema.dropTableIfExists('cv_planting_plans');
}
