export const CONVERSIONS = {
  mL_per_gal:  3785.41,
  mL_per_L:    1000,
  mL_per_tsp:  4.92892,
  mL_per_tbsp: 14.7868,
  mL_per_floz: 29.5735,
  mL_per_cup:  236.588,
  mL_per_qt:   946.353,
  mL_per_drop: 0.05,
};

export const SUB_ZONE_CONFIG = {
  Z1A: { potSize: 30, rows: 5, containersPerRow: 30, totalContainers: 150 },
  Z1B: { potSize: 10, rows: 5, containersPerRow: 29, totalContainers: 145 },
  Z2A: { potSize: 30, rows: 5, containersPerRow: 30, totalContainers: 150 },
  Z2B: { potSize: 10, rows: 5, containersPerRow: 29, totalContainers: 145 },
  Z3A: { potSize: 30, rows: 5, containersPerRow: 30, totalContainers: 150 },
  Z3B: { potSize: 10, rows: 5, containersPerRow: 29, totalContainers: 145 },
  Z4A: { potSize: 30, rows: 5, containersPerRow: 30, totalContainers: 150 },
  Z4B: { potSize: 10, rows: 5, containersPerRow: 29, totalContainers: 145 },
};

export function isWeightBased(rateUnit) {
  return ['g_per_gal', 'g/gal', 'g_per_L', 'g/L'].includes(rateUnit);
}

export function rateToMlPerMl(rateValue, rateUnit) {
  const v = Number(rateValue);
  const C = CONVERSIONS;
  const map = {
    'tsp_per_gal':   v * C.mL_per_tsp  / C.mL_per_gal,
    'tsp/gal':       v * C.mL_per_tsp  / C.mL_per_gal,
    'tbsp_per_gal':  v * C.mL_per_tbsp / C.mL_per_gal,
    'tbsp/gal':      v * C.mL_per_tbsp / C.mL_per_gal,
    'ml_per_gal':    v                  / C.mL_per_gal,
    'ml/gal':        v                  / C.mL_per_gal,
    'oz_per_gal':    v * C.mL_per_floz / C.mL_per_gal,
    'oz/gal':        v * C.mL_per_floz / C.mL_per_gal,
    'fl oz/gal':     v * C.mL_per_floz / C.mL_per_gal,
    'fl_oz/gal':     v * C.mL_per_floz / C.mL_per_gal,
    'drops_per_gal': v * C.mL_per_drop / C.mL_per_gal,
    'drops/gal':     v * C.mL_per_drop / C.mL_per_gal,
    'g_per_L':       v                  / C.mL_per_L,
    'g/L':           v                  / C.mL_per_L,
    'g_per_gal':     v                  / C.mL_per_gal,
    'g/gal':         v                  / C.mL_per_gal,
    'ml_per_L':      v                  / C.mL_per_L,
    'ml/L':          v                  / C.mL_per_L,
  };
  return Object.prototype.hasOwnProperty.call(map, rateUnit) ? map[rateUnit] : null;
}

// scenario: { type, subZone, containers, plantsPerContainer, rateGalPerPlant, rateLPerPlant, manualGallons, manualLiters }
export function calcTargetVolumeMl(scenario) {
  const { type, subZone, containers, plantsPerContainer, rateGalPerPlant, rateLPerPlant, manualGallons, manualLiters } = scenario;
  const ppc = Number(plantsPerContainer) || 1;
  const rateGal = Number(rateGalPerPlant) || (Number(rateLPerPlant) || 0) * (CONVERSIONS.mL_per_L / CONVERSIONS.mL_per_gal);

  switch (type) {
    case 'subzone': {
      const cfg = SUB_ZONE_CONFIG[subZone];
      if (!cfg) return null;
      return cfg.totalContainers * ppc * rateGal * CONVERSIONS.mL_per_gal;
    }
    case 'rows': {
      const c = Number(containers) || 0;
      return c * ppc * rateGal * CONVERSIONS.mL_per_gal;
    }
    case 'plantcount': {
      const plants = Number(containers) || 0;
      return plants * rateGal * CONVERSIONS.mL_per_gal;
    }
    case 'manual': {
      if (manualGallons != null && manualGallons !== '') return Number(manualGallons) * CONVERSIONS.mL_per_gal;
      if (manualLiters  != null && manualLiters  !== '') return Number(manualLiters)  * CONVERSIONS.mL_per_L;
      return null;
    }
    default:
      return null;
  }
}

