import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import {
  CONVERSIONS,
  SUB_ZONE_CONFIG,
  calcMix,
  formatVolume,
  rateToMlPerMl,
  isWeightBased,
} from '../lib/mix-calculator';

const DRAFT_KEY = 'cv_draft_calculator';
const SUB_ZONES = Object.keys(SUB_ZONE_CONFIG);
const ROWS = ['R1', 'R2', 'R3', 'R4', 'R5'];

function ModeTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 px-2 text-sm font-semibold rounded-xl transition-colors ${
        active
          ? 'bg-green-800 text-white shadow-sm'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
      style={{ minHeight: '48px' }}
    >
      {label}
    </button>
  );
}

function Chip({ label, active, onClick, small }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl font-semibold transition-colors border-2 ${
        small ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-sm'
      } ${
        active
          ? 'bg-green-800 text-white border-green-800'
          : 'bg-white text-gray-700 border-gray-200 hover:border-green-400'
      }`}
      style={{ minHeight: small ? '40px' : '56px' }}
    >
      {label}
    </button>
  );
}

function NumInput({ label, value, onChange, placeholder, step = '0.1', min = '0' }) {
  return (
    <div>
      {label && <label className="block text-xs text-gray-500 mb-1 font-medium">{label}</label>}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        placeholder={placeholder ?? '0.00'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
        style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
      />
    </div>
  );
}

function printMixingCard({ recipe, result, contextLine }) {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return;

  const ingredientRows = result.ingredients.map((ing, i) => `
    <div style="display:flex;align-items:baseline;padding:10px 0;border-bottom:1px solid #e5dcc8;gap:12px;">
      <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#a04727;min-width:24px;">${ing.order_index ?? i + 1}</span>
      <div style="flex:1;">
        <div style="font-size:18px;font-weight:600;">${ing.input_name}</div>
        ${ing.notes ? `<div style="font-size:12px;color:#7a6a5a;margin-top:2px;">${ing.notes}</div>` : ''}
      </div>
      <span style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;color:#1f3320;text-align:right;min-width:140px;">${ing.quantity?.display ?? '—'}</span>
    </div>
  `).join('');

  const totalDisplay = result.totalVolume?.display ?? '—';
  const targets = [result.ecTarget, result.phTarget ? `pH ${result.phTarget}` : null].filter(Boolean).join(' · ');

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @page { size: letter; margin: 0.75in; }
    * { box-sizing: border-box; }
    body { font-family: Fraunces, Georgia, serif; background: #faf6ed; color: #1f3320; margin: 0; padding: 36px; }
    h1 { font-size: 32px; font-weight: 700; margin: 0 0 4px; }
    .version { font-size: 13px; color: #a04727; font-family: 'JetBrains Mono', monospace; margin: 0 0 20px; }
    .context { font-size: 13px; color: #5a4a3a; margin: 0 0 16px; }
    .volume-block { background: #1f3320; color: #faf6ed; border-radius: 8px; padding: 16px 24px; margin: 0 0 20px; }
    .volume-num { font-family: 'JetBrains Mono', monospace; font-size: 48px; font-weight: 700; margin: 0 0 4px; }
    .targets { font-size: 15px; opacity: 0.85; }
    hr { border: none; border-top: 2px solid #a04727; margin: 20px 0; }
    .section-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a04727; margin: 0 0 12px; }
    .mixing-order { white-space: pre-wrap; font-size: 13px; line-height: 1.7; }
    .footer { margin-top: 36px; padding-top: 8px; border-top: 1px solid #c9b99a; font-size: 11px; color: #a04727; }
  </style>
</head>
<body>
  <h1>${recipe.name}</h1>
  <div class="version">Version ${recipe.version} · Printed ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
  ${contextLine ? `<div class="context">${contextLine}</div>` : ''}
  <div class="volume-block">
    <div class="volume-num">${totalDisplay}</div>
    ${targets ? `<div class="targets">${targets}</div>` : ''}
  </div>
  <hr>
  <div class="section-label">Ingredients</div>
  ${ingredientRows}
  ${recipe.mixing_order ? `<hr><div class="section-label">Mixing Order</div><div class="mixing-order">${recipe.mixing_order.replace(/</g, '&lt;')}</div>` : ''}
  <div class="footer">cultivate.hatstak.app · Fairwater Farm</div>
  <script>setTimeout(function(){ window.print(); }, 400);</script>
</body>
</html>`);
  win.document.close();
}

