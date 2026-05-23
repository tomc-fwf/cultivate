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
      for (const sub of loc.sub_locations ?? []) {
        result.push(sub);
      }
    }
  }
  return result;
}

export default function BatchNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const presetLocationId = searchParams.get('location_id');

  // Growth phase + source type
  const [phase, setPhase] = useState('immature');
  const [sourceType, setSourceType] = useState('seed');

  // Seed package state
  const [seedPackages, setSeedPackages] = useState([]);
  const [seedPackagesLoading, setSeedPackagesLoading] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [seedCountUsed, setSeedCountUsed] = useState('');
  const [seedWeightG, setSeedWeightG] = useState('');
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [newPkgLotNumber, setNewPkgLotNumber] = useState('');
  const [newPkgSupplier, setNewPkgSupplier] = useState('');
  const [newPkgReceivedDate, setNewPkgReceivedDate] = useState(todayISO());
  const [newPkgSeedCount, setNewPkgSeedCount] = useState('');
  const [newPkgWeightG, setNewPkgWeightG] = useState('');
  const [newPkgNotes, setNewPkgNotes] = useState('');
  const [savingPackage, setSavingPackage] = useState(false);
  const [pkgErr, setPkgErr] = useState('');

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

    // Restore draft
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (draft) {
        const draftStrainId = draft.strainId ?? '';
        if (draft.phase) setPhase(draft.phase);
        if (draft.sourceType) setSourceType(draft.sourceType);
        if (draftStrainId) setStrainId(draftStrainId);
        if (draft.plantCount) setPlantCount(draft.plantCount);
        if (draft.plantsPerContainer) setPlantsPerContainer(draft.plantsPerContainer);
        if (draft.startDate) setStartDate(draft.startDate);
        if (draft.expectedHarvestDate) setExpectedHarvestDate(draft.expectedHarvestDate);
        if (draft.notes) setNotes(draft.notes);
        if (draft.seedCountUsed) setSeedCountUsed(draft.seedCountUsed);
        if (draft.seedWeightG) setSeedWeightG(draft.seedWeightG);
        // Only restore selectedPackageId if strain hasn't changed (packages are strain-specific)
        if (draft.selectedPackageId && draft.strainId === draftStrainId) {
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
      .then(data => { setSeedPackages(data); setSeedPackagesLoading(false); })
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
      .catch(() => { /* ignore — non-critical */ });
  }, [presetLocationId]);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        phase, sourceType, strainId, plantCount, plantsPerContainer, startDate,
        expectedHarvestDate, notes, selectedPackageId, seedCountUsed, seedWeightG,
        savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [phase, sourceType, strainId, plantCount, plantsPerContainer, startDate,
      expectedHarvestDate, notes, selectedPackageId, seedCountUsed, seedWeightG]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  const selectedStrain = strains.find(s => String(s.strain_id) === strainId);

  const metrcBatchName = selectedStrain && startDate
    ? `${selectedStrain.name} | ${formatMetrcDate(startDate)} | ${selectedStrain.type === 'auto' ? 'Auto' : 'Photo'}`
    : null;

  const phaseSubtitle = {
    immature: 'Immature plants — tracked as a group, no individual METRC tags yet.',
    veg:      'Vegetative — plants have individual METRC plant tags.',
    flower:   'Flowering — plants have individual METRC plant tags.',
  }[phase];

  const metrcPhaseLabel = {
    immature: 'Immature · Germ-01',
    veg:      'Vegetative',
    flower:   'Flowering',
  }[phase];

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
        seed_weight_g: seedWeightG ? Number(seedWeightG) : null,
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

  async function handleCreatePackage() {
    if (!newPkgLotNumber.trim()) { setPkgErr('Lot number is required'); return; }
    if (!newPkgSeedCount || Number(newPkgSeedCount) < 1) { setPkgErr('Seed count is required'); return; }
    setSavingPackage(true);
    setPkgErr('');
    try {
      const pkg = await api.createSeedPackage({
        strain_id: Number(strainId),
        lot_number: newPkgLotNumber.trim(),
        supplier: newPkgSupplier.trim() || null,
        received_date: newPkgReceivedDate || null,
        seed_count_initial: Number(newPkgSeedCount),
        weight_g_initial: newPkgWeightG ? Number(newPkgWeightG) : null,
        notes: newPkgNotes.trim() || null,
      });
      setSeedPackages(prev => [pkg, ...prev]);
      setSelectedPackageId(String(pkg.package_id));
      setShowNewPackage(false);
      setNewPkgLotNumber('');
      setNewPkgSupplier('');
      setNewPkgReceivedDate(todayISO());
      setNewPkgSeedCount('');
      setNewPkgWeightG('');
      setNewPkgNotes('');
    } catch (e) {
      setPkgErr(e.message);
    }
    setSavingPackage(false);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* 1. Back button */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-green-700 font-medium mb-5 flex items-center gap-1 hover:text-green-900"
      >
        ← Back
      </button>

      {/* 2. Page header */}
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        New Plant Group
      </h1>
      <p className="text-sm text-gray-500 mb-6">{phaseSubtitle}</p>

      {/* 3. Starting From callout */}
      {presetLocationName && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-6">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Starting From</div>
          <div className="text-sm font-semibold text-green-900">{presetLocationName}</div>
        </div>
      )}

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{err}</div>
      )}

      {/* 4. Growth Phase chips */}
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

      {/* 5. Source Type chips — immature only */}
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

      {/* 6. Seed Package section — immature + seed only */}
      {phase === 'immature' && sourceType === 'seed' && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-2">
            <label className="text-sm font-semibold text-gray-800">Seed Package</label>
            <span className="text-xs italic text-gray-400">Select the package from the Seed Vault</span>
          </div>

          {/* Package picker */}
          {seedPackagesLoading ? (
            <div className="text-sm text-gray-400 italic mb-3">Loading packages…</div>
          ) : !strainId ? (
            <div className="text-sm text-gray-400 italic mb-3">Select a strain first to see available packages</div>
          ) : seedPackages.length === 0 ? (
            <div className="text-sm text-gray-400 italic mb-3">No packages on file for this strain — add one below</div>
          ) : (
            <select
              value={selectedPackageId}
              onChange={e => setSelectedPackageId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600 mb-3"
              style={{ minHeight: '56px' }}
            >
              <option value="">Select a seed package…</option>
              {seedPackages.map(p => (
                <option key={p.package_id} value={p.package_id}>
                  Lot {p.lot_number} — {p.seed_count_remaining} seeds remaining ({p.received_date ?? 'no date'})
                </option>
              ))}
            </select>
          )}

          {/* Seeds used + weight side by side */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Seeds to Start</label>
              <input
                type="number"
                inputMode="numeric"
                value={seedCountUsed}
                onChange={e => setSeedCountUsed(e.target.value)}
                placeholder="e.g. 50"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                style={{ minHeight: '48px' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Seed Weight (g)</label>
              <input
                type="number"
                inputMode="decimal"
                value={seedWeightG}
                onChange={e => setSeedWeightG(e.target.value)}
                placeholder="e.g. 2.5"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                style={{ minHeight: '48px' }}
              />
            </div>
          </div>

          {/* Add seed package expandable */}
          {!showNewPackage ? (
            <button
              onClick={() => setShowNewPackage(true)}
              className="text-xs text-green-700 underline hover:text-green-900"
            >
              + Add seed package
            </button>
          ) : (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">New Seed Package</p>
              {!strainId ? (
                <p className="text-sm text-gray-400 italic">Select a strain first</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="Lot Number *"
                    value={newPkgLotNumber}
                    onChange={e => { setNewPkgLotNumber(e.target.value); setPkgErr(''); }}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Supplier (optional)"
                    value={newPkgSupplier}
                    onChange={e => setNewPkgSupplier(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Received Date</label>
                    <input
                      type="date"
                      value={newPkgReceivedDate}
                      onChange={e => setNewPkgReceivedDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Seed Count *"
                    value={newPkgSeedCount}
                    onChange={e => { setNewPkgSeedCount(e.target.value); setPkgErr(''); }}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Weight (g) — optional"
                    value={newPkgWeightG}
                    onChange={e => setNewPkgWeightG(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <textarea
                    placeholder="Notes (optional)"
                    value={newPkgNotes}
                    onChange={e => setNewPkgNotes(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={2}
                  />
                  {pkgErr && <p className="text-red-500 text-xs">{pkgErr}</p>}
                  <div className="flex gap-2">
                    <button
                      disabled={savingPackage}
                      onClick={handleCreatePackage}
                      className="flex-1 py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 disabled:opacity-50"
                    >
                      {savingPackage ? 'Saving…' : 'Save Package'}
                    </button>
                    <button
                      onClick={() => { setShowNewPackage(false); setPkgErr(''); }}
                      className="py-2.5 px-3 text-sm text-gray-500 hover:text-gray-700"
                    >Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 7. Strain picker */}
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
              onChange={e => { setStrainId(e.target.value); setFieldErrors(fe => ({ ...fe, strain: undefined })); }}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
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

      {/* 8. Start Date */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Start Date <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={startDate}
          onChange={e => { setStartDate(e.target.value); setFieldErrors(fe => ({ ...fe, startDate: undefined })); }}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          style={{ minHeight: '56px' }}
        />
        {fieldErrors.startDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.startDate}</p>}
      </div>

      {/* 9 + 10. Plant Count + Plants per container */}
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
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            style={{ minHeight: '56px' }}
          />
          {phase === 'immature' && sourceType === 'seed' && (
            <p className="text-xs text-gray-400 mt-1">Number of plants expected (may differ from seeds started)</p>
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
          {fieldErrors.plantsPerContainer && <p className="text-red-500 text-xs mt-1">{fieldErrors.plantsPerContainer}</p>}
        </div>
      </div>

      {/* 11. Expected Harvest Date — non-immature only */}
      {phase !== 'immature' && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-1">Expected Harvest Date</label>
          <p className="text-xs text-gray-500 mb-2">
            Optional — used for PHI calculations. Can be updated later.
          </p>
          <input
            type="date"
            value={expectedHarvestDate}
            onChange={e => setExpectedHarvestDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            style={{ minHeight: '56px' }}
          />
        </div>
      )}

      {/* 12. Notes */}
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

      {/* METRC UID note for veg/flower — added later from batch detail */}
      {phase !== 'immature' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          METRC Plant Batch UID can be added from the batch detail after creation.
        </div>
      )}

      {/* METRC batch name preview — all phases */}
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
