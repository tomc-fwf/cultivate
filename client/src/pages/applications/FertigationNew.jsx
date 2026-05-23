import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import { useCurrentConditions, SensorBadge } from '../../hooks/useCurrentConditions.jsx';
import { useOfflineSubmit } from '../../lib/offlineQueue';

const DRAFT_KEY = 'cv_draft_fertigation';

// Toaster component: green flash toast
function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  const bg = type === 'success' ? 'bg-green-700' : 'bg-red-600';
  return (
    <div className={`fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4`}>
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto`}>
        {type === 'success' ? '✓ ' : '✗ '}{message}
      </div>
    </div>
  );
}

// Small sub-zone chip
function SubZoneChip({ id }) {
  if (!id) return null;
  return (
    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
      {id}
    </span>
  );
}

// EC/pH in-range indicator: returns 'in' | 'out' | null
function rangeStatus(val, low, high) {
  const n = parseFloat(val);
  if (isNaN(n) || low == null || high == null) return null;
  return n >= low && n <= high ? 'in' : 'out';
}

function inputBorderClass(status) {
  if (status === 'in') return 'border-green-400 ring-1 ring-green-300';
  if (status === 'out') return 'border-amber-400 ring-1 ring-amber-300';
  return 'border-gray-300';
}

// Utility: local datetime string (for datetime-local input)
function toLocalDatetimeString(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// STATUS labels for batch cards
const STATUS_LABELS = {
  'germ': 'Germination',
  'seedling': 'Seedlings',
  'cult-hoop': 'Cult-Hoop',
  'field-veg': 'Field — Veg',
  'field-flower': 'Field — Flower',
  'flush': 'Flush',
  'harvest': 'Harvest',
};

const STATUS_CHIP = {
  'germ': 'bg-gray-100 text-gray-700',
  'seedling': 'bg-lime-100 text-lime-700',
  'cult-hoop': 'bg-green-100 text-green-700',
  'field-veg': 'bg-green-100 text-green-800',
  'field-flower': 'bg-purple-100 text-purple-700',
  'flush': 'bg-amber-100 text-amber-700',
  'harvest': 'bg-orange-100 text-orange-700',
};

export default function FertigationNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const batchIdParam = searchParams.get('batch_id');
  const editId = searchParams.get('edit_id'); // future: pre-populate for edit

  // --- State ---
  const [bulkMode, setBulkMode] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  // Selected batch(es)
  const [selectedBatch, setSelectedBatch] = useState(null);       // single mode
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);   // bulk mode

  // Locked batch (when ?batch_id= is provided)
  const [lockedBatch, setLockedBatch] = useState(null);
  const [lockedBatchLoading, setLockedBatchLoading] = useState(false);

  // Form fields
  const [appliedAt, setAppliedAt] = useState(toLocalDatetimeString());
  const [volumeGallons, setVolumeGallons] = useState('');
  const [ecMeasured, setEcMeasured] = useState('');
  const [phMeasured, setPhMeasured] = useState('');
  const [solutionTempF, setSolutionTempF] = useState('');
  const [ambientTempF, setAmbientTempF] = useState('');
  const [ambientRh, setAmbientRh] = useState('');
  const [notes, setNotes] = useState('');

  const [showOptional, setShowOptional] = useState(false);

  // Sensor auto-fill
  const { conditions: sensorConditions } = useCurrentConditions(null, (lockedBatch || selectedBatch)?.sub_zone_id ?? null);
  const [sensorReadingUsed, setSensorReadingUsed] = useState(null);
  const [tempEdited, setTempEdited] = useState(false);
  const [rhEdited, setRhEdited] = useState(false);

  // Auto-fill ambient conditions from sensor when fields are empty
  useEffect(() => {
    if (!sensorConditions || !sensorConditions.temp_f) return;
    if (ambientTempF === '' && ambientRh === '') {
      setAmbientTempF(String(sensorConditions.temp_f.toFixed(1)));
      setAmbientRh(String(Math.round(sensorConditions.humidity_rh)));
      setSensorReadingUsed(sensorConditions);
      setTempEdited(false);
      setRhEdited(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorConditions]);

  // Save state
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false); // green button flash
  const [toast, setToast] = useState(null); // { message, type }

  const { submit, saving, pendingSync } = useOfflineSubmit({
    draftKey: DRAFT_KEY,
    onSuccess: (_, isOffline) => {
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      setToast({ message: isOffline ? 'Saved locally · Pending sync' : 'Saved · Synced', type: isOffline ? 'warning' : 'success' });
      if (!isOffline) {
        setTimeout(() => {
          if (batchIdParam) navigate(`/batches/${batchIdParam}`);
          else navigate('/applications/fertigation');
        }, 1200);
      }
    },
    onError: (e) => setSaveError(e.message || 'Failed to save. Please try again.'),
  });

  const autoSaveTimer = useRef(null);

  // --- Load active batches (for picker when no batch_id param) ---
  useEffect(() => {
    if (batchIdParam) return; // locked mode — don't need list
    setBatchesLoading(true);
    api.getBatches({ status: 'active' })
      .then(data => {
        // Filter out closed/harvest batches
        const eligible = data.filter(b => b.status !== 'closed' && b.status !== 'harvest');
        setBatches(eligible);
        setBatchesLoading(false);
      })
      .catch(() => { setBatchesLoading(false); });
  }, [batchIdParam]);

  // --- Load locked batch when ?batch_id= param is present ---
  useEffect(() => {
    if (!batchIdParam) return;
    setLockedBatchLoading(true);
    api.getBatch(batchIdParam)
      .then(b => {
        setLockedBatch(b);
        setLockedBatchLoading(false);
        // Pre-fill from batch's active recipe EC/pH targets (useful context)
      })
      .catch(() => { setLockedBatchLoading(false); });
  }, [batchIdParam]);

  // --- Restore draft from localStorage ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      // Only restore if draft matches current batch context
      const draftBatchId = draft.batchIdParam;
      if (draftBatchId === batchIdParam) {
        if (draft.volumeGallons) setVolumeGallons(draft.volumeGallons);
        if (draft.ecMeasured) setEcMeasured(draft.ecMeasured);
        if (draft.phMeasured) setPhMeasured(draft.phMeasured);
        if (draft.solutionTempF) setSolutionTempF(draft.solutionTempF);
        if (draft.ambientTempF) setAmbientTempF(draft.ambientTempF);
        if (draft.ambientRh) setAmbientRh(draft.ambientRh);
        if (draft.notes) setNotes(draft.notes);
        if (draft.appliedAt) setAppliedAt(draft.appliedAt);
        if (draft.selectedBatchIds) setSelectedBatchIds(draft.selectedBatchIds);
      }
    } catch {
      // ignore
    }
  }, [batchIdParam]);

  // --- Consume volume from Mix Calculator (sessionStorage handoff) ---
  useEffect(() => {
    try {
      const calcVol = sessionStorage.getItem('cv_calc_volume_gal');
      const calcBatch = sessionStorage.getItem('cv_calc_volume_batch_id');
      if (calcVol) {
        if (!batchIdParam || calcBatch === batchIdParam || calcBatch === String(batchIdParam)) {
          setVolumeGallons(parseFloat(calcVol).toFixed(1));
        }
        sessionStorage.removeItem('cv_calc_volume_gal');
        sessionStorage.removeItem('cv_calc_volume_batch_id');
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Auto-save draft ---
  const saveDraft = useCallback(() => {
    try {
      const draft = {
        batchIdParam,
        volumeGallons,
        ecMeasured,
        phMeasured,
        solutionTempF,
        ambientTempF,
        ambientRh,
        notes,
        appliedAt,
        selectedBatchIds,
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [batchIdParam, volumeGallons, ecMeasured, phMeasured, solutionTempF, ambientTempF, ambientRh, notes, appliedAt, selectedBatchIds]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [saveDraft]);

  // Determine the active batch for recipe display
  const activeBatch = lockedBatch ?? selectedBatch;
  const activeRecipe = activeBatch ? {
    id: activeBatch.active_recipe_id,
    name: activeBatch.active_recipe_name,
    version: activeBatch.active_recipe_version,
    ecLow: activeBatch.active_recipe_ec_low,
    ecHigh: activeBatch.active_recipe_ec_high,
    phLow: activeBatch.active_recipe_ph_low,
    phHigh: activeBatch.active_recipe_ph_high,
  } : null;

  const ecStatus = activeRecipe ? rangeStatus(ecMeasured, activeRecipe.ecLow, activeRecipe.ecHigh) : null;
  const phStatus = activeRecipe ? rangeStatus(phMeasured, activeRecipe.phLow, activeRecipe.phHigh) : null;

  // Determine batch_ids for submission
  function getSubmitBatchIds() {
    if (batchIdParam) return [Number(batchIdParam)];
    if (bulkMode) return selectedBatchIds;
    if (selectedBatch) return [selectedBatch.batch_id];
    return [];
  }

  const submitBatchIds = getSubmitBatchIds();
  const hasRecipe = activeBatch?.active_recipe_id != null;

  // In bulk mode, use the first selected batch's recipe for reference display
  const bulkRefBatch = bulkMode && selectedBatchIds.length > 0
    ? batches.find(b => b.batch_id === selectedBatchIds[0])
    : null;

  const displayBatch = lockedBatch ?? (bulkMode ? bulkRefBatch : selectedBatch);

  const canSave =
    submitBatchIds.length > 0 &&
    volumeGallons !== '' &&
    ecMeasured !== '' &&
    phMeasured !== '' &&
    (lockedBatch?.active_recipe_id || (displayBatch?.active_recipe_id));

  // --- Save ---
  async function handleSave() {
    setSaveError('');

    const recipeId = displayBatch?.active_recipe_id;
    if (!recipeId) {
      setSaveError('No recipe assigned to this batch. Assign a recipe first.');
      return;
    }

    const payload = {
      batch_ids: submitBatchIds,
      recipe_id: recipeId,
      applied_at: new Date(appliedAt).toISOString(),
      volume_gallons: parseFloat(volumeGallons),
      ec_measured: parseFloat(ecMeasured),
      ph_measured: parseFloat(phMeasured),
      solution_temp_f: solutionTempF !== '' ? parseFloat(solutionTempF) : null,
      ambient_temp_f: ambientTempF !== '' ? parseFloat(ambientTempF) : null,
      ambient_rh: ambientRh !== '' ? parseFloat(ambientRh) : null,
      notes: notes || null,
    };

    await submit(
      () => api.createFertigationApplication(payload),
      { endpoint: '/api/applications/fertigation', payload, entity_type: 'fertigation' }
    );
  }

  // --- Render ---
  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-green-700 font-medium text-sm hover:text-green-900 flex items-center gap-1"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1" style={{ fontFamily: 'Fraunces, serif' }}>
          Log Fertigation
        </h1>

        {/* Bulk mode toggle */}
        {!batchIdParam && (
          <button
            onClick={() => {
              setBulkMode(m => !m);
              setSelectedBatch(null);
              setSelectedBatchIds([]);
            }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              bulkMode
                ? 'bg-green-800 text-white border-green-800'
                : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
            }`}
            style={{ minHeight: '36px' }}
          >
            {bulkMode ? 'Multi ✓' : 'Multi'}
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-36">

        {/* ── BATCH SECTION ── */}
        {batchIdParam ? (
          // Locked batch
          <div className="mb-4">
            {lockedBatchLoading ? (
              <div className="h-20 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ) : lockedBatch ? (
              <LockedBatchCard batch={lockedBatch} />
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                Batch not found
              </div>
            )}
          </div>
        ) : (
          // Batch picker
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {bulkMode ? 'Select Batches' : 'Select Batch'}
            </label>
            {batchesLoading ? (
              <div className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ) : batches.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                No active batches found.{' '}
                <button
                  onClick={() => navigate('/batches/new')}
                  className="underline font-medium"
                >
                  Create a batch →
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {batches.map(batch => {
                  const isSelected = bulkMode
                    ? selectedBatchIds.includes(batch.batch_id)
                    : selectedBatch?.batch_id === batch.batch_id;

                  return (
                    <button
                      key={batch.batch_id}
                      onClick={() => {
                        if (bulkMode) {
                          setSelectedBatchIds(ids =>
                            ids.includes(batch.batch_id)
                              ? ids.filter(id => id !== batch.batch_id)
                              : [...ids, batch.batch_id]
                          );
                        } else {
                          setSelectedBatch(batch);
                        }
                      }}
                      className={`text-left w-full px-4 py-3 rounded-2xl border-2 transition-colors ${
                        isSelected
                          ? 'border-green-600 bg-green-50'
                          : 'border-gray-200 bg-white hover:border-green-300'
                      }`}
                      style={{ minHeight: '64px' }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {bulkMode && (
                          <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-green-800 border-green-800 text-white' : 'border-gray-300'
                          }`}>
                            {isSelected && <span className="text-xs leading-none">✓</span>}
                          </span>
                        )}
                        <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                          {batch.strain_name}
                        </span>
                        <SubZoneChip id={batch.sub_zone_id} />
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[batch.status] ?? batch.status}
                        </span>
                        {batch.active_recipe_name && (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            {batch.active_recipe_name}
                          </span>
                        )}
                      </div>
                      {!batch.active_recipe_id && (
                        <div className="text-xs text-amber-600 mt-1">No recipe assigned</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── RECIPE DISPLAY ── */}
        {displayBatch && (
          <div className="mb-4">
            {displayBatch.active_recipe_id ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>
                      {displayBatch.active_recipe_name}
                    </span>
                    <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-semibold">
                      v{displayBatch.active_recipe_version}
                    </span>
                  </div>
                  {displayBatch.active_recipe_id && (
                    <Link
                      to={`/recipes/calculator?recipe_type=fertigation&recipe_id=${displayBatch.active_recipe_id}&return_to=fertigation${batchIdParam ? `&batch_id=${batchIdParam}` : ''}`}
                      className="text-xs text-green-700 underline font-medium hover:text-green-900 flex-shrink-0"
                    >
                      Calculate mix →
                    </Link>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-green-700" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {(displayBatch.active_recipe_ec_low != null || displayBatch.active_recipe_ec_high != null) && (
                    <span>EC {displayBatch.active_recipe_ec_low ?? '?'}–{displayBatch.active_recipe_ec_high ?? '?'} mS/cm</span>
                  )}
                  {(displayBatch.active_recipe_ph_low != null || displayBatch.active_recipe_ph_high != null) && (
                    <span>pH {displayBatch.active_recipe_ph_low ?? '?'}–{displayBatch.active_recipe_ph_high ?? '?'}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-amber-700 font-medium">No recipe assigned to this batch</span>
                {!batchIdParam ? null : (
                  <button
                    onClick={() => navigate(`/batches/${batchIdParam}`)}
                    className="text-xs text-amber-700 font-semibold underline hover:text-amber-900"
                  >
                    Assign Recipe →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── MEASUREMENT FIELDS ── */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Measurements
          </label>

          {/* Volume */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1 font-medium">Volume (gal)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={volumeGallons}
              onChange={e => setVolumeGallons(e.target.value)}
              className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-colors"
              style={{ minHeight: '56px' }}
            />
          </div>

          {/* EC + pH side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">EC (mS/cm)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={ecMeasured}
                onChange={e => setEcMeasured(e.target.value)}
                className={`w-full border rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-colors ${inputBorderClass(ecStatus)}`}
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
              {activeRecipe?.ecLow != null && ecMeasured !== '' && (
                <div className={`text-xs mt-1 font-medium ${ecStatus === 'in' ? 'text-green-700' : 'text-amber-600'}`}>
                  {ecStatus === 'in' ? '✓ In range' : `⚠ Target: ${activeRecipe.ecLow}–${activeRecipe.ecHigh}`}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">pH</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="0.0"
                value={phMeasured}
                onChange={e => setPhMeasured(e.target.value)}
                className={`w-full border rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-colors ${inputBorderClass(phStatus)}`}
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
              {activeRecipe?.phLow != null && phMeasured !== '' && (
                <div className={`text-xs mt-1 font-medium ${phStatus === 'in' ? 'text-green-700' : 'text-amber-600'}`}>
                  {phStatus === 'in' ? '✓ In range' : `⚠ Target: ${activeRecipe.phLow}–${activeRecipe.phHigh}`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── OPTIONAL FIELDS ── */}
        <div className="mb-4">
          <button
            onClick={() => setShowOptional(s => !s)}
            className="flex items-center gap-2 text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors"
            style={{ minHeight: '44px' }}
          >
            <span className={`transition-transform ${showOptional ? 'rotate-90' : ''}`}>▶</span>
            {showOptional ? 'Hide optional fields' : 'Show optional fields'}
          </button>

          {showOptional && (
            <div className="mt-3 flex flex-col gap-3">
              {/* Applied at */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Applied at</label>
                <input
                  type="datetime-local"
                  value={appliedAt}
                  onChange={e => setAppliedAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  style={{ minHeight: '56px' }}
                />
              </div>

              {/* Temps row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Solution temp (°F)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="—"
                    value={solutionTempF}
                    onChange={e => setSolutionTempF(e.target.value)}
                    className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                    style={{ minHeight: '56px' }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Ambient temp (°F)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="—"
                    value={ambientTempF}
                    onChange={e => { setAmbientTempF(e.target.value); setTempEdited(true); }}
                    className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                    style={{ minHeight: '56px' }}
                  />
                  {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={tempEdited} />}
                </div>
              </div>

              {/* RH */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">RH (%)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="—"
                  value={ambientRh}
                  onChange={e => { setAmbientRh(e.target.value); setRhEdited(true); }}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  style={{ minHeight: '56px' }}
                />
                {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={rhEdited} />}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Notes</label>
                <textarea
                  placeholder='e.g. "meter-error" if meter malfunction'
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        {/* Applicator info (read-only) */}
        {user && (
          <div className="text-xs text-gray-400 mb-2">
            Applicator: <span className="font-medium text-gray-600">{user.name}</span>
          </div>
        )}

        {/* Pending sync indicator */}
        {pendingSync && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700 font-medium mb-3">
            ⏱ Saved locally — will sync when connection is restored
          </div>
        )}

        {/* Save error (shown inline above button, not just in button area) */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-3">
            {saveError}
          </div>
        )}
      </div>

      {/* ── FIXED SAVE BUTTON — THUMB ZONE ── */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={`w-full font-bold rounded-2xl text-white shadow-lg transition-all active:scale-[0.98] ${
              saveFlash
                ? 'bg-green-500 scale-[0.99]'
                : canSave && !saving
                  ? 'bg-green-800 hover:bg-green-900 active:bg-green-950'
                  : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ minHeight: '64px', fontSize: '1.05rem' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Saving…
              </span>
            ) : bulkMode && selectedBatchIds.length > 1 ? (
              `Save to ${selectedBatchIds.length} Batches`
            ) : (
              'Save Application'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function LockedBatchCard({ batch }) {
  return (
    <div className="bg-white border-2 border-green-300 rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Fraunces, serif' }}>
          {batch.strain_name}
        </span>
        {batch.sub_zone_id && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {batch.sub_zone_id}
          </span>
        )}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
      </div>
      <div className="text-xs text-gray-500">
        Day {batch.days_in_stage ?? 0} · {batch.plant_count_current ?? batch.plant_count_initial} plants
      </div>
    </div>
  );
}
