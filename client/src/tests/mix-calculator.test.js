import { describe, it, expect } from 'vitest';
import {
  CONVERSIONS,
  SUB_ZONE_CONFIG,
  rateToMlPerMl,
  isWeightBased,
  formatIngredientQty,
  formatVolume,
  calcMix,
  calcTargetVolumeMl,
} from '../lib/mix-calculator.js';

// ─── rateToMlPerMl ────────────────────────────────────────────────────────────

describe('rateToMlPerMl', () => {
  it('tsp_per_gal: 1 tsp/gal → 4.92892/3785.41', () => {
    const expected = 4.92892 / 3785.41;
    expect(rateToMlPerMl(1, 'tsp_per_gal')).toBeCloseTo(expected, 8);
  });

  it('tsp/gal alias works', () => {
    expect(rateToMlPerMl(1, 'tsp/gal')).toBeCloseTo(rateToMlPerMl(1, 'tsp_per_gal'), 10);
  });

  it('tbsp_per_gal: 1 tbsp/gal → 14.7868/3785.41', () => {
    expect(rateToMlPerMl(1, 'tbsp_per_gal')).toBeCloseTo(14.7868 / 3785.41, 8);
  });

  it('ml_per_gal: 1 ml/gal → 1/3785.41', () => {
    expect(rateToMlPerMl(1, 'ml_per_gal')).toBeCloseTo(1 / 3785.41, 8);
  });

  it('ml/gal alias works', () => {
    expect(rateToMlPerMl(1, 'ml/gal')).toBeCloseTo(rateToMlPerMl(1, 'ml_per_gal'), 10);
  });

  it('oz_per_gal: 1 oz/gal → 29.5735/3785.41', () => {
    expect(rateToMlPerMl(1, 'oz_per_gal')).toBeCloseTo(29.5735 / 3785.41, 8);
  });

  it('fl oz/gal alias works', () => {
    expect(rateToMlPerMl(1, 'fl oz/gal')).toBeCloseTo(rateToMlPerMl(1, 'oz_per_gal'), 10);
  });

  it('fl_oz/gal alias works', () => {
    expect(rateToMlPerMl(1, 'fl_oz/gal')).toBeCloseTo(rateToMlPerMl(1, 'oz_per_gal'), 10);
  });

  it('drops_per_gal: 1 drop/gal → 0.05/3785.41', () => {
    expect(rateToMlPerMl(1, 'drops_per_gal')).toBeCloseTo(0.05 / 3785.41, 10);
  });

  it('drops/gal alias works', () => {
    expect(rateToMlPerMl(1, 'drops/gal')).toBeCloseTo(rateToMlPerMl(1, 'drops_per_gal'), 10);
  });

  it('ml_per_L: 1 ml/L → 0.001', () => {
    expect(rateToMlPerMl(1, 'ml_per_L')).toBeCloseTo(0.001, 8);
  });

  it('ml/L alias works', () => {
    expect(rateToMlPerMl(1, 'ml/L')).toBeCloseTo(0.001, 8);
  });

  it('g_per_L: treats 1g/L as 1mL/L', () => {
    expect(rateToMlPerMl(1, 'g_per_L')).toBeCloseTo(0.001, 8);
  });

  it('g/L alias works', () => {
    expect(rateToMlPerMl(1, 'g/L')).toBeCloseTo(0.001, 8);
  });

  it('g_per_gal: treats 1g/gal as 1mL/gal', () => {
    expect(rateToMlPerMl(1, 'g_per_gal')).toBeCloseTo(1 / 3785.41, 8);
  });

  it('unknown unit returns null', () => {
    expect(rateToMlPerMl(1, 'unknown_unit')).toBeNull();
  });

  it('scales linearly with rate value', () => {
    const base = rateToMlPerMl(1, 'ml_per_gal');
    expect(rateToMlPerMl(2.5, 'ml_per_gal')).toBeCloseTo(base * 2.5, 8);
  });
});

// ─── isWeightBased ────────────────────────────────────────────────────────────

describe('isWeightBased', () => {
  it('g_per_gal is weight-based', () => expect(isWeightBased('g_per_gal')).toBe(true));
  it('g/gal is weight-based', () => expect(isWeightBased('g/gal')).toBe(true));
  it('g_per_L is weight-based', () => expect(isWeightBased('g_per_L')).toBe(true));
  it('g/L is weight-based', () => expect(isWeightBased('g/L')).toBe(true));
  it('ml_per_gal is not weight-based', () => expect(isWeightBased('ml_per_gal')).toBe(false));
  it('tsp_per_gal is not weight-based', () => expect(isWeightBased('tsp_per_gal')).toBe(false));
});

