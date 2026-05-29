import type { Knex } from 'knex';

const TEMPLATES = [
  {
    name: 'Athena Cuts',
    additive_type: 'Other',
    product_trade_name: 'Athena Cuts Rooting Compound',
    epa_registration_number: '82752-1-93752',
    note: 'Only use for rooting clones',
    product_supplier: 'Athena Ag, Inc',
    application_device: 'Hand Application',
    active_ingredients: JSON.stringify([{ name: 'Indole-3-Butyric Acid (IBA)', percentage: 0.3 }]),
  },
  {
    name: 'Pro-Mix HP B + M',
    additive_type: 'Pesticide',
    product_trade_name: 'PRO-MIX BIOFUNGICIDE + MYCORRHIZAE HP GENERAL PURPOSE GROWING MEDIUM',
    epa_registration_number: '74267-4',
    note: 'Seed starting mix / growing medium',
    product_supplier: 'Amazon',
    application_device: 'Hand Application',
    active_ingredients: JSON.stringify([{ name: 'Bacillus pumilus strain GHA 180', percentage: 0 }]),
  },
  {
    name: 'DYNOMYCO Granular',
    additive_type: 'Other',
    product_trade_name: 'DYNOMYCO Granular Mycorrhizal Inoculant',
    epa_registration_number: null,
    note: 'Mycorrhizal inoculant (beneficial root fungi)',
    product_supplier: 'DYNOMYCO',
    application_device: 'Soil Amendment',
    active_ingredients: JSON.stringify([{ name: 'Rhizophagus irregularis', percentage: 0 }]),
  },
  {
    name: 'Athena IPM - Foliar Spray',
    additive_type: 'Pesticide',
    product_trade_name: 'Athena IPM',
    epa_registration_number: null,
    note: 'Insecticide (FIFRA 25(b) exempt — no EPA registration required)',
    product_supplier: 'Amazon',
    application_device: 'Foliar Spray',
    active_ingredients: JSON.stringify([
      { name: 'Citric Acid', percentage: 10 },
      { name: 'Peppermint Oil', percentage: 1 },
      { name: 'Lemongrass Oil', percentage: 1 },
      { name: 'Geraniol', percentage: 0.5 },
    ]),
  },
  {
    name: 'ZeroTol 2.0 - Root Drench',
    additive_type: 'Pesticide',
    product_trade_name: 'ZeroTol 2.0',
    epa_registration_number: '70299-12',
    note: 'Fungicide / bactericide / algicide',
    product_supplier: 'Arbico Organics',
    application_device: 'Root Drench',
    active_ingredients: JSON.stringify([
      { name: 'Hydrogen Dioxide', percentage: 27.1 },
      { name: 'Peroxyacetic Acid', percentage: 2.0 },
    ]),
  },
  {
    name: 'ZeroTol 2.0 - Foliar Spray',
    additive_type: 'Pesticide',
    product_trade_name: 'ZeroTol 2.0',
    epa_registration_number: '70299-12',
    note: 'Fungicide / bactericide / algicide',
    product_supplier: 'Arbico Organics',
    application_device: 'Foliar Spray',
    active_ingredients: JSON.stringify([
      { name: 'Hydrogen Dioxide', percentage: 27.1 },
      { name: 'Peroxyacetic Acid', percentage: 2.0 },
    ]),
  },
  {
    name: 'BT Now - Foliar Spray',
    additive_type: 'Pesticide',
    product_trade_name: 'BT Now',
    epa_registration_number: '89046-12-70299',
    note: 'Insecticide — targets fungus gnats and larvae',
    product_supplier: 'Arbico Organics',
    application_device: 'Foliar Spray',
    active_ingredients: JSON.stringify([{ name: 'Bacillus thuringiensis subsp. israelensis', percentage: 0 }]),
  },
  {
    name: 'Craft Blend 3-5-2',
    additive_type: 'Fertilizer',
    product_trade_name: 'BuildASoil Craft Blend - Top Dress',
    epa_registration_number: null,
    note: '15-ingredient organic dry amendment. Derived from: kelp meal, alfalfa meal, fish meal, fish bone meal, crustacean meal, flax seed meal, camelina meal, soybean meal, malted barley, high-P bran, Sul-Po-Mag (langbeinite), volcanic tuff, micronized basalt, gypsum, oyster flour.',
    product_supplier: 'Build-A-Soil',
    application_device: 'Top Dress',
    active_ingredients: JSON.stringify([
      { name: 'Total Nitrogen (N)', percentage: 3 },
      { name: 'Available Phosphate (P2O5)', percentage: 5 },
      { name: 'Soluble Potash (K2O)', percentage: 2 },
    ]),
  },
  {
    name: 'PURE PROTEIN 15-1-1',
    additive_type: 'Fertilizer',
    product_trade_name: 'PURE PROTEIN DRY 15-1-1',
    epa_registration_number: null,
    note: 'Organic fish hydrolysate dry fertilizer',
    product_supplier: 'Build-A-Soil',
    application_device: 'Foliar Spray',
    active_ingredients: JSON.stringify([
      { name: 'Total Nitrogen (N)', percentage: 15 },
      { name: 'Available Phosphate (P2O5)', percentage: 1 },
      { name: 'Soluble Potash (K2O)', percentage: 1 },
    ]),
  },
  {
    name: 'FUL-HUMIX',
    additive_type: 'Other',
    product_trade_name: 'FUL-HUMIX Humic Acid Concentrate',
    epa_registration_number: null,
    note: null,
    product_supplier: 'GrowersHouse',
    application_device: 'Drip Irrigation',
    active_ingredients: JSON.stringify([
      { name: 'Humic Acid', percentage: 0 },
      { name: 'Fulvic Acid', percentage: 0 },
    ]),
  },
  {
    name: 'pH Down 75%',
    additive_type: 'Other',
    product_trade_name: 'Ventana pH Down + Line Cleaner 75%',
    epa_registration_number: null,
    note: 'Safety coverings REQUIRED. Do not use in concentrated form when plants are growing.',
    product_supplier: 'GrowersHouse',
    application_device: 'Tank Mix',
    active_ingredients: JSON.stringify([{ name: 'Phosphoric Acid', percentage: 75 }]),
  },
  {
    name: 'Pelletized Gypsum',
    additive_type: 'Fertilizer',
    product_trade_name: 'Kentucky Fertilizer Pelletized Gypsum',
    epa_registration_number: null,
    note: null,
    product_supplier: 'Menards',
    application_device: 'Hand Application',
    active_ingredients: JSON.stringify([{ name: 'Calcium Sulfate (Gypsum)', percentage: 0 }]),
  },
  {
    name: 'DYNOMYCO Spark',
    additive_type: 'Fertilizer',
    product_trade_name: 'DYNOMYCO Spark WP',
    epa_registration_number: null,
    note: 'Mycorrhizal inoculant + helper bacteria + biostimulants',
    product_supplier: 'DYNOMYCO',
    application_device: 'Root Drench',
    active_ingredients: JSON.stringify([{ name: 'Rhizophagus irregularis', percentage: 0 }]),
  },
  {
    name: 'ThermX-70',
    additive_type: 'Other',
    product_trade_name: 'ThermX-70',
    epa_registration_number: null,
    note: 'Wetting agent / adjuvant — yucca extract. Tank-mixed with spray applications to improve coverage.',
    product_supplier: 'Arbico Organics',
    application_device: 'Foliar Spray',
    active_ingredients: JSON.stringify([{ name: 'Yucca schidigera extract (saponins)', percentage: 70 }]),
  },
  {
    name: 'SUPERthrive',
    additive_type: 'Fertilizer',
    product_trade_name: 'SUPERthrive',
    epa_registration_number: null,
    note: 'Vitamin B1 and plant hormone supplement — root drench, soil drench, drip irrigation',
    product_supplier: 'Amazon',
    application_device: 'Root Drench',
    active_ingredients: JSON.stringify([
      { name: 'Thiamine (Vitamin B1)', percentage: 0.09 },
      { name: '1-Naphthyl Acetic Acid', percentage: 0.048 },
    ]),
  },
  {
    name: 'CEASE - Foliar Spray',
    additive_type: 'Pesticide',
    product_trade_name: 'CEASE Biological Fungicide',
    epa_registration_number: '264-1155-68539',
    note: 'Fungicide / bactericide',
    product_supplier: 'Arbico Organics',
    application_device: 'Foliar Spray',
    active_ingredients: JSON.stringify([{ name: 'Bacillus subtilis strain QST 713', percentage: 0 }]),
  },
] as const;

export async function up(knex: Knex): Promise<void> {
  const now = new Date().toISOString();

  for (const t of TEMPLATES) {
    await knex.raw(
      `INSERT OR IGNORE INTO cv_metrc_additive_templates
         (name, additive_type, product_trade_name, epa_registration_number, note,
          product_supplier, application_device, active_ingredients,
          omri_listed, restricted_use,
          created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`,
      [
        t.name,
        t.additive_type,
        t.product_trade_name ?? null,
        t.epa_registration_number ?? null,
        t.note ?? null,
        t.product_supplier,
        t.application_device,
        t.active_ingredients,
        now,
        now,
      ],
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const names = TEMPLATES.map((t) => t.name);
  const placeholders = names.map(() => '?').join(', ');
  await knex.raw(
    `DELETE FROM cv_metrc_additive_templates WHERE name IN (${placeholders})`,
    names,
  );
}
