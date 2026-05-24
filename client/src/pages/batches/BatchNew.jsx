import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_batch_new';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function BatchNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetSeedPackageId = searchParams.get('seed_package_id');

  // Plant type — locked to 'seed' when arriving from a seed card
  const [plantType, setPlantType] = useState('seed');

  // Seed package
  const [seedPackages, setSeedPackages] = useState([]);
  const [seedPackagesLoading, setSeedPackagesLoading] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(presetSeedPackageId ?? '');

  // Core fields
  const [quantityG, setQuantityG] = useState('');
  const [batchName, setBatchName] = useState('');
  const [plantCount, setPlantCount] = useState('');
  const [plantingDate, setPlantingDate] = useState(todayISO());
  const [unpackageDate, setUnpackageDate] = useState(todayISO());
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const autoSaveTimer = useRef(null);

  // Load seed packages
  useEffect(() => {
    if (plantType !== 'seed') return;
    setSeedPackagesLoading(true);
    api.getSeedPackages({ active: '1' })
      .then(data => {
        setSeedPackages(data);
        if (presetSeedPackageId && data.some(p => String(p.package_id) === presetSeedPackageId)) {
          setSelectedPackageId(presetSeedPackageId);
        }
      })
      .finally(() => setSeedPackagesLoading(false));
  }, [plantType]);

  // Restore draft (skip if preset package provided)
  useEffect(() => {
    if (presetSeedPackageId) return;
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (draft) {
        if (draft.plantType) setPlantType(draft.plantType);
        if (draft.plantCount) setPlantCount(draft.plantCount);
        if (draft.plantingDate) setPlantingDate(draft.plantingDate);
        if (draft.unpackageDate) setUnpackageDate(draft.unpackageDate);
        if (draft.batchName) setBatchName(draft.batchName);
        if (draft.quantityG) setQuantityG(draft.quantityG);
        if (draft.notes) setNotes(draft.notes);
        if (draft.selectedPackageId) setSelectedPackageId(draft.selectedPackageId);
      }
    } catch { /* ignore */ }
  }, []);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        plantType, plantCount, plantingDate, unpackageDate,
        batchName, quantityG, notes, selectedPackageId, savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [plantType, plantCount, plantingDate, unpackageDate,
      batchName, quantityG, notes, selectedPackageId]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Derived from selected package
  const selectedPackage = seedPackages.find(p => String(p.package_id) === selectedPackageId) ?? null;

  // Auto-calculate quantity if package has per-seed weight and plant count is filled
  const perSeedWeight = selectedPackage?.seed_count_initial > 0 && selectedPackage?.weight_g_initial != null
    ? selectedPackage.weight_g_initial / selectedPackage.seed_count_initial
    : null;
  const autoQuantity = perSeedWeight != null && plantCount && Number(plantCount) > 0
    ? Number((Number(plantCount) * perSeedWeight).toFixed(3))
    : null;
  const effectiveQuantityG = quantityG ? Number(quantityG) : (autoQuantity ?? null);
  const weightAfter = selectedPackage?.weight_g_remaining != null && effectiveQuantityG != null
    ? Math.max(0, Number(selectedPackage.weight_g_remaining) - effectiveQuantityG)
    : null;
  const weightExceeded = selectedPackage?.weight_g_remaining != null && effectiveQuantityG != null
    && effectiveQuantityG > Number(selectedPackage.weight_g_remaining);

  function validate() {
    const errors = {};
    if (plantType === 'seed' && !selectedPackageId)
      errors.package = 'Select a seed package';
    if (plantType === 'seed' && !effectiveQuantityG)
      errors.quantity = 'Quantity in grams is required';
    if (weightExceeded)
      errors.quantity = 'Quantity exceeds available weight in package';
    if (!batchName.trim())
      errors.batchName = 'Batch name is required';
    if (!plantCount || isNaN(Number(plantCount)) || Number(plantCount) <= 0)
      errors.plantCount = 'Plant count is required';
    if (!plantingDate)
      errors.plantingDate = 'Planting date is required';
    if (plantType === 'seed' && !unpackageDate)
      errors.unpackageDate = 'Unpackage date is required';
    return errors;
  }

  async function handleSave() {
    const errors = validate();
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setSaving(true);
    setErr('');
    try {
      const batch = await api.createBatch({
        name: batchName.trim(),
        strain_id: selectedPackage?.strain_id ?? null,
        plant_count_initial: Number(plantCount),
        plants_per_container: 1,
        sow_date: plantingDate,
        package_open_date: plantType === 'seed' ? (unpackageDate || null) : null,
        source_type: plantType,
        seed_package_id: plantType === 'seed' && selectedPackageId ? Number(selectedPackageId) : null,
        seed_weight_g: plantType === 'seed' ? (effectiveQuantityG ?? null) : null,
        initial_phase: 'immature',
        initial_status: 'germ',
        notes: notes || null,
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setToast({ message: 'Plant batch created', type: 'success' });
      setTimeout(() => navigate(`/batches/${batch.batch_id}`), 1200);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-36">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <button
        onClick={() => navigate(-1)}
        className="text-sm text-green-700 font-medium mb-5 flex items-center gap-1 hover:text-green-900"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Fraunces, serif' }}>
        New Plant Batch
      </h1>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm">{err}</div>
      )}

      {/* ── Plant Type — hidden when arriving from a seed card ───── */}
      {!presetSeedPackageId && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-2">Plant Type</label>
          <div className="flex gap-2">
            {[
              { value: 'seed',  label: '🌱 Seed' },
              { value: 'clone', label: '✂️ Clone' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setPlantType(opt.value); setSelectedPackageId(''); setFieldErrors({}); }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  plantType === opt.value
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

      {/* ── Source Package (seed only) ────────────────────────────── */}
      {plantType === 'seed' && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Source Package <span className="text-red-500">*</span>
          </label>

          {seedPackagesLoading ? (
            <div className="text-sm text-gray-400 italic px-1">Loading…</div>
          ) : seedPackages.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-800 mb-2">No seed packages on file.</p>
              <button
                onClick={() => navigate('/seed-vault?add=1')}
                className="text-sm font-semibold text-amber-700 underline"
              >
                Add one in Seed Vault →
              </button>
            </div>
          ) : selectedPackage && presetSeedPackageId ? (
            /* Pre-selected from seed vault card — confirmed, no picker */
            <div className="border-2 border-green-700 bg-green-50 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {selectedPackage.package_name || selectedPackage.lot_number || `Package #${selectedPackage.package_id}`}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {selectedPackage.strain_name}
                    <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      selectedPackage.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {selectedPackage.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
                    </span>
                    {selectedPackage.seed_sex === 'feminized' && (
                      <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700">♀ FEM</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {Number(selectedPackage.weight_g_remaining).toFixed(2)}g remaining
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedPackageId(''); navigate('/batches/new'); }}
                  className="text-xs text-gray-400 hover:text-gray-700 underline shrink-0 mt-0.5"
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            /* Manual entry — full picker */
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
                    onClick={() => { setSelectedPackageId(String(p.package_id)); setQuantityG(''); setFieldErrors(fe => ({ ...fe, package: undefined })); }}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                      isSelected ? 'border-green-700 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'
                    }`}
                    style={{ minHeight: '56px' }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-900 truncate block">
                          {p.package_name || p.lot_number || `Package #${p.package_id}`}
                        </span>
                        <span className="text-xs text-gray-500">
                          {p.strain_name} · {p.strain_type === 'auto' ? 'Auto' : 'Photo'}
                          {p.seed_sex === 'feminized' ? ' · ♀ Fem' : ''}
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
                        {p.weight_g_remaining != null ? `${Number(p.weight_g_remaining).toFixed(2)}g` : '?g'} remaining
                      </span>
                    </div>
                    {p.metrc_package_id && (
                      <p className="text-[10px] font-mono text-gray-400 mt-1 truncate">
                        {p.metrc_package_id}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {fieldErrors.package && <p className="text-red-500 text-xs mt-1">{fieldErrors.package}</p>}
        </div>
      )}

      {/* ── Quantity in grams ─────────────────────────────────────── */}
      {plantType === 'seed' && selectedPackage && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Quantity in Grams <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            value={quantityG}
            onChange={e => { setQuantityG(e.target.value); setFieldErrors(fe => ({ ...fe, quantity: undefined })); }}
            placeholder={autoQuantity != null ? `${autoQuantity} (auto-calculated)` : 'Enter grams used'}
            className={inputClass}
            style={{ minHeight: '56px' }}
          />
          {autoQuantity != null && !quantityG && (
            <p className="text-xs text-gray-400 mt-1">
              Auto-calculated from plant count × {perSeedWeight.toFixed(3)}g/seed. Override if actual weight differs.
            </p>
          )}
          {effectiveQuantityG != null && selectedPackage.weight_g_remaining != null && (
            <div className={`mt-2 rounded-xl px-3 py-2 text-xs ${weightExceeded ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
              {Number(selectedPackage.weight_g_remaining).toFixed(2)}g → {weightAfter.toFixed(2)}g remaining after deduction
              {weightExceeded && ' · ⚠ Exceeds available'}
            </div>
          )}
          {fieldErrors.quantity && <p className="text-red-500 text-xs mt-1">{fieldErrors.quantity}</p>}
        </div>
      )}

      {/* ── Batch Name ────────────────────────────────────────────── */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Batch Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={batchName}
          onChange={e => { setBatchName(e.target.value); setFieldErrors(fe => ({ ...fe, batchName: undefined })); }}
          placeholder={selectedPackage ? `${selectedPackage.strain_name} — Germ ${plantingDate}` : 'e.g. Z1A NL Auto Spring 2026'}
          className={inputClass}
          style={{ minHeight: '56px' }}
        />
        {fieldErrors.batchName && <p className="text-red-500 text-xs mt-1">{fieldErrors.batchName}</p>}
      </div>

      {/* ── Plant Count ───────────────────────────────────────────── */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Plant Count <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={plantCount}
          onChange={e => { setPlantCount(e.target.value); setFieldErrors(fe => ({ ...fe, plantCount: undefined })); }}
          placeholder="Actual number of seeds planted"
          className={inputClass}
          style={{ minHeight: '56px' }}
        />
        <p className="text-xs text-gray-400 mt-1">Actual seeds planted, not expected yield</p>
        {fieldErrors.plantCount && <p className="text-red-500 text-xs mt-1">{fieldErrors.plantCount}</p>}
      </div>

      {/* ── Planting Date ─────────────────────────────────────────── */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Planting Date <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={plantingDate}
          onChange={e => { setPlantingDate(e.target.value); setFieldErrors(fe => ({ ...fe, plantingDate: undefined })); }}
          className={inputClass}
          style={{ minHeight: '56px' }}
        />
        {fieldErrors.plantingDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.plantingDate}</p>}
      </div>

      {/* ── Unpackage Date (seed only) ────────────────────────────── */}
      {plantType === 'seed' && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Unpackage Date <span className="text-red-500">*</span>
            <span className="ml-1 text-xs font-normal text-gray-400">(when seed package was opened)</span>
          </label>
          <input
            type="date"
            value={unpackageDate}
            onChange={e => { setUnpackageDate(e.target.value); setFieldErrors(fe => ({ ...fe, unpackageDate: undefined })); }}
            className={inputClass}
            style={{ minHeight: '56px' }}
          />
          {fieldErrors.unpackageDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.unpackageDate}</p>}
        </div>
      )}

      {/* ── Notes ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes about this plant batch…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
          rows={2}
        />
      </div>

      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-lg mx-auto">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-green-800 text-white font-semibold rounded-2xl hover:bg-green-900 disabled:opacity-50 transition-colors shadow-lg text-base"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Creating…' : 'Create Plant Batch'}
        </button>
      </div>
    </div>
  );
}
