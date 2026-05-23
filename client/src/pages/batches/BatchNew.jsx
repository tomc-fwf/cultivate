import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_batch_new';

const PHASE_OPTIONS = [
  { value: 'immature', label: 'Immature', desc: 'Seed or clone, no plant tags',  status: 'germ' },
  { value: 'veg',      label: 'Veg',      desc: 'Tagged vegetative plants',       status: 'field-veg' },
  { value: 'flower',   label: 'Flower',   desc: 'Tagged flowering plants',        status: 'field-flower' },
];

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : 'bg-amber-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-auto`}>
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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const presetLocationId = searchParams.get('location_id');
  const presetSeedPackageId = searchParams.get('seed_package_id');

  // Growth phase + source type
  const [phase, setPhase] = useState('immature');
  const [sourceType, setSourceType] = useState('seed');

  // Seed package state
  const [seedPackages, setSeedPackages] = useState([]);
  const [seedPackagesLoading, setSeedPackagesLoading] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(presetSeedPackageId ?? '');
  const [seedCountUsed, setSeedCountUsed] = useState('');
  const [seedWeightGManual, setSeedWeightGManual] = useState(''); // fallback when per-seed weight unknown

  // Core batch fields
  const [strains, setStrains] = useState([]);
  const [strainsLoading, setStrainsLoading] = useState(true);
  const [strainId, setStrainId] = useState('');
  const [plantCount, setPlantCount] = useState('');
  const [plantsPerContainer, setPlantsPerContainer] = useState('1');
  const [startDate, setStartDate] = useState(todayISO());
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('');
  const [notes, setNotes] = useState('');

  const [presetLocationName, setPresetLocationName] = useState(null);

  // Add new strain inline form
  const [showNewStrain, setShowNewStrain] = useState(false);
  const [newStrainName, setNewStrainName] = useState('');
  const [newStrainType, setNewStrainType] = useState('auto');
  const [newStrainGenetics, setNewStrainGenetics] = useState('');
  const [savingStrain, setSavingStrain] = useState(false);
  const [strainErr, setStrainErr] = useState('');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const autoSaveTimer = useRef(null);

  useEffect(() => {
    api.getStrains()
      .then(data => { setStrains(data); setStrainsLoading(false); })
      .catch(() => setStrainsLoading(false));

    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (draft) {
        if (draft.phase) setPhase(draft.phase);
        if (draft.sourceType) setSourceType(draft.sourceType);
        if (draft.strainId) setStrainId(draft.strainId);
        if (draft.plantCount) setPlantCount(draft.plantCount);
        if (draft.plantsPerContainer) setPlantsPerContainer(draft.plantsPerContainer);
        if (draft.startDate) setStartDate(draft.startDate);
        if (draft.expectedHarvestDate) setExpectedHarvestDate(draft.expectedHarvestDate);
        if (draft.notes) setNotes(draft.notes);
        if (draft.seedCountUsed) setSeedCountUsed(draft.seedCountUsed);
        // Only restore package if it matches current preset (or no preset)
        if (!presetSeedPackageId && draft.selectedPackageId && draft.strainId === draft.strainId) {
          setSelectedPackageId(draft.selectedPackageId);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Load seed packages when strain + source conditions are met
  useEffect(() => {
    if (!strainId || sourceType !== 'seed' || phase !== 'immature') return;
    setSeedPackagesLoading(true);
    setSeedPackages([]);
    api.getSeedPackages({ strain_id: Number(strainId), active: '1' })
      .then(data => {
        setSeedPackages(data);
        setSeedPackagesLoading(false);
        // Auto-select if preset package_id matches one in the list
        if (presetSeedPackageId && data.some(p => String(p.package_id) === presetSeedPackageId)) {
          setSelectedPackageId(presetSeedPackageId);
        }
      })
      .catch(() => setSeedPackagesLoading(false));
  }, [strainId, sourceType, phase]);

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
        phase, sourceType, strainId, plantCount, plantsPerContainer, startDate,
        expectedHarvestDate, notes, selectedPackageId, seedCountUsed,
        savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [phase, sourceType, strainId, plantCount, plantsPerContainer, startDate,
      expectedHarvestDate, notes, selectedPackageId, seedCountUsed]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Derived seed package calculations
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

  const selectedStrain = strains.find(s => String(s.strain_id) === strainId);
  const metrcBatchName = selectedStrain && startDate
    ? `${selectedStrain.name} | ${formatMetrcDate(startDate)} | ${selectedStrain.type === 'auto' ? 'Auto' : 'Photo'}`
    : null;
  const phaseSubtitle = {
    immature: 'Immature plants — tracked as a group, no individual METRC tags yet.',
    veg:      'Vegetative — plants have individual METRC plant tags.',
    flower:   'Flowering — plants have individual METRC plant tags.',
  }[phase];
  const metrcPhaseLabel = { immature: 'Immature · Germ-01', veg: 'Vegetative', flower: 'Flowering' }[phase];

  function validate() {
    const errors = {};
    if (!strainId) errors.strain = 'Strain is required';
    if (!plantCount || isNaN(Number(plantCount)) || Number(plantCount) <= 0)
      errors.plantCount = 'Plant count must be a positive number';
    if (!plantsPerContainer || isNaN(Number(plantsPerContainer)) || Number(plantsPerContainer) < 1)
      errors.plantsPerContainer = 'Plants per container must be at least 1';
    if (!startDate) errors.startDate = 'Start date is required';
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
        strain_id: Number(strainId),
        plant_count_initial: Number(plantCount),
        plants_per_container: Number(plantsPerContainer),
        sow_date: startDate,
        expected_harvest_date: (phase !== 'immature' && expectedHarvestDate) ? expectedHarvestDate : null,
        metrc_plant_batch_uid: null,
        sub_zone_id: null,
        notes: notes || null,
        source_type: phase === 'immature' ? sourceType : null,
        seed_package_id: (phase === 'immature' && sourceType === 'seed' && selectedPackageId) ? Number(selectedPackageId) : null,
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

  async function handleCreateStrain() {
    if (!newStrainName.trim()) { setStrainErr('Name is required'); return; }
    setSavingStrain(true);
    setStrainErr('');
    try {
      const strain = await api.createStrain({
        name: newStrainName.trim(),
        type: newStrainType,
        genetics: newStrainGenetics.trim() || null,
      });
      setStrains(prev => [...prev, strain]);
      setStrainId(String(strain.strain_id));
      setShowNewStrain(false);
      setNewStrainName('');
      setNewStrainType('auto');
      setNewStrainGenetics('');
    } catch (e) {
      setStrainErr(e.message);
    }
    setSavingStrain(false);
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
      <p className="text-sm text-gray-500 mb-6">{phaseSubtitle}</p>

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
              onClick={() => setPhase(opt.value)}
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
          <label className="block text-sm font-semibold text-gray-800 mb-2">Source Type</label>
          <div className="flex gap-2">
            {[
              { value: 'seed',  label: '🌱 Seed' },
              { value: 'clone', label: '✂️ Clone' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSourceType(opt.value)}
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

      {/* Strain — must come before seed package (packages are strain-filtered) */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Strain <span className="text-red-500">*</span>
        </label>
        {strainsLoading ? (
          <div className="text-sm text-gray-400">Loading strains…</div>
        ) : (
          <>
            <select
              value={strainId}
              onChange={e => {
                setStrainId(e.target.value);
                setSelectedPackageId('');
                setFieldErrors(fe => ({ ...fe, strain: undefined }));
              }}
              className={inputClass}
              style={{ minHeight: '56px' }}
            >
              <option value="">Select a strain…</option>
              {strains.map(s => (
                <option key={s.strain_id} value={s.strain_id}>
                  {s.name} ({s.type === 'auto' ? 'AUTO' : 'PHOTO'})
                </option>
              ))}
            </select>
            {selectedStrain && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  selectedStrain.type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {selectedStrain.type === 'auto' ? 'AUTO' : 'PHOTO'}
                </span>
                {selectedStrain.genetics && <span className="text-xs text-gray-500">{selectedStrain.genetics}</span>}
              </div>
            )}
            {fieldErrors.strain && <p className="text-red-500 text-xs mt-1">{fieldErrors.strain}</p>}

            {!showNewStrain ? (
              <button onClick={() => setShowNewStrain(true)} className="text-xs text-green-700 underline mt-2 hover:text-green-900">
                + Add new strain
              </button>
            ) : (
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">New Strain</p>
                <div className="flex flex-col gap-3">
                  <input type="text" placeholder="Strain name *" value={newStrainName}
                    onChange={e => { setNewStrainName(e.target.value); setStrainErr(''); }}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    {[['auto', 'AUTO', 'bg-green-800 border-green-800'], ['photo', 'PHOTO', 'bg-purple-700 border-purple-700']].map(([val, label, active]) => (
                      <button key={val} onClick={() => setNewStrainType(val)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          newStrainType === val ? `${active} text-white` : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                  <input type="text" placeholder="Genetics (optional)" value={newStrainGenetics}
                    onChange={e => setNewStrainGenetics(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  {strainErr && <p className="text-red-500 text-xs">{strainErr}</p>}
                  <div className="flex gap-2">
                    <button disabled={savingStrain} onClick={handleCreateStrain}
                      className="flex-1 py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 disabled:opacity-50"
                    >
                      {savingStrain ? 'Creating…' : 'Create & Select'}
                    </button>
                    <button onClick={() => { setShowNewStrain(false); setStrainErr(''); }}
                      className="py-2.5 px-3 text-sm text-gray-500 hover:text-gray-700"
                    >Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Seed Package section — immature + seed only */}
      {phase === 'immature' && sourceType === 'seed' && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">Seed Package</label>

          {!strainId ? (
            <div className="text-sm text-gray-400 italic bg-gray-50 rounded-xl px-4 py-3">
              Select a strain above to see available packages
            </div>
          ) : seedPackagesLoading ? (
            <div className="text-sm text-gray-400 italic px-1">Loading packages…</div>
          ) : seedPackages.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-800 mb-2">No seed packages on file for this strain.</p>
              <button
                onClick={() => navigate('/seed-vault?add=1')}
                className="text-sm font-semibold text-amber-700 underline hover:text-amber-900"
              >
                Add a package in the Seed Vault →
              </button>
            </div>
          ) : (
            <>
              {/* Package cards — tap to select */}
              <div className="flex flex-col gap-2 mb-3">
                {seedPackages.map(p => {
                  const isSelected = String(p.package_id) === selectedPackageId;
                  const weightPct = p.weight_g_initial > 0
                    ? Math.min(100, Math.round((p.weight_g_remaining / p.weight_g_initial) * 100))
                    : 0;
                  return (
                    <button
                      key={p.package_id}
                      type="button"
                      onClick={() => { setSelectedPackageId(String(p.package_id)); setSeedCountUsed(''); setSeedWeightGManual(''); }}
                      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                        isSelected
                          ? 'border-green-700 bg-green-50'
                          : 'border-gray-200 bg-white hover:border-green-300'
                      }`}
                      style={{ minHeight: '56px' }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {p.package_name || p.lot_number || `Package #${p.package_id}`}
                        </span>
                        {isSelected && (
                          <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Selected</span>
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
                            : `${p.seed_count_remaining} seeds remaining`}
                        </span>
                      </div>
                      {p.supplier && <p className="text-xs text-gray-400 mt-0.5">{p.supplier}</p>}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => navigate('/seed-vault')}
                className="text-xs text-green-700 underline hover:text-green-900 mb-3 block"
              >
                Manage packages in Seed Vault →
              </button>
            </>
          )}

          {/* Seeds to start — only shown when a package is selected */}
          {selectedPackage && (
            <div className="mt-1">
              {canAutoCalcWeight ? (
                /* Package has per-seed weight — enter count only */
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Seeds to Start
                  </label>
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
                    Per-seed weight: {perSeedWeight.toFixed(3)}g
                    {' '}(from {selectedPackage.weight_g_initial}g ÷ {selectedPackage.seed_count_initial} seeds)
                  </p>
                </div>
              ) : (
                /* No per-seed weight — enter weight directly */
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
                    Package has no seed count — enter weight to deduct directly.
                    Add count to this package in the Seed Vault for auto-calculation.
                  </p>
                </div>
              )}

              {/* Deduction preview */}
              {effectiveWeightG != null && effectiveWeightG > 0 && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">Inventory Deduction</span>
                  </div>
                  <div className="mt-1 text-sm text-green-900 font-semibold">
                    −{effectiveWeightG.toFixed(2)}g from {selectedPackage.package_name || selectedPackage.lot_number || `Package #${selectedPackage.package_id}`}
                  </div>
                  {selectedPackage.weight_g_remaining != null && (
                    <div className="text-xs text-green-700 mt-0.5">
                      {Number(selectedPackage.weight_g_remaining).toFixed(2)}g → {weightAfter >= 0 ? `${weightAfter.toFixed(2)}g` : '0g'} remaining
                      {weightAfter < 0 && <span className="text-red-600 font-semibold ml-1">⚠ Exceeds available weight</span>}
                    </div>
                  )}
                </div>
              )}
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

      {/* Plant Count + Plants per container */}
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
            <p className="text-xs text-gray-400 mt-1">Expected plants (may be less than seeds started)</p>
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
                onClick={() => { setPlantsPerContainer(n); setFieldErrors(fe => ({ ...fe, plantsPerContainer: undefined })); }}
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

      {/* METRC UID note for veg/flower */}
      {phase !== 'immature' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          METRC Plant Batch UID can be added from the batch detail after creation.
        </div>
      )}

      {/* METRC batch name preview */}
      {metrcBatchName && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-6">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">METRC Plant Batch Name</div>
          <div className="font-mono text-sm font-bold text-green-900">{metrcBatchName}</div>
          <div className="text-xs text-green-600 mt-1">Auto-generated · {metrcPhaseLabel}</div>
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