export function formatVolume(mL, system = 'imperial') {
  const C = CONVERSIONS;
  if (system === 'metric') {
    if (mL < C.mL_per_L) {
      return { value: parseFloat(mL.toFixed(1)), unit: 'mL', display: `${mL.toFixed(1)} mL` };
    }
    const L = mL / C.mL_per_L;
    return { value: parseFloat(L.toFixed(2)), unit: 'L', display: `${L.toFixed(2)} L` };
  }
  if (mL >= C.mL_per_gal) {
    const gal = mL / C.mL_per_gal;
    return { value: parseFloat(gal.toFixed(1)), unit: 'gal', display: `${gal.toFixed(1)} gal` };
  }
  if (mL >= C.mL_per_qt) {
    const qt = mL / C.mL_per_qt;
    return { value: parseFloat(qt.toFixed(2)), unit: 'qt', display: `${qt.toFixed(2)} qt` };
  }
  const floz = mL / C.mL_per_floz;
  return { value: parseFloat(floz.toFixed(1)), unit: 'fl oz', display: `${floz.toFixed(1)} fl oz` };
}

export function formatIngredientQty(mL, system = 'imperial', weight = false) {
  if (weight) {
    const g = mL;
    if (g >= 1000) {
      const kg = g / 1000;
      return { value: parseFloat(kg.toFixed(2)), unit: 'kg', display: `${kg.toFixed(2)} kg` };
    }
    return { value: parseFloat(g.toFixed(2)), unit: 'g', display: `${g.toFixed(2)} g` };
  }

  if (mL <= 0) return { value: 0, unit: 'drops', display: '0.00 drops' };

  const C = CONVERSIONS;

  if (system === 'metric') {
    if (mL < 1) {
      const drops = mL / C.mL_per_drop;
      return { value: parseFloat(drops.toFixed(2)), unit: 'drops', display: `${drops.toFixed(2)} drops` };
    }
    if (mL < C.mL_per_L) {
      return { value: parseFloat(mL.toFixed(2)), unit: 'mL', display: `${mL.toFixed(2)} mL` };
    }
    const L = mL / C.mL_per_L;
    return { value: parseFloat(L.toFixed(2)), unit: 'L', display: `${L.toFixed(2)} L` };
  }

  if (mL < 1) {
    const drops = mL / C.mL_per_drop;
    return { value: parseFloat(drops.toFixed(2)), unit: 'drops', display: `${drops.toFixed(2)} drops` };
  }
  if (mL < 14.79) {
    const tsp = mL / C.mL_per_tsp;
    return { value: parseFloat(tsp.toFixed(2)), unit: 'tsp', display: `${tsp.toFixed(2)} tsp` };
  }
  if (mL < 44.36) {
    const tbsp = mL / C.mL_per_tbsp;
    return { value: parseFloat(tbsp.toFixed(2)), unit: 'tbsp', display: `${tbsp.toFixed(2)} tbsp` };
  }
  if (mL < 236.6) {
    const floz = mL / C.mL_per_floz;
    return { value: parseFloat(floz.toFixed(2)), unit: 'fl oz', display: `${floz.toFixed(2)} fl oz` };
  }
  if (mL < 946.4) {
    const cups = mL / C.mL_per_cup;
    return { value: parseFloat(cups.toFixed(2)), unit: 'cups', display: `${cups.toFixed(2)} cups` };
  }
  if (mL < 3785.4) {
    const qt = mL / C.mL_per_qt;
    return { value: parseFloat(qt.toFixed(2)), unit: 'qt', display: `${qt.toFixed(2)} qt` };
  }
  const gal = mL / C.mL_per_gal;
  return { value: parseFloat(gal.toFixed(2)), unit: 'gal', display: `${gal.toFixed(2)} gal` };
}

export function calcMix(recipe, ingredients, targetVolumeMl, outputSystem = 'imperial') {
  const totalVolume = formatVolume(targetVolumeMl, outputSystem);

  const fmtRange = (low, high, suffix) => {
    if (low != null && high != null) return `${low}–${high}${suffix}`;
    if (low != null) return `≥${low}${suffix}`;
    if (high != null) return `≤${high}${suffix}`;
    return null;
  };

  const ecTarget = fmtRange(recipe.ec_target_low, recipe.ec_target_high, ' mS/cm');
  const phTarget = fmtRange(recipe.ph_target_low, recipe.ph_target_high, '');

  const sorted = [...ingredients].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const calcedIngredients = sorted.map((ing, i) => {
    const ratio = rateToMlPerMl(ing.rate_value, ing.rate_unit);
    const totalMl = ratio != null ? ratio * targetVolumeMl : null;
    const weight = isWeightBased(ing.rate_unit);
    const quantity = totalMl != null
      ? formatIngredientQty(totalMl, outputSystem, weight)
      : { value: null, unit: '?', display: 'Unknown unit' };

    return {
      order_index: ing.order_index ?? i + 1,
      input_name: ing.input_name ?? `Product #${i + 1}`,
      quantity,
      notes: ing.notes ?? null,
    };
  });

  return { totalVolume, ecTarget, phTarget, ingredients: calcedIngredients };
}