// ─── formatIngredientQty — imperial auto-unit selection ──────────────────────

describe('formatIngredientQty — imperial', () => {
  it('< 1 mL → drops', () => {
    const r = formatIngredientQty(0.5, 'imperial');
    expect(r.unit).toBe('drops');
    expect(r.value).toBeCloseTo(0.5 / 0.05, 1);
  });

  it('1 mL → tsp', () => {
    const r = formatIngredientQty(1.0, 'imperial');
    expect(r.unit).toBe('tsp');
    expect(r.value).toBeCloseTo(1.0 / CONVERSIONS.mL_per_tsp, 2);
  });

  it('exactly at 14.79 mL (1 tbsp boundary) → tbsp', () => {
    const r = formatIngredientQty(14.79, 'imperial');
    expect(r.unit).toBe('tbsp');
  });

  it('just below 14.79 → tsp', () => {
    const r = formatIngredientQty(14.78, 'imperial');
    expect(r.unit).toBe('tsp');
  });

  it('at 44.36 mL → fl oz', () => {
    const r = formatIngredientQty(44.36, 'imperial');
    expect(r.unit).toBe('fl oz');
  });

  it('just below 44.36 → tbsp', () => {
    const r = formatIngredientQty(44.35, 'imperial');
    expect(r.unit).toBe('tbsp');
  });

  it('at 236.6 mL → cups', () => {
    const r = formatIngredientQty(236.6, 'imperial');
    expect(r.unit).toBe('cups');
  });

  it('just below 236.6 → fl oz', () => {
    const r = formatIngredientQty(236.5, 'imperial');
    expect(r.unit).toBe('fl oz');
  });

  it('at 946.4 mL → qt', () => {
    const r = formatIngredientQty(946.4, 'imperial');
    expect(r.unit).toBe('qt');
  });

  it('at 3785.4 mL → gal', () => {
    const r = formatIngredientQty(3785.4, 'imperial');
    expect(r.unit).toBe('gal');
  });

  it('just below 3785.4 → qt', () => {
    const r = formatIngredientQty(3785.0, 'imperial');
    expect(r.unit).toBe('qt');
  });

  it('returns display string with value and unit', () => {
    const r = formatIngredientQty(75.0, 'imperial');
    expect(r.display).toContain('fl oz');
    expect(r.display).toContain((75.0 / CONVERSIONS.mL_per_floz).toFixed(2));
  });
});

// ─── formatIngredientQty — metric auto-unit selection ────────────────────────

describe('formatIngredientQty — metric', () => {
  it('< 1 mL → drops', () => {
    const r = formatIngredientQty(0.5, 'metric');
    expect(r.unit).toBe('drops');
  });

  it('1 mL → mL', () => {
    const r = formatIngredientQty(1.0, 'metric');
    expect(r.unit).toBe('mL');
    expect(r.value).toBeCloseTo(1.0, 2);
  });

  it('500 mL → mL', () => {
    const r = formatIngredientQty(500, 'metric');
    expect(r.unit).toBe('mL');
  });

  it('1000 mL → L', () => {
    const r = formatIngredientQty(1000, 'metric');
    expect(r.unit).toBe('L');
    expect(r.value).toBeCloseTo(1.0, 2);
  });

  it('2500 mL → 2.50 L', () => {
    const r = formatIngredientQty(2500, 'metric');
    expect(r.unit).toBe('L');
    expect(r.value).toBeCloseTo(2.5, 2);
  });
});

// ─── formatIngredientQty — weight-based ──────────────────────────────────────

describe('formatIngredientQty — weight', () => {
  it('500 mL weight → 500.00 g', () => {
    const r = formatIngredientQty(500, 'imperial', true);
    expect(r.unit).toBe('g');
    expect(r.value).toBeCloseTo(500, 2);
  });

  it('1000 mL weight → 1.00 kg', () => {
    const r = formatIngredientQty(1000, 'imperial', true);
    expect(r.unit).toBe('kg');
    expect(r.value).toBeCloseTo(1.0, 2);
  });

  it('weight display is unaffected by output system', () => {
    const imp = formatIngredientQty(500, 'imperial', true);
    const met = formatIngredientQty(500, 'metric', true);
    expect(imp.unit).toBe('g');
    expect(met.unit).toBe('g');
  });
});

