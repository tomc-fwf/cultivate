import type { Knex } from 'knex';

// Seeds SOP text and checklist items into the stage protocols created by
// migration 036. Gives cultivators instructional content to read before
// starting each task and a pre-flight checklist to work through.

export async function up(knex: Knex): Promise<void> {
  const now = new Date().toISOString();

  // ── SOP text ────────────────────────────────────────────────────────────────

  // Fertigation — all stages share a common mixing SOP; stage-specific
  // EC/pH targets are noted in the protocol description.
  await knex('cv_stage_protocols')
    .where({ task_type: 'fertigation', stage: 'germ' })
    .update({
      sop_text: `BASE recipe — tray bottom-feed.

1. Prepare BASE solution to current recipe spec.
2. Target EC: 0.4–0.6 mS/cm. Target pH: 6.0–6.2.
3. Fill trays to 1" depth — do not submerge plugs.
4. Check germination rate: count emerged vs. total seeds.
5. Record EC and pH at mid-cycle, not at start.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'fertigation', stage: 'seedling' })
    .update({
      sop_text: `SEEDLING recipe — sub-location drip.

1. Verify all drip emitters are clear before starting.
2. Mix SEEDLING recipe per current version on the recipe card.
3. Target EC: 0.8–1.2 mS/cm. Target pH: 6.0–6.2.
4. Run drip for 10–15 minutes or until light runoff appears.
5. Record EC and pH at the feed line after 5 minutes of run time.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'fertigation', stage: 'cult-hoop' })
    .update({
      sop_text: `SEEDLING recipe — hardening phase.

1. Confirm containers are in the cult-hoop; do not apply field-rate EC.
2. Target EC: 0.8–1.2 mS/cm. Target pH: 6.0–6.2.
3. Mix and apply SEEDLING recipe per recipe card.
4. Run drip for 10–15 minutes.
5. Note any containers with poor drip coverage — flag for emitter check.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'fertigation', stage: 'field-veg' })
    .update({
      sop_text: `VEG recipe — sub-zone drip irrigation.

1. Confirm batch is in field-veg stage before applying.
2. Mix VEG recipe per current version — add nutrients in recipe mixing order.
3. Target EC: 1.2–1.8 mS/cm. Target pH: 6.0–6.4.
4. Run drip for 15–20 minutes or until 10–20% runoff observed.
5. Check runoff EC on 3 random containers — should be within 0.3 mS/cm of input.
6. Record measured EC and pH at the feed line, not in the tank.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'fertigation', stage: 'field-flower' })
    .update({
      sop_text: `FLOWER recipe — sub-zone drip irrigation.

1. Confirm batch is in field-flower before applying (higher P/K than VEG).
2. Mix FLOWER recipe per current version — follow mixing order on recipe card.
3. Target EC: 1.6–2.2 mS/cm. Target pH: 6.2–6.5.
4. Run drip for 15–20 minutes or until 10–20% runoff.
5. Inspect bud sites on 2–3 plants per row while irrigation runs.
6. Record EC and pH at the feed line.
7. Note any tip burn or lockout — reduce EC by 10% on next application if observed.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'fertigation', stage: 'flush' })
    .update({
      sop_text: `FLUSH recipe — reduced nutrients, clean water finish.

1. Mix FLUSH recipe — significantly lower nutrient load than FLOWER.
2. Target EC: 0.4–0.8 mS/cm. Target pH: 6.0–6.2.
3. Run drip for 20 minutes or until runoff EC approaches input EC.
4. Check trichome color on 5 containers after application — note % amber vs. cloudy.
5. Do not add any supplemental nutrients during flush stage.`,
    });

  // Observations
  await knex('cv_stage_protocols')
    .where({ task_type: 'observation', stage: 'seedling' })
    .update({
      sop_text: `Plant health check — seedling stage.

Walk all trays. For each tray:
• Germination rate: count and note % emerged
• Damping off: any collapsed or discolored stems at the soil line — indicate fungal issue
• Stretch: stems > 2" before first true leaf = insufficient light
• Vigor: consistent size across the tray, no obvious runts

Log any trays with > 10% issues. Photograph anything unusual.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'observation', stage: 'cult-hoop' })
    .update({
      sop_text: `Hardening check — cult-hoop stage.

Walk all rows. Check 3–5 containers per row.

What to look for:
• Stress response: leaf curl, tip burn, or wilting = heat/light stress
• Sun scald: bleached or brown patches on leaves facing direct sun
• Root development: gently tip 1–2 containers — roots should be white and visible
• Overall: plants should be stockier and shorter than in the seedling location

Flag any rows with > 20% stressed plants.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'observation', stage: 'field-veg' })
    .update({
      sop_text: `Veg scouting — field stage.

Walk each row. Spot-check at least 5 containers per row (every 6th container minimum).

What to look for:
• Spider mites: stippling (tiny dots) on upper leaf surface, webbing on undersides
• Fungus gnats: adults flying up when disturbed, larvae in top inch of soil
• Aphids: clusters on new growth tips, honeydew (sticky residue) on leaves below
• Nutrient deficiencies: yellowing between veins (Mg), purple undersides (P), pale new growth (Fe/Mn)
• Structure: any plants significantly shorter or taller than row average

Log severity (low / medium / high) and photograph affected leaves.
Flag any rows needing foliar or pesticide treatment.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'observation', stage: 'field-flower' })
    .update({
      sop_text: `Flower scouting — field stage.

Walk each row. Spot-check 5+ containers per row.

Focus areas during flower:
• Botrytis (gray mold): mushy or gray areas inside dense bud sites — URGENT, notify supervisor
• Powdery mildew: white powdery coating on fan leaves or bud leaves
• Spider mites: webbing or stippling — look especially in bud sites
• Nutrient status: light tip burn is normal; widespread yellowing = deficiency
• Bud development: note any airy or underdeveloped sites

Photograph any bud rot or mold immediately and notify supervisor before leaving the field.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'observation', stage: 'flush' })
    .update({
      sop_text: `Maturity check — flush stage.

Use a jeweler's loupe or digital microscope (60–100×) on bud sites.

Trichome guide:
• Clear = not ready; continue flush
• Cloudy / milky = near peak — harvest window approaching
• Amber = THC converting to CBN — harvest window open

Target for harvest: 70–80% cloudy, < 20% amber for most strains.

Also check:
• Pistil color: > 50% orange/red indicates maturity
• Calyx swell: full, rounded calyxes indicate peak development
• Fan leaf senescence: yellowing is expected during flush

Log maturity_pct estimate per container. Flag containers ready for harvest.`,
    });

  await knex('cv_stage_protocols')
    .where({ task_type: 'observation', stage: 'harvest_window' })
    .update({
      sop_text: `Harvest readiness assessment — daily.

Use a jeweler's loupe or scope (60–100×) on each container's primary bud sites.

Record per container:
• maturity_pct: estimated % ready (0–100 scale)
• ready_to_harvest: yes/no judgment call
• harvest_priority: 1 = harvest first; higher number = harvest later

Trichome guide:
  < 50% cloudy → not ready (continue flush)
  70%+ cloudy, minimal amber → approaching peak — log 70–80%
  80%+ cloudy, < 20% amber → ready to harvest
  > 30% amber → past peak — harvest immediately, mark priority 1

Note: prioritize containers showing rapid amber development to avoid over-ripening.`,
    });

  // ── Checklist items ─────────────────────────────────────────────────────────

  const fertProtocols = await knex('cv_stage_protocols')
    .where({ task_type: 'fertigation' })
    .select('protocol_id');

  const fertigationChecklist = [
    { label: 'Reservoir filled and drip lines inspected', required: 1, order_index: 0 },
    { label: 'Recipe version confirmed (check recipe card)', required: 1, order_index: 1 },
    { label: 'Nutrients added in correct mixing order', required: 1, order_index: 2 },
    { label: 'EC measured and within target range', required: 1, order_index: 3 },
    { label: 'pH measured and within target range', required: 1, order_index: 4 },
    { label: 'Application completed across full sub-zone', required: 0, order_index: 5 },
  ];

  for (const p of fertProtocols) {
    await knex('cv_protocol_checklist_items').insert(
      fertigationChecklist.map(item => ({
        ...item,
        protocol_id: p.protocol_id,
        created_at: now,
      }))
    );
  }

  // Stage-specific observation checklists
  const obsChecklistsByStage: Record<string, Array<{ label: string; required: number; order_index: number }>> = {
    seedling: [
      { label: 'All trays walked and inspected', required: 1, order_index: 0 },
      { label: 'Germination rate counted and logged', required: 1, order_index: 1 },
      { label: 'Damping off checked — collapsed stems at soil line?', required: 1, order_index: 2 },
      { label: 'Stretch checked — stems < 2" before first true leaf?', required: 0, order_index: 3 },
      { label: 'Abnormal trays photographed', required: 0, order_index: 4 },
    ],
    'cult-hoop': [
      { label: 'All rows walked', required: 1, order_index: 0 },
      { label: 'Stress response noted (curl, wilt, sun scald)', required: 1, order_index: 1 },
      { label: 'Root development spot-checked on 1–2 containers', required: 0, order_index: 2 },
      { label: 'Unusual observations logged with photo', required: 0, order_index: 3 },
    ],
    'field-veg': [
      { label: 'All rows walked (5+ containers per row spot-checked)', required: 1, order_index: 0 },
      { label: 'Pest pressure assessed (mites, gnats, aphids)', required: 1, order_index: 1 },
      { label: 'Nutrient deficiencies logged if observed', required: 0, order_index: 2 },
      { label: 'Follow-up foliar or pesticide application flagged if needed', required: 0, order_index: 3 },
    ],
    'field-flower': [
      { label: 'All rows walked (5+ containers per row spot-checked)', required: 1, order_index: 0 },
      { label: 'Botrytis / bud rot checked in dense bud sites', required: 1, order_index: 1 },
      { label: 'Spider mite webbing checked in bud canopy', required: 1, order_index: 2 },
      { label: 'Any bud rot photographed and supervisor notified', required: 0, order_index: 3 },
      { label: 'Trichome development noted on 3+ containers', required: 0, order_index: 4 },
    ],
    flush: [
      { label: 'Loupe or scope in hand', required: 1, order_index: 0 },
      { label: 'Trichome color checked on 5+ containers', required: 1, order_index: 1 },
      { label: 'maturity_pct estimated and logged per container', required: 1, order_index: 2 },
      { label: 'Pistil color noted', required: 0, order_index: 3 },
      { label: 'Harvest window flag set if > 70% cloudy on 50%+ of plants', required: 0, order_index: 4 },
    ],
    harvest_window: [
      { label: 'Loupe or scope confirmed in hand (60–100×)', required: 1, order_index: 0 },
      { label: 'Each container assessed for maturity_pct', required: 1, order_index: 1 },
      { label: 'ready_to_harvest marked yes/no for every container', required: 1, order_index: 2 },
      { label: 'harvest_priority assigned to all ready containers', required: 0, order_index: 3 },
    ],
    harvesting: [
      { label: 'Harvest batch record open and current', required: 1, order_index: 0 },
      { label: 'Remaining unharvested plants counted', required: 0, order_index: 1 },
    ],
  };

  for (const [stage, items] of Object.entries(obsChecklistsByStage)) {
    const protocols = await knex('cv_stage_protocols')
      .where({ task_type: 'observation', stage })
      .select('protocol_id');

    for (const p of protocols) {
      await knex('cv_protocol_checklist_items').insert(
        items.map(item => ({
          ...item,
          protocol_id: p.protocol_id,
          created_at: now,
        }))
      );
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove seeded SOP text
  await knex('cv_stage_protocols')
    .whereIn('task_type', ['fertigation', 'observation'])
    .update({ sop_text: null });

  // Remove seeded checklist items (all items on seed protocols)
  const seedProtocols = await knex('cv_stage_protocols')
    .whereIn('task_type', ['fertigation', 'observation'])
    .select('protocol_id');

  if (seedProtocols.length > 0) {
    await knex('cv_protocol_checklist_items')
      .whereIn('protocol_id', seedProtocols.map((p: { protocol_id: number }) => p.protocol_id))
      .delete();
  }
}
