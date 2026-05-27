import type { Knex } from 'knex';

// Adds product-catalog fields to cv_metrc_additive_templates so it can serve
// as the authoritative product master for application forms in Phase 2,
// replacing farmstock as the data source.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_metrc_additive_templates', (table) => {
    // Granular cultivation category for form filtering
    table.text('category').nullable();              // Fertilizer | Pesticide | Fungicide | Biocontrol | Amendment | FoliarNutrient | Other

    // Unit of measure for stock display
    table.text('unit').nullable();                  // e.g. 'gal', 'lb', 'oz', 'ml'

    // Consumer-facing manufacturer name (product_supplier is the METRC CSV name)
    table.text('manufacturer').nullable();

    // PHI / REI (numeric, for form-level calculations)
    table.float('phi_days').nullable();             // Label PHI (days)
    table.float('phi_days_operational').nullable(); // Operational PHI — always >= phi_days
    table.text('phi_notes').nullable();
    table.float('rei_hours').nullable();            // Numeric REI hours (rei_quantity/rei_time_unit stay for METRC CSV)

    // OMRI
    table.integer('omri_listed').notNullable().defaultTo(0);

    // Regulatory flags
    table.integer('restricted_use').notNullable().defaultTo(0);
    table.text('signal_word').nullable();           // DANGER | WARNING | CAUTION

    // Target organisms (pesticides)
    table.text('target_organisms').nullable();

    // Safety Data Sheet
    table.text('sds_url').nullable();
  });

  // Backfill manufacturer from product_supplier for existing rows
  await knex.raw(`
    UPDATE cv_metrc_additive_templates
    SET manufacturer = product_supplier
    WHERE product_supplier IS NOT NULL AND manufacturer IS NULL
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN natively.
  // To roll back, recreate cv_metrc_additive_templates without these columns.
}
