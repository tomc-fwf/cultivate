import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import { useCurrentConditions, SensorBadge } from '../../hooks/useCurrentConditions.jsx';
import { useOfflineSubmit } from '../../lib/offlineQueue';
import { BatchSummaryCard } from '../../components/BatchCard';

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

  // Recipes
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);

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

  // --- Load all fertigation recipes ---
  useEffect(() => {
    api.getFertigationRecipes()
      .then(data => {
        // Parse applicable_stages JSON strings
        const parsed = data.map(r => ({
          ...r,
          applicable_stages: (() => {
            if (!r.applicable_stages) return null;
            try { return typeof r.applicable_stages === 'string' ? JSON.parse(r.applicable_stages) : r.applicable_stages; }
            catch { return null; }
          })(),
        }));
        setRecipes(parsed);
      })
      .catch(() => {});
  }, []);

  // --- Pre-select recipe when batch changes ---
  useEffect(() => {
    const batch = lockedBatch ?? selectedBatch;
    if (!batch) return;
    const activeId = batch.active_recipe_id;
    if (activeId && recipes.some(r => r.recipe_id === activeId)) {
      setSelectedRecipeId(activeId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedBatch, selectedBatch, recipes]);

  // --- Compute days since sow (calendar days, America/Chicago) ---
  function daysSinceSow(batch) {
    if (!batch?.sow_date) return null;
    const sow = new Date(batch.sow_date.slice(0, 10) + 'T12:00:00');
    const today = new Date();
    const diff = Math.floor((today - sow) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : null;
  }

  // Map batch status to the set of stage values that should match it.
  // Covers both new stage names and legacy values stored before the rename.
  const STATUS_TO_STAGES = {
    'germ':         ['germination', 'germ'],
    'seedling':     ['seedlings', 'seedling'],
    'cult-hoop':    ['hardening', 'cult-hoop'],
    'field-veg':    ['early-veg', 'late-veg', 'field-veg'],
    'field-flower': ['early-flower', 'flower', 'field-flower'],
    'flush':        ['flush'],
  };

  // --- Compute whether a recipe is recommended for current batch ---
  function isRecommended(recipe, batchStatus, days) {
    if (recipe.applicable_stages && recipe.applicable_stages.length > 0) {
      if (!batchStatus) return false;
      const matchable = STATUS_TO_STAGES[batchStatus] ?? [batchStatus];
      if (!recipe.applicable_stages.some(s => matchable.includes(s))) return false;
    }
    if (recipe.day_min != null && days != null && days < recipe.day_min) return false;
    if (recipe.day_max != null && days != null && days > recipe.day_max) return false;
    return true;
  }

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
        if (draft.selectedRecipeId) setSelectedRecipeId(draft.selectedRecipeId);
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
        selectedRecipeId,
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [batchIdParam, volumeGallons, ecMeasured, phMeasured, solutionTempF, ambientTempF, ambientRh, notes, appliedAt, selectedBatchIds, selectedRecipeId]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [saveDraft]);

  // Determine the active batch for display context
  const activeBatch = lockedBatch ?? selectedBatch;

  // In bulk mode, use the first selected batch for reference display
  const bulkRefBatch = bulkMode && selectedBatchIds.length > 0
    ? batches.find(b => b.batch_id === selectedBatchIds[0])
    : null;

  const displayBatch = lockedBatch ?? (bulkMode ? bulkRefBatch : selectedBatch);

  // Derive recipe targets from selected recipe (not from batch's active recipe)
  const selectedRecipe = recipes.find(r => r.recipe_id === selectedRecipeId) ?? null;
  const ecStatus = selectedRecipe ? rangeStatus(ecMeasured, selectedRecipe.ec_target_low, selectedRecipe.ec_target_high) : null;
  const phStatus = selectedRecipe ? rangeStatus(phMeasured, selectedRecipe.ph_target_low, selectedRecipe.ph_target_high) : null;

  // Determine batch_ids for submission
  function getSubmitBatchIds() {
    if (batchIdParam) return [Number(batchIdParam)];
    if (bulkMode) return selectedBatchIds;
    if (selectedBatch) return [selectedBatch.batch_id];
    return [];
  }

  const submitBatchIds = getSubmitBatchIds();

  // Compute days since sow for the current batch context
  const daysForBatch = daysSinceSow(displayBatch);
  const batchStatus = displayBatch?.status ?? null;

  // Partition recipes into recommended + rest
  const recommendedRecipes = recipes.filter(r => isRecommended(r, batchStatus, daysForBatch));
  const otherRecipes = recipes.filter(r => !isRecommended(r, batchStatus, daysForBatch));

  const canSave =
    submitBatchIds.length > 0 &&
    volumeGallons !== '' &&
    ecMeasured !== '' &&
    phMeasured !== '' &&
    selectedRecipeId != null;

  // --- Save ---
  async function handleSave() {
    setSaveError('');

    if (!selectedRecipeId) {
      setSaveError('Select a recipe before saving.');
      return;
    }

    const payload = {
      batch_ids: submitBatchIds,
      recipe_id: selectedRecipeId,
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
                          {batch.name || batch.strain_name}
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

        {/* ── RECIPE PICKER ── */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Recipe
          </label>

          {recipes.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700">
              No recipes available. <button onClick={() => navigate('/recipes/fertigation')} className="underline font-medium">Create a recipe →</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Recommended group */}
              {displayBatch && recommendedRecipes.length > 0 && (
                <>
                  <div className="text-xs text-green-700 font-semibold uppercase tracking-wide px-1 mt-1">
                    Recommended for this stage
                  </div>
                  {recommendedRecipes.map(recipe => (
                    <RecipeCard
                      key={recipe.recipe_id}
                      recipe={recipe}
                      selected={selectedRecipeId === recipe.recipe_id}
                      onSelect={() => setSelectedRecipeId(recipe.recipe_id)}
                      batchIdParam={batchIdParam}
                    />
                  ))}
                  {otherRecipes.length > 0 && (
                    <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide px-1 mt-2">
                      All recipes
                    </div>
                  )}
                </>
              )}

              {/* All recipes (or remaining) */}
              {(displayBatch ? otherRecipes : recipes).map(recipe => (
                <RecipeCard
                  key={recipe.recipe_id}
                  recipe={recipe}
                  selected={selectedRecipeId === recipe.recipe_id}
                  onSelect={() => setSelectedRecipeId(recipe.recipe_id)}
                  batchIdParam={batchIdParam}
                />
              ))}

              {/* If no batch selected yet, show all recipes without grouping */}
              {!displayBatch && recipes.length === 0 && (
                <div className="text-xs text-gray-400 px-1">Select a batch to see recommendations.</div>
              )}
            </div>
          )}

          {/* Selected recipe targets reference */}
          {selectedRecipe && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="flex gap-4 text-xs text-green-700" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {(selectedRecipe.ec_target_low != null || selectedRecipe.ec_target_high != null) && (
                  <span>EC {selectedRecipe.ec_target_low ?? '?'}–{selectedRecipe.ec_target_high ?? '?'} mS/cm</span>
                )}
                {(selectedRecipe.ph_target_low != null || selectedRecipe.ph_target_high != null) && (
                  <span>pH {selectedRecipe.ph_target_low ?? '?'}–{selectedRecipe.ph_target_high ?? '?'}</span>
                )}
              </div>
              <Link
                to={`/recipes/calculator?recipe_type=fertigation&recipe_id=${selectedRecipe.recipe_id}&return_to=fertigation${batchIdParam ? `&batch_id=${batchIdParam}` : ''}`}
                className="text-xs text-green-700 underline font-medium hover:text-green-900 flex-shrink-0"
              >
                Calculate mix →
              </Link>
            </div>
          )}
        </div>

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
              {selectedRecipe?.ec_target_low != null && ecMeasured !== '' && (
                <div className={`text-xs mt-1 font-medium ${ecStatus === 'in' ? 'text-green-700' : 'text-amber-600'}`}>
                  {ecStatus === 'in' ? '✓ In range' : `⚠ Target: ${selectedRecipe.ec_target_low}–${selectedRecipe.ec_target_high}`}
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
              {selectedRecipe?.ph_target_low != null && phMeasured !== '' && (
                <div className={`text-xs mt-1 font-medium ${phStatus === 'in' ? 'text-green-700' : 'text-amber-600'}`}>
                  {phStatus === 'in' ? '✓ In range' : `⚠ Target: ${selectedRecipe.ph_target_low}–${selectedRecipe.ph_target_high}`}
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
  return <BatchSummaryCard batch={batch} />;
}

function RecipeCard({ recipe, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`text-left w-full px-4 py-3 rounded-2xl border-2 transition-colors ${
        selected
          ? 'border-green-600 bg-green-50'
          : 'border-gray-200 bg-white hover:border-green-300'
      }`}
      style={{ minHeight: '56px' }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-0.5">
        <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>
          {recipe.name}
        </span>
        <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-semibold">
          v{recipe.version}
        </span>
        {!!recipe.is_base_recipe && (
          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium border border-gray-200">
            Base
          </span>
        )}
      </div>
      {recipe.usage_notes && (
        <div className="text-xs text-gray-400 mb-1">{recipe.usage_notes}</div>
      )}
      <div className="flex gap-3 text-xs text-gray-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {(recipe.ec_target_low != null || recipe.ec_target_high != null) && (
          <span>EC {recipe.ec_target_low ?? '?'}–{recipe.ec_target_high ?? '?'}</span>
        )}
        {(recipe.ph_target_low != null || recipe.ph_target_high != null) && (
          <span>pH {recipe.ph_target_low ?? '?'}–{recipe.ph_target_high ?? '?'}</span>
        )}
      </div>
    </button>
  );
}
