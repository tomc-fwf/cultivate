import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_batch_new';

const PHASE_OPTIONS = [
  { value: 'immature', label: 'Immature', desc: 'Seed or clone, no plant tags', status: 'germ' },
  { value: 'veg',      label: 'Veg',      desc: 'Tagged vegetative plants',      status: 'field-veg' },
  { value: 'flower',   label: 'Flower',   desc: 'Tagged flowering plants',       status: 'field-flower' },
];

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : 'bg-amber-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl`}>
        {type === 'success' ? '✓ ' : '⚠ '}{message}
      </div>
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMetrcDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function flattenLocations(tree) {
  const result = [];
  for (const category of ['indoor', 'hoop_house', 'outdoor']) {
    const locs = tree[category] ?? [];
    for (const loc of locs) {
      result.push(loc);
      for (const sub of loc.sub_locations ?? []) result.push(sub);
    }
  }
  return result;
}

export default function BatchNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetLocationId = searchParams.get('location_id');
  const presetSeedPackageId = searchParams.get('seed_package_id');

  const [phase, setPhase] = useState('immature');
  const [sourceType, setSourceType] = useState('seed');

  const [seedPackages, setSeedPackages] = useState([]);
  const [seedPackagesLoading, setSeedPackagesLoading] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(presetSeedPackageId ?? '');
  const [seedCountUsed, setSeedCountUsed] = useState('');
  const [seedWeightGManual, setSeedWeightGManual] = useState('');

  const [plantCount, setPlantCount] = useState('');
  const [plantsPerContainer, setPlantsPerContainer] = useState('1');
  const [startDate, setStartDate] = useState(todayISO());
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('');
  const [notes, setNotes] = useState('');

  const [presetLocationName, setPresetLocationName] = useState(null);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const autoSaveTimer = useRef(null);

  // Load all active seed packages on mount
  useEffect(() => {
    if (phase !== 'immature' || sourceType !== 'seed') return;
    setSeedPackagesLoading(true);
    api.getSeedPackages({ active: '1' })
      .then(data => {
        setSeedPackages(data);
        setSeedPackagesLoading(false);
        if (presetSeedPackageId && data.some(p => String(p.package_id) === presetSeedPackageId)) {
          setSelectedPackageId(presetSeedPackageId);
        }
      })
      .catch(() => setSeedPackagesLoading(false));
  }, [phase, sourceType]);

  // Restore draft
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (draft) {
        if (draft.phase) setPhase(draft.phase);
        if (draft.sourceType) setSourceType(draft.sourceType);
        if (draft.plantCount) setPlantCount(draft.plantCount);
        if (draft.plantsPerContainer) setPlantsPerContainer(draft.plantsPerContainer);
        if (draft.startDate) setStartDate(draft.startDate);
        if (draft.expectedHarvestDate) setExpectedHarvestDate(draft.expectedHarvestDate);
        if (draft.notes) setNotes(draft.notes);
        if (draft.seedCountUsed) setSeedCountUsed(draft.seedCountUsed);
        if (!presetSeedPackageId && draft.selectedPackageId) setSelectedPackageId(draft.selectedPackageId);
      }
    } catch { /* ignore */ }
  }, []);

  // Resolve preset location name
  useEffect(() => {
    if (!presetLocationId) return;
    api.getLocationsTree()
      .then(d => {
        const loc = flattenLocations(d.tree).find(l => String(l.location_id) === presetLocationId);
        if (loc) setPresetLocationName(loc.name);
      })
      .catch(() => {});
  }, [presetLocationId]);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        phase, sourceType, plantCount, plantsPerContainer, startDate,
        expectedHarvestDate, notes, selectedPackageId, seedCountUsed,
        savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [phase, sourceType, plantCount, plantsPerContainer, startDate,
      expectedHarvestDate, notes, selectedPackageId, seedCountUsed]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Derived from selected package
  const selectedPackage = seedPackages.find(p => String(p.package_id) === selectedPackageId) ?? null;
  const perSeedWeight = selectedPackage?.seed_count_initial > 0 && selectedPackage?.weight_g_initial != null
    ? selectedPackage.weight_g_initial / selectedPackage.seed_count_initial
    : null;
  const canAutoCalcWeight = perSeedWeight != null;
  const calculatedWeightG = canAutoCalcWeight && seedCountUsed && Number(seedCountUsed) > 0
    ? Number((Number(seedCountUsed) * perSeedWeight).toFixed(3))
    : null;
  const effectiveWeightG = calculatedWeightG ?? (seedWeightGManual ? Number(seedWeightGManual) : null);
  const weightAfter = selectedPackage?.weight_g_remaining != null && effectiveWeightG != null
    ? Math.max(0, selectedPackage.weight_g_remaining - effectiveWeightG)
    : null;
  const weightExceeded = selectedPackage?.weight_g_remaining != null && effectiveWeightG != null
    && effectiveWeightG > selectedPackage.weight_g_remaining;

  // METRC batch name derived from package
  const metrcBatchName = selectedPackage && startDate
    ? `${selectedPackage.strain_name} | ${formatMetrcDate(startDate)} | ${selectedPackage.strain_type === 'auto' ? 'Auto' : 'Photo'}`
    : null;

  function validate() {
    const errors = {};
    if (phase === 'immature' && sourceType === 'seed' && !selectedPackageId)
      errors.package = 'Select a seed package';
    if (!plantCount || isNaN(Number(plantCount)) || Number(plantCount) <= 0)
      errors.plantCount = 'Plant count must be a positive number';
    if (!startDate) errors.startDate = 'Start date is required';
    if (weightExceeded) errors.weight = 'Deduction exceeds available weight';
    return errors;
  }

  async function handleSave() {
    const errors = validate();
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setSaving(true);
    setErr('');
    try {
      const initialStatus = PHASE_OPTIONS.find(p => p.value === phase)?.status ?? 'germ';
      const batch = await api.createBatch({
        strain_id: selectedPackage?.strain_id ?? null,
        plant_count_initial: Number(plantCount),
        plants_per_container: Number(plantsPerContainer),
        sow_date: startDate,
        expected_harvest_date: (phase !== 'immature' && expectedHarvestDate) ? expectedHarvestDate : null,
        metrc_plant_batch_uid: null,
        sub_zone_id: null,
        notes: notes || null,
        source_type: phase === 'immature' ? sourceType : null,
        seed_package_id: (phase === 'immature' && sourceType === 'seed' && selectedPackageId)
          ? Number(selectedPackageId) : null,
        seed_count_used: seedCountUsed ? Number(seedCountUsed) : null,
        seed_weight_g: effectiveWeightG,
        initial_phase: phase,
        initial_status: initialStatus,
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setToast({ message: 'Plant group created ✓', type: 'success' });
      setTimeout(() => navigate(`/batches/${batch.batch_id}`), 1200);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <button
        onClick={() => navigate(-1)}
        className="text-sm text-green-700 font-medium mb-5 flex items-center gap-1 hover:text-green-900"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        New Plant Group
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {{
          immature: 'Immature plants — tracked as a group, no individual METRC tags yet.',
          veg:      'Vegetative — plants have individual METRC plant tags.',
          flower:   'Flowering — plants have individual METRC plant tags.',
        }[phase]}
      </p>

      {presetLocationName && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-6">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Starting From</div>
          <div className="text-sm font-semibold text-green-900">{presetLocationName}</div>
        </div>
      )}

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{err}</div>
      )}

      {/* Growth Phase */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          Growth Phase <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          {PHASE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setPhase(opt.value); setSelectedPackageId(''); setSeedCountUsed(''); }}
              className={`flex-1 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition-colors text-center ${
                phase === opt.value
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
              }`}
              style={{ minHeight: '56px' }}
            >
              <div>{opt.label}</div>
              <div className={`text-xs font-normal mt-0.5 ${phase === opt.value ? 'text-green-200' : 'text-gray-400'}`}>
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Source Type — immature only */}
      {phase === 'immature' && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-2">Source</label>
          <div className="flex gap-2">
            {[
              { value: 'seed',  label: '🌱 Seed' },
              { value: 'clone', label: '✂️ Clone' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setSourceType(opt.value); setSelectedPackageId(''); setSeedCountUsed(''); }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  sourceType === opt.value
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                }`}
                style={{ minHeight: '56px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seed Package — immature + seed only */}
      {phase === 'immature' && sourceType === 'seed' && (
        <div className="mb-5">
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-sm font-semibold text-gray-800">
              Seed Package <span className="text-red-500">*</span>
            </label>
            <button
              onClick={() => navigate('/seed-vault')}
              className="text-xs text-green-700 underline hover:text-green-900"
            >
              Manage Seed Vault →
            </button>
          </div>

          {seedPackagesLoading ? (
            <div className="text-sm text-gray-400 italic px-1">Loading packages…</div>
          ) : seedPackages.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-800 mb-2">No active seed packages on file.</p>
              <button
                onClick={() => navigate('/seed-vault?add=1')}
                className="text-sm font-semibold text-amber-700 underline hover:text-amber-900"
              >
                Add a package in the Seed Vault →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {seedPackages.map(p => {
                const isSelected = String(p.package_id) === selectedPackageId;
                const weightPct = p.weight_g_initial > 0
                  ? Math.min(100, Math.round(((p.weight_g_remaining ?? 0) / p.weight_g_initial) * 100))
                  : 0;
                return (
                  <button
                    key={p.package_id}
                    type="button"
                    onClick={() => {
                      setSelectedPackageId(String(p.package_id));
                      setSeedCountUsed('');
                      setSeedWeightGManual('');
                      setFieldErrors(fe => ({ ...fe, package: undefined }));
                    }}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                      isSelected
                        ? 'border-green-700 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-green-300'
                    }`}
                    style={{ minHeight: '56px' }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">
                          {p.package_name || p.lot_number || `Package #${p.package_id}`}
                        </span>
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          p.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {p.strain_name} · {p.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">✓</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${weightPct < 20 ? 'bg-amber-500' : 'bg-green-500'}`}
                            style={{ width: `${weightPct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {p.weight_g_remaining != null
                          ? `${Number(p.weight_g_remaining).toFixed(2)}g remaining`
                          : `${p.seed_count_remaining ?? '?'} seeds`}
                      </span>
                    </div>
                    {p.feminized && (
                      <span className="text-[10px] font-semibold text-pink-600 mt-0.5 block">♀ Feminized</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {fieldErrors.package && <p className="text-red-500 text-xs mt-1">{fieldErrors.package}</p>}

          {/* Seeds to Start + deduction preview */}
          {selectedPackage && (
            <div className="mt-3">
              {canAutoCalcWeight ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Seeds to Start</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={seedCountUsed}
                    onChange={e => setSeedCountUsed(e.target.value)}
                    placeholder="Number of seeds"
                    className={inputClass}
                    style={{ minHeight: '56px' }}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {perSeedWeight.toFixed(3)}g per seed
                    ({selectedPackage.weight_g_initial}g ÷ {selectedPackage.seed_count_initial} seeds)
                  </p>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Seeds to Start</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={seedCountUsed}
                        onChange={e => setSeedCountUsed(e.target.value)}
                        placeholder="Count (optional)"
                        className={inputClass}
                        style={{ minHeight: '48px' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Weight to Deduct (g)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={seedWeightGManual}
                        onChange={e => setSeedWeightGManual(e.target.value)}
                        placeholder="Grams"
                        className={inputClass}
                        style={{ minHeight: '48px' }}
                        step="0.001"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    Add seed count to this package in the Seed Vault to enable auto-calculation.
                  </p>
                </div>
              )}

              {/* Deduction preview */}
              {effectiveWeightG != null && effectiveWeightG > 0 && (
                <div className={`mt-3 rounded-xl px-4 py-3 border ${
                  weightExceeded ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                }`}>
                  <div className={`text-sm font-semibold ${weightExceeded ? 'text-red-800' : 'text-green-900'}`}>
                    −{effectiveWeightG.toFixed(2)}g from {selectedPackage.package_name || selectedPackage.lot_number}
                  </div>
                  {selectedPackage.weight_g_remaining != null && (
                    <div className={`text-xs mt-0.5 ${weightExceeded ? 'text-red-700' : 'text-green-700'}`}>
                      {Number(selectedPackage.weight_g_remaining).toFixed(2)}g → {weightAfter.toFixed(2)}g remaining
                      {weightExceeded && ' · ⚠ Exceeds available weight'}
                    </div>
                  )}
                </div>
              )}
              {fieldErrors.weight && <p className="text-red-500 text-xs mt-1">{fieldErrors.weight}</p>}
            </div>
          )}
        </div>
      )}

      {/* Start Date */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Start Date <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={startDate}
          onChange={e => { setStartDate(e.target.value); setFieldErrors(fe => ({ ...fe, startDate: undefined })); }}
          className={inputClass}
          style={{ minHeight: '56px' }}
        />
        {fieldErrors.startDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.startDate}</p>}
      </div>

      {/* Plant Count + Per container */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Plant Count <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={plantCount}
            onChange={e => { setPlantCount(e.target.value); setFieldErrors(fe => ({ ...fe, plantCount: undefined })); }}
            placeholder="e.g. 150"
            className={inputClass}
            style={{ minHeight: '56px' }}
          />
          {phase === 'immature' && sourceType === 'seed' && (
            <p className="text-xs text-gray-400 mt-1">Expected plants (may differ from seeds started)</p>
          )}
          {fieldErrors.plantCount && <p className="text-red-500 text-xs mt-1">{fieldErrors.plantCount}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">Per container</label>
          <div className="flex gap-2">
            {['1', '2'].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPlantsPerContainer(n)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  plantsPerContainer === n
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                }`}
                style={{ minHeight: '56px' }}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">2 = autoflowers</p>
        </div>
      </div>

      {/* Expected Harvest Date — non-immature only */}
      {phase !== 'immature' && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-1">Expected Harvest Date</label>
          <p className="text-xs text-gray-500 mb-2">Optional — used for PHI calculations. Can be updated later.</p>
          <input
            type="date"
            value={expectedHarvestDate}
            onChange={e => setExpectedHarvestDate(e.target.value)}
            className={inputClass}
            style={{ minHeight: '56px' }}
          />
        </div>
      )}

      {/* Notes */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes about this plant group…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
          rows={3}
        />
      </div>

      {phase !== 'immature' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          METRC Plant Batch UID can be added from the batch detail after creation.
        </div>
      )}

      {/* METRC batch name preview — shown when package + date are set */}
      {metrcBatchName && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-6">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">METRC Plant Batch Name</div>
          <div className="font-mono text-sm font-bold text-green-900">{metrcBatchName}</div>
          <div className="text-xs text-green-600 mt-1">
            Auto-generated · {phase === 'immature' ? 'Immature · Germ-01' : phase === 'veg' ? 'Vegetative' : 'Flowering'}
          </div>
        </div>
      )}

      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-lg mx-auto">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-green-800 text-white font-semibold rounded-2xl hover:bg-green-900 disabled:opacity-50 transition-colors shadow-lg text-base"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Creating plant group…' : 'Create Plant Group'}
        </button>
      </div>
    </div>
  );
}
