import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // cv_skill_instances — evidence trail that a skill (SOP-derived workflow) was executed.
  // Every time a skill is completed (e.g. pesticide application submitted), a record is
  // created here storing: which skill version was used, who ran it, what the precondition
  // checks showed, any overrides with documented reasons, and the output record produced.
  // This is the machine-readable link between an SOP and an application record.
  await knex.schema.createTableIfNotExists('cv_skill_instances', (table) => {
    table.increments('instance_id');

    // Skill identity
    table.text('skill_id').notNullable();           // e.g. "pesticide-application"
    table.text('skill_version').notNullable();       // e.g. "1.0"
    table.text('sop_id').nullable();                 // ff-dcs SOP reference (future)

    // Execution
    table.integer('completed_by').notNullable().references('id').inTable('cv_users');
    table.text('completed_at').notNullable();        // ISO-8601 UTC

    // Context snapshot — JSON of key inputs at execution time
    // e.g. {"batch_id": 5, "input_id": 12, "input_lot_id": 3, "sub_zone_id": "Z1A"}
    table.text('context').notNullable();

    // Full ValidationResult from skill-validator.ts as JSON
    // Preserves which checks passed/failed and at what severity
    table.text('validation_result').notNullable();

    // Override documentation — required when warn_override checks were accepted
    table.text('override_notes').nullable();

    // Output record linkage
    table.text('output_record_id').nullable();       // e.g. pesticide_app_id
    table.text('output_table').nullable();            // e.g. "cv_applications_pesticide"

    table.text('created_at').notNullable();
  });

  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_skill_instances_skill_id ON cv_skill_instances(skill_id)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_skill_instances_output ON cv_skill_instances(output_table, output_record_id)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_skill_instances_completed_by ON cv_skill_instances(completed_by)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_skill_instances');
}