// ─── formatVolume ─────────────────────────────────────────────────────────────

describe('formatVolume', () => {
  it('150 gal → "150.0 gal" imperial', () => {
    const r = formatVolume(150 * CONVERSIONS.mL_per_gal, 'imperial');
    expect(r.unit).toBe('gal');
    expect(r.display).toBe('150.0 gal');
  });

  it('1.5 gal → qt when < 1 gal threshold shows qt', () => {
    const mL = 1.5 * CONVERSIONS.mL_per_qt;
    const r = formatVolume(mL, 'imperial');
    expect(r.unit).toBe('qt');
  });

  it('94.6 L metric', () => {
    const mL = 94.635 * CONVERSIONS.mL_per_L;
    const r = formatVolume(mL, 'metric');
    expect(r.unit).toBe('L');
    expect(r.value).toBeCloseTo(94.63, 1);
  });
});

// ─── calcTargetVolumeMl ───────────────────────────────────────────────────────

describe('calcTargetVolumeMl', () => {
  it('subzone Z1A, 2 plants/container, 0.5 gal/plant → 150 gal = 567811.5 mL', () => {
    const mL = calcTargetVolumeMl({ type: 'subzone', subZone: 'Z1A', plantsPerContainer: 2, rateGalPerPlant: 0.5 });
    expect(mL).toBeCloseTo(150 * CONVERSIONS.mL_per_gal, 0);
  });

  it('subzone Z1B, 1 plant/container, 0.3 gal/plant → 43.5 gal', () => {
    const mL = calcTargetVolumeMl({ type: 'subzone', subZone: 'Z1B', plantsPerContainer: 1, rateGalPerPlant: 0.3 });
    expect(mL).toBeCloseTo(43.5 * CONVERSIONS.mL_per_gal, 0);
  });

  it('rows mode: 60 containers, 1 plant, 0.5 gal → 30 gal', () => {
    const mL = calcTargetVolumeMl({ type: 'rows', containers: 60, plantsPerContainer: 1, rateGalPerPlant: 0.5 });
    expect(mL).toBeCloseTo(30 * CONVERSIONS.mL_per_gal, 0);
  });

  it('plantcount: 300 plants, 0.5 gal/plant → 150 gal', () => {
    const mL = calcTargetVolumeMl({ type: 'plantcount', containers: 300, rateGalPerPlant: 0.5 });
    expect(mL).toBeCloseTo(150 * CONVERSIONS.mL_per_gal, 0);
  });

  it('manual gallons', () => {
    const mL = calcTargetVolumeMl({ type: 'manual', manualGallons: 25 });
    expect(mL).toBeCloseTo(25 * CONVERSIONS.mL_per_gal, 0);
  });

  it('manual liters', () => {
    const mL = calcTargetVolumeMl({ type: 'manual', manualLiters: 100 });
    expect(mL).toBeCloseTo(100 * CONVERSIONS.mL_per_L, 0);
  });

  it('unknown subzone returns null', () => {
    expect(calcTargetVolumeMl({ type: 'subzone', subZone: 'Z9X' })).toBeNull();
  });

  it('empty manual returns null', () => {
    expect(calcTargetVolumeMl({ type: 'manual' })).toBeNull();
  });
});

// ─── calcMix — Example 1 from design doc spec §8 ────────────────────────────