export default function MixCalculator({ recipe, ingredients, initialBatchId, onVolumeSelected, onClose }) {
  const [mode, setMode] = useState('subzone');
  const [selectedSubZone, setSelectedSubZone] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [plantsPerContainer, setPlantsPerContainer] = useState(1);
  const [rateValue, setRateValue] = useState('');
  const [rateUnit, setRateUnit] = useState('gal/plant');
  const [plantCount, setPlantCount] = useState('');
  const [manualVolume, setManualVolume] = useState('');
  const [manualUnit, setManualUnit] = useState('gal');
  const [outputSystem, setOutputSystem] = useState('imperial');
  const [showMoreRate, setShowMoreRate] = useState(false);

  // Load batch context if initialBatchId provided
  useEffect(() => {
    if (!initialBatchId) return;
    api.getBatch(initialBatchId)
      .then(batch => {
        if (batch.sub_zone_id) setSelectedSubZone(batch.sub_zone_id);
        if (batch.plants_per_container) setPlantsPerContainer(batch.plants_per_container);
      })
      .catch(() => {});
  }, [initialBatchId]);

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.mode) setMode(d.mode);
      if (d.selectedSubZone) setSelectedSubZone(d.selectedSubZone);
      if (d.selectedRows) setSelectedRows(d.selectedRows);
      if (d.plantsPerContainer) setPlantsPerContainer(d.plantsPerContainer);
      if (d.rateValue) setRateValue(d.rateValue);
      if (d.rateUnit) setRateUnit(d.rateUnit);
      if (d.plantCount) setPlantCount(d.plantCount);
      if (d.manualVolume) setManualVolume(d.manualVolume);
      if (d.manualUnit) setManualUnit(d.manualUnit);
      if (d.outputSystem) setOutputSystem(d.outputSystem);
    } catch {}
  }, []);

  // Save draft to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        mode, selectedSubZone, selectedRows, plantsPerContainer, rateValue, rateUnit,
        plantCount, manualVolume, manualUnit, outputSystem,
      }));
    } catch {}
  }, [mode, selectedSubZone, selectedRows, plantsPerContainer, rateValue, rateUnit, plantCount, manualVolume, manualUnit, outputSystem]);

  // ─── Compute target volume in mL ─────────────────────────────────────────
  const targetVolumeMl = useMemo(() => {
    const rate = Number(rateValue) || 0;
    if (rate <= 0 && mode !== 'manual') return null;

    let rateGal;
    let perContainer = false;
    switch (rateUnit) {
      case 'gal/plant':      rateGal = rate; break;
      case 'L/plant':        rateGal = rate * (CONVERSIONS.mL_per_L / CONVERSIONS.mL_per_gal); break;
      case 'gal/container':  rateGal = rate; perContainer = true; break;
      case 'L/container':    rateGal = rate * (CONVERSIONS.mL_per_L / CONVERSIONS.mL_per_gal); perContainer = true; break;
      default:               rateGal = rate;
    }

    const ppc = perContainer ? 1 : Number(plantsPerContainer) || 1;

    switch (mode) {
      case 'subzone': {
        const cfg = SUB_ZONE_CONFIG[selectedSubZone];
        if (!cfg || !selectedSubZone) return null;
        const total = cfg.totalContainers * ppc * rateGal;
        return total * CONVERSIONS.mL_per_gal;
      }
      case 'rows': {
        if (!selectedSubZone || !selectedRows.length) return null;
        const cfg = SUB_ZONE_CONFIG[selectedSubZone];
        if (!cfg) return null;
        const containers = selectedRows.length * cfg.containersPerRow;
        return containers * ppc * rateGal * CONVERSIONS.mL_per_gal;
      }
      case 'plantcount': {
        const plants = Number(plantCount) || 0;
        if (plants <= 0) return null;
        return plants * rateGal * CONVERSIONS.mL_per_gal;
      }
      case 'manual': {
        const vol = Number(manualVolume) || 0;
        if (vol <= 0) return null;
        return manualUnit === 'L'
          ? vol * CONVERSIONS.mL_per_L
          : vol * CONVERSIONS.mL_per_gal;
      }
      default: return null;
    }
  }, [mode, selectedSubZone, selectedRows, plantsPerContainer, rateValue, rateUnit, plantCount, manualVolume, manualUnit]);

  const result = useMemo(() => {
    if (!targetVolumeMl || targetVolumeMl <= 0) return null;
    return calcMix(recipe, ingredients, targetVolumeMl, outputSystem);
  }, [recipe, ingredients, targetVolumeMl, outputSystem]);

  // ─── Intermediate summary line ────────────────────────────────────────────
  const summaryLine = useMemo(() => {
    if (mode === 'manual') return null;
    const rate = Number(rateValue) || 0;
    if (!rate) return null;
    const ppc = Number(plantsPerContainer) || 1;
    const perContainer = rateUnit === 'gal/container' || rateUnit === 'L/container';
    const unitLabel = rateUnit;

    if (mode === 'subzone' && selectedSubZone) {
      const cfg = SUB_ZONE_CONFIG[selectedSubZone];
      if (!cfg) return null;
      if (perContainer) {
        return `${cfg.totalContainers} containers × ${rate} ${unitLabel}`;
      }
      return `${cfg.totalContainers} containers × ${ppc} plants/container × ${rate} ${unitLabel}`;
    }
    if (mode === 'rows' && selectedSubZone && selectedRows.length) {
      const cfg = SUB_ZONE_CONFIG[selectedSubZone];
      if (!cfg) return null;
      const containers = selectedRows.length * cfg.containersPerRow;
      if (perContainer) {
        return `${containers} containers × ${rate} ${unitLabel}`;
      }
      return `${containers} containers × ${ppc} plants/container × ${rate} ${unitLabel}`;
    }
    if (mode === 'plantcount' && plantCount) {
      return `${plantCount} plants × ${rate} ${unitLabel}`;
    }
    return null;
  }, [mode, selectedSubZone, selectedRows, plantsPerContainer, rateValue, rateUnit, plantCount]);

  // ─── Print context line for card ─────────────────────────────────────────
  const printContextLine = useMemo(() => {
    if (!targetVolumeMl) return '';
    const volImperial = formatVolume(targetVolumeMl, 'imperial');
    if (summaryLine) return `${summaryLine} = ${volImperial.display}`;
    if (mode === 'manual') {
      return `${manualVolume} ${manualUnit} (manual)`;
    }
    return '';
  }, [targetVolumeMl, summaryLine, mode, manualVolume, manualUnit]);

  function toggleRow(r) {
    setSelectedRows(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  }

  function handleUseVolume() {
    if (!targetVolumeMl || !onVolumeSelected) return;
    const gallons = targetVolumeMl / CONVERSIONS.mL_per_gal;
    onVolumeSelected(gallons);
  }

  const hasVolume = targetVolumeMl && targetVolumeMl > 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* Close button if in modal context */}
      {onClose && (
        <div className="flex justify-end px-4 pt-3">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            style={{ minHeight: '44px', minWidth: '44px' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-36 max-w-2xl mx-auto w-full">

        {/* Recipe header */}
        <div className="mb-5 bg-green-900 text-white rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-lg" style={{ fontFamily: 'Fraunces, serif' }}>{recipe.name}</span>
            <span className="text-xs bg-green-700 text-green-100 px-2 py-0.5 rounded-full font-semibold">v{recipe.version}</span>
          </div>
          {(recipe.ec_target_low != null || recipe.ec_target_high != null || recipe.ph_target_low != null) && (
            <div className="flex gap-5 mt-1.5 text-sm text-green-200" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {recipe.ec_target_low != null && (
                <span>EC {recipe.ec_target_low}–{recipe.ec_target_high} mS/cm</span>
              )}
              {recipe.ph_target_low != null && (
                <span>pH {recipe.ph_target_low}–{recipe.ph_target_high}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Target Volume ─────────────────────────────────────────────── */}
        <div className="mb-1">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Target Volume
          </label>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            <ModeTab label="Sub-zone" active={mode === 'subzone'} onClick={() => setMode('subzone')} />
            <ModeTab label="Rows"     active={mode === 'rows'}    onClick={() => setMode('rows')}    />
            <ModeTab label="Plants"   active={mode === 'plantcount'} onClick={() => setMode('plantcount')} />
            <ModeTab label="Manual"   active={mode === 'manual'}  onClick={() => setMode('manual')}  />
          </div>

          {/* ── Subzone mode ────────────────────────────────────────────── */}
          {mode === 'subzone' && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Sub-zone</label>
                <div className="flex flex-wrap gap-2">
                  {SUB_ZONES.map(sz => (
                    <Chip key={sz} label={sz} small active={selectedSubZone === sz} onClick={() => setSelectedSubZone(sz)} />
                  ))}
                </div>
                {selectedSubZone && (
                  <div className="text-xs text-gray-400 mt-1.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {SUB_ZONE_CONFIG[selectedSubZone].totalContainers} containers · {SUB_ZONE_CONFIG[selectedSubZone].potSize}-gal pots
                  </div>
                )}
              </div>
              <RateInputs
                rateValue={rateValue} setRateValue={setRateValue}
                rateUnit={rateUnit} setRateUnit={setRateUnit}
                plantsPerContainer={plantsPerContainer} setPlantsPerContainer={setPlantsPerContainer}
                showMoreRate={showMoreRate} setShowMoreRate={setShowMoreRate}
                showPlants
              />
            </div>
          )}

          {/* ── Rows mode ───────────────────────────────────────────────── */}
          {mode === 'rows' && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Sub-zone</label>
                <div className="flex flex-wrap gap-2">
                  {SUB_ZONES.map(sz => (
                    <Chip key={sz} label={sz} small active={selectedSubZone === sz}
                      onClick={() => { setSelectedSubZone(sz); setSelectedRows([]); }}
                    />
                  ))}
                </div>
              </div>
              {selectedSubZone && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 font-medium">
                    Rows &nbsp;
                    <span className="text-gray-400">
                      ({selectedRows.length} of 5 selected · {
                        selectedRows.length * SUB_ZONE_CONFIG[selectedSubZone].containersPerRow
                      } containers)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    {ROWS.map(r => (
                      <Chip key={r} label={r} small active={selectedRows.includes(r)} onClick={() => toggleRow(r)} />
                    ))}
                  </div>
                </div>
              )}
              <RateInputs
                rateValue={rateValue} setRateValue={setRateValue}
                rateUnit={rateUnit} setRateUnit={setRateUnit}
                plantsPerContainer={plantsPerContainer} setPlantsPerContainer={setPlantsPerContainer}
                showMoreRate={showMoreRate} setShowMoreRate={setShowMoreRate}
                showPlants
              />
            </div>
          )}

          {/* ── Plant count mode ────────────────────────────────────────── */}
          {mode === 'plantcount' && (
            <div className="flex flex-col gap-3">
              <NumInput
                label="Number of plants"
                value={plantCount}
                onChange={setPlantCount}
                placeholder="0"
                step="1"
              />
              <RateInputs
                rateValue={rateValue} setRateValue={setRateValue}
                rateUnit={rateUnit} setRateUnit={setRateUnit}
                plantsPerContainer={plantsPerContainer} setPlantsPerContainer={setPlantsPerContainer}
                showMoreRate={showMoreRate} setShowMoreRate={setShowMoreRate}
                showPlants={false}
              />
            </div>
          )}

          {/* ── Manual mode ─────────────────────────────────────────────── */}
          {mode === 'manual' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <NumInput
                  label="Volume"
                  value={manualVolume}
                  onChange={setManualVolume}
                  placeholder="0.0"
                />
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <label className="text-xs text-gray-500 font-medium invisible">Unit</label>
                <div className="flex gap-1.5">
                  {['gal', 'L'].map(u => (
                    <Chip key={u} label={u} small active={manualUnit === u} onClick={() => setManualUnit(u)} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Intermediate summary ──────────────────────────────────────── */}
        {summaryLine && (
          <div className="mt-3 text-sm text-gray-500 bg-gray-100 rounded-xl px-4 py-2.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {summaryLine}
          </div>
        )}

        {/* ── Total volume display ──────────────────────────────────────── */}
        {hasVolume ? (
          <div className="mt-4 bg-white rounded-2xl border border-gray-200 px-5 py-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Total Volume</div>
            <div className="text-4xl font-bold text-green-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {result?.totalVolume?.display}
            </div>
            {outputSystem === 'imperial' && (
              <div className="text-sm text-gray-400 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                ({(targetVolumeMl / CONVERSIONS.mL_per_L).toFixed(1)} L)
              </div>
            )}
            {outputSystem === 'metric' && (
              <div className="text-sm text-gray-400 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                ({(targetVolumeMl / CONVERSIONS.mL_per_gal).toFixed(1)} gal)
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 bg-gray-100 rounded-2xl px-5 py-4 text-sm text-gray-400 text-center">
            Enter a target volume to see quantities
          </div>
        )}

        {/* ── Output system toggle ──────────────────────────────────────── */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Output:</span>
          <div className="flex gap-1.5">
            {[['imperial', 'Imperial'], ['metric', 'Metric']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setOutputSystem(val)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  outputSystem === val
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                }`}
                style={{ minHeight: '40px' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Mixing Instructions ───────────────────────────────────────── */}
        <div className="mt-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mixing Instructions</div>
          {!hasVolume || !result ? (
            <div className="text-sm text-gray-400 italic">Enter a volume above to calculate ingredient quantities.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {(result.ecTarget || result.phTarget) && (
                <div className="px-5 py-3 bg-green-50 border-b border-green-100 text-sm text-green-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {[result.ecTarget, result.phTarget ? `pH ${result.phTarget}` : null].filter(Boolean).join(' · ')}
                </div>
              )}
              {result.ingredients.map((ing, i) => (
                <div key={i} className={`px-5 py-3.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-sm text-amber-700 font-bold w-5 flex-shrink-0 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {ing.order_index ?? i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm leading-snug">{ing.input_name}</div>
                        {ing.notes && (
                          <div className="text-xs text-gray-400 mt-0.5 leading-snug">{ing.notes}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-base font-bold text-green-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {ing.quantity?.value != null ? ing.quantity.value.toFixed(2) : '—'}
                      </span>
                      {' '}
                      <span className="text-sm text-gray-500">{ing.quantity?.unit ?? ''}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mixing order from recipe */}
        {recipe.mixing_order && hasVolume && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Mixing Order</div>
            <pre className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed font-sans">{recipe.mixing_order}</pre>
          </div>
        )}
      </div>

      {/* ── Fixed bottom bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto flex gap-3">
          <button
            onClick={() => hasVolume && result && printMixingCard({ recipe, result, contextLine: printContextLine })}
            disabled={!hasVolume}
            className={`flex-1 py-4 rounded-2xl text-sm font-semibold border-2 transition-colors ${
              hasVolume
                ? 'border-green-800 text-green-800 bg-white hover:bg-green-50 active:scale-[0.98]'
                : 'border-gray-200 text-gray-300 bg-white cursor-not-allowed'
            }`}
            style={{ minHeight: '56px' }}
          >
            🖨 Print Card
          </button>
          {onVolumeSelected && (
            <button
              onClick={handleUseVolume}
              disabled={!hasVolume}
              className={`flex-1 py-4 rounded-2xl text-sm font-bold text-white transition-colors shadow-md ${
                hasVolume
                  ? 'bg-green-800 hover:bg-green-900 active:scale-[0.98]'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
              style={{ minHeight: '56px' }}
            >
              Use This Volume →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RateInputs({ rateValue, setRateValue, rateUnit, setRateUnit, plantsPerContainer, setPlantsPerContainer, showMoreRate, setShowMoreRate, showPlants }) {
  const baseRateUnits = [
    ['gal/plant', 'gal/plant'],
    ['L/plant',   'L/plant'],
  ];
  const moreRateUnits = [
    ['gal/container', 'gal/container'],
    ['L/container',   'L/container'],
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Rate</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.05"
            min="0"
            placeholder="0.50"
            value={rateValue}
            onChange={e => setRateValue(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
            style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Unit</label>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1.5">
              {baseRateUnits.map(([val, label]) => (
                <Chip key={val} label={label} small active={rateUnit === val} onClick={() => setRateUnit(val)} />
              ))}
            </div>
            <button
              onClick={() => setShowMoreRate(m => !m)}
              className="text-xs text-gray-400 hover:text-gray-600 text-left"
            >
              {showMoreRate ? '▾ Less' : '▸ Container rates'}
            </button>
            {showMoreRate && (
              <div className="flex gap-1.5">
                {moreRateUnits.map(([val, label]) => (
                  <Chip key={val} label={label} small active={rateUnit === val} onClick={() => setRateUnit(val)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showPlants && !(rateUnit === 'gal/container' || rateUnit === 'L/container') && (
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Plants per container</label>
          <div className="flex gap-2">
            {[1, 2, 3].map(n => (
              <Chip key={n} label={String(n)} small active={plantsPerContainer === n} onClick={() => setPlantsPerContainer(n)} />
            ))}
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="10"
              placeholder="—"
              value={[1, 2, 3].includes(plantsPerContainer) ? '' : plantsPerContainer}
              onChange={e => setPlantsPerContainer(Number(e.target.value) || 1)}
              className="w-16 border border-gray-300 rounded-xl px-3 text-center text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              style={{ minHeight: '40px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