describe('calcMix — Example 1: Z1A auto, 150 gal, imperial', () => {
  const recipe = {
    name: 'AUTO-FLOWER',
    version: '1.2',
    ec_target_low: 1.8,
    ec_target_high: 2.2,
    ph_target_low: 6.0,
    ph_target_high: 6.2,
  };
  const totalGal = 150.0;
  const targetMl = totalGal * CONVERSIONS.mL_per_gal;
  const ingredients = [
    { order_index: 1, input_name: 'Armor Si',          rate_value: 0.5,  rate_unit: 'ml_per_gal',    notes: null },
    { order_index: 2, input_name: 'Fish Hydrolysate',  rate_value: 0.25, rate_unit: 'tsp_per_gal',   notes: null },
    { order_index: 3, input_name: 'Cal-Mag',           rate_value: 2,    rate_unit: 'ml_per_gal',    notes: null },
    { order_index: 4, input_name: 'Superthrive',       rate_value: 1,    rate_unit: 'drops_per_gal', notes: null },
  ];

  it('totalVolume is 150.0 gal', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    expect(r.totalVolume.display).toBe('150.0 gal');
  });

  it('ecTarget formatted correctly', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    expect(r.ecTarget).toBe('1.8–2.2 mS/cm');
  });

  it('phTarget formatted correctly', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    expect(r.phTarget).toBe('6–6.2');
  });

  it('Armor Si: 0.5 ml/gal × 150 gal → ~2.54 fl oz', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    const ing = r.ingredients.find(i => i.input_name === 'Armor Si');
    expect(ing.quantity.unit).toBe('fl oz');
    expect(ing.quantity.value).toBeCloseTo(2.54, 1);
  });

  it('Fish Hydrolysate: 0.25 tsp/gal × 150 gal → ~6.25 fl oz', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    const ing = r.ingredients.find(i => i.input_name === 'Fish Hydrolysate');
    expect(ing.quantity.unit).toBe('fl oz');
    expect(ing.quantity.value).toBeCloseTo(6.25, 1);
  });

  it('Cal-Mag: 2 ml/gal × 150 gal → ~1.27 cups', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    const ing = r.ingredients.find(i => i.input_name === 'Cal-Mag');
    expect(ing.quantity.unit).toBe('cups');
    expect(ing.quantity.value).toBeCloseTo(1.27, 1);
  });

  it('Superthrive: 1 drop/gal × 150 gal → ~1.52 tsp', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    const ing = r.ingredients.find(i => i.input_name === 'Superthrive');
    expect(ing.quantity.unit).toBe('tsp');
    expect(ing.quantity.value).toBeCloseTo(1.52, 1);
  });

  it('ingredients sorted by order_index', () => {
    const r = calcMix(recipe, [...ingredients].reverse(), targetMl, 'imperial');
    expect(r.ingredients[0].input_name).toBe('Armor Si');
    expect(r.ingredients[3].input_name).toBe('Superthrive');
  });
});

// ─── calcMix — Example 3 from design doc spec §8: 25 gal foliar, metric ─────

describe('calcMix — Example 3: 25 gal foliar, metric', () => {
  const recipe = { name: 'Weekly Preventive Foliar', version: '1.0', ec_target_low: null, ec_target_high: null, ph_target_low: null, ph_target_high: null };
  const targetMl = 25 * CONVERSIONS.mL_per_gal; // 94,635 mL
  const ingredients = [
    { order_index: 1, input_name: 'Foliar Cal-Mag',  rate_value: 2, rate_unit: 'ml_per_L', notes: null },
    { order_index: 2, input_name: 'Kelp Extract',    rate_value: 1, rate_unit: 'ml_per_L', notes: null },
    { order_index: 3, input_name: 'Foliar Si',       rate_value: 0.5, rate_unit: 'ml_per_L', notes: null },
  ];

  it('totalVolume in L for metric', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'metric');
    expect(r.totalVolume.unit).toBe('L');
    expect(r.totalVolume.value).toBeCloseTo(94.64, 1);
  });

  it('Foliar Cal-Mag: 2 ml/L × 94.6L → ~189 mL', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'metric');
    const ing = r.ingredients.find(i => i.input_name === 'Foliar Cal-Mag');
    expect(ing.quantity.unit).toBe('mL');
    expect(ing.quantity.value).toBeCloseTo(189.27, 0);
  });

  it('ecTarget null when no targets set', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'metric');
    expect(r.ecTarget).toBeNull();
  });
});

// ─── calcMix — weight-based ingredient ───────────────────────────────────────

describe('calcMix — weight-based ingredient', () => {
  const recipe = { name: 'TEST', version: '1', ec_target_low: null, ec_target_high: null, ph_target_low: null, ph_target_high: null };
  const targetMl = 10 * CONVERSIONS.mL_per_gal;
  const ingredients = [{ order_index: 1, input_name: 'Dry Powder', rate_value: 10, rate_unit: 'g_per_gal', notes: null }];

  it('weight-based ingredient outputs in grams', () => {
    const r = calcMix(recipe, ingredients, targetMl, 'imperial');
    const ing = r.ingredients[0];
    expect(ing.quantity.unit).toBe('g');
    expect(ing.quantity.value).toBeCloseTo(100, 1);
  });
});
