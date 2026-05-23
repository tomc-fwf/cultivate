import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import { useOfflineSubmit } from '../../lib/offlineQueue';

const DRAFT_KEY_PREFIX = 'cv_draft_final_harvest';

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : type === 'warning' ? 'bg-amber-600' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto`}>
        {type === 'success' ? '✓ ' : '✗ '}{message}
      </div>
    </div>
  );
}

const PRODUCT_TYPES = [
  { value: 'flower',       label: 'Flower' },
  { value: 'larf',         label: 'Larf' },
  { value: 'popcorn',      label: 'Popcorn' },
  { value: 'trim_product', label: 'Trim Product' },
  { value: 'other',        label: 'Other' },
];
const WEIGHT_UNITS = ['g', 'oz', 'lb'];

export default function FinalHarvestForm() {
  const { batchId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const harvestBatchId = searchParams.get('harvest_batch_id');
  const assignmentIdParam = searchParams.get('assignment_id');
  const containerIdParam = searchParams.get('container_id');

  // Context loading
  const [batch, setBatch] = useState(null);
  // assignment: resolved once — either from single-plant, URL pre-selection, or user selection
  const [assignment, setAssignment] = useState(null);
  // activeAssignments: all active assignments for the container (populated after load)
  const [activeAssignments, setActiveAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState('');

  // Tag verification step
  const [tagConfirmed, setTagConfirmed] = useState(false);

  // Form fields
  const [productType, setProductType] = useState('flower');
  const [wetWeight, setWetWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('g');
  const [notes, setNotes] = useState('');

  // Save state
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [toast, setToast] = useState(null);
  const autoSaveTimer = useRef(null);

  // Draft key uses the resolved assignment ID; falls back to URL param while in selection step
  const draftKey = `${DRAFT_KEY_PREFIX}_${batchId}_${assignment?.assignment_id ?? assignmentIdParam}`;

  const { submit, saving, pendingSync } = useOfflineSubmit({
    draftKey,
    onSuccess: (_, isOffline) => {
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      if (isOffline) {
        setToast({ message: 'Network lost — record saved locally. Do NOT retry until you verify online.', type: 'warning' });
        // pendingSync stays true — prominent banner shown below
      } else {
        setToast({ message: 'Plant harvested. Container is now in teardown.', type: 'success' });
        setTimeout(() => navigate(`/harvest/${batchId}`), 2000);
      }
    },
    onError: (e) => setSaveError(e.message || 'Failed to record final harvest.'),
  });

  // Restore draft (only product/weight fields — tag verification is intentionally not persisted)
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
      if (!draft) return;
      if (draft.productType) setProductType(draft.productType);
      if (draft.wetWeight) setWetWeight(draft.wetWeight);
      if (draft.weightUnit) setWeightUnit(draft.weightUnit);
      if (draft.notes) setNotes(draft.notes);
    } catch { /* ignore */ }
  }, [draftKey]);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ productType, wetWeight, weightUnit, notes, savedAt: Date.now() }));
    } catch { /* ignore */ }
  }, [draftKey, productType, wetWeight, weightUnit, notes]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Load context
  useEffect(() => {
    if (!batchId || !harvestBatchId || (!assignmentIdParam && !containerIdParam)) {
      setContextError('Missing required parameters.');
      setContextLoading(false);
      return;
    }
    setContextLoading(true);
    Promise.all([api.getBatch(batchId), api.getHarvestStatus(batchId)])
      .then(([batchData, harvestStatus]) => {
        setBatch(batchData);

        // Determine the container_id we're operating on
        let containerId;
        if (assignmentIdParam) {
          const found = harvestStatus.plant_assignments?.find(
            a => String(a.assignment_id) === assignmentIdParam && a.unassigned_at === null
          );
          if (!found) {
            setContextError('Plant assignment not found or already unassigned.');
            setContextLoading(false);
            return;
          }
          containerId = found.container_id;
        } else {
          containerId = containerIdParam;
        }

        // All active assignments for this container
        const allActive = (harvestStatus.plant_assignments ?? []).filter(
          a => a.container_id === containerId && a.unassigned_at === null
        );

        if (allActive.length === 0) {
          setContextError('No active plant assignments found for this container.');
          setContextLoading(false);
          return;
        }

        setActiveAssignments(allActive);

        if (allActive.length === 1) {
          // Step 1: single plant — proceed as today, no UI change
          setAssignment(allActive[0]);
        } else if (assignmentIdParam) {
          // Step 3: assignment_id in URL AND matches an active assignment — pre-select and skip selection step
          const matched = allActive.find(a => String(a.assignment_id) === assignmentIdParam);
          if (matched) {
            setAssignment(matched);
          }
          // else: assignment_id doesn't match any active → assignment stays null, show selection step
        }
        // else: no assignment_id, multiple active plants → assignment stays null, show selection step

        setContextLoading(false);
      })
      .catch(e => { setContextError(e.message); setContextLoading(false); });
  }, [batchId, harvestBatchId, assignmentIdParam, containerIdParam]);

  // Selection step: shown when loaded, no error, assignment not resolved, multiple active plants
  const showSelectionStep = !contextLoading && !contextError && assignment === null && activeAssignments.length > 1;

  function handleSelectionContinue() {
    const selected = activeAssignments.find(a => a.assignment_id === selectedAssignmentId);
    if (selected) {
      setTagConfirmed(false); // fresh verification for the chosen plant
      setAssignment(selected);
    }
  }

  // Container for display — available even during selection step
  const containerDisplay = assignment?.container_id ?? activeAssignments[0]?.container_id ?? containerIdParam;

  const tagLast4 = assignment?.metrc_plant_tag ? assignment.metrc_plant_tag.slice(-4) : null;
  const hasTag = Boolean(assignment?.metrc_plant_tag);

  // Notes are required when plant has no tag
  const notesRequired = !hasTag;
  const canSave = productType !== '' && wetWeight !== '' && Number(wetWeight) > 0
    && tagConfirmed && (!notesRequired || notes.trim() !== '');

  async function handleSave() {
    setSaveError('');
    if (!assignment) return;
    const payload = {
      plant_assignment_id: assignment.assignment_id,
      event_type: 'final_harvest',
      product_type: productType,
      wet_weight: parseFloat(wetWeight),
      weight_unit: weightUnit,
      notes: notes.trim() || null,
    };
    await submit(
      () => api.recordHarvestEvent(Number(harvestBatchId), payload),
      { endpoint: `/api/harvest/batches/${harvestBatchId}/events`, payload, entity_type: 'final_harvest' }
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/harvest/${batchId}`)}
          className="text-green-700 font-medium text-sm hover:text-green-900"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1" style={{ fontFamily: 'Fraunces, serif' }}>
          Final Harvest
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-36 flex flex-col gap-4">

        {/* Context card */}
        {contextLoading ? (
          <div className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />
        ) : contextError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{contextError}</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Plant Context (locked)</div>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="text-xs text-gray-500">Batch</div>
                <div className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{batch?.strain_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Container</div>
                <div className="font-mono font-bold text-gray-800">{containerDisplay}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── PLANT SELECTION STEP — shown for multi-plant containers when no assignment pre-specified ── */}
        {showSelectionStep && (
          <div className="bg-white border-2 border-amber-300 rounded-2xl p-5">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Select Plant to Harvest</div>
            <div className="text-sm text-gray-600 mb-4">
              This container has <strong>{activeAssignments.length}</strong> active plants.
              Select the plant you are cutting now.
            </div>
            <div className="flex flex-col gap-3 mb-5">
              {activeAssignments.map(a => {
                const last4 = a.metrc_plant_tag ? a.metrc_plant_tag.slice(-4) : null;
                const isSelected = selectedAssignmentId === a.assignment_id;
                const placedDate = a.placed_at
                  ? new Date(a.placed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : null;
                return (
                  <button
                    key={a.assignment_id}
                    onClick={() => setSelectedAssignmentId(a.assignment_id)}
                    className={`w-full text-left px-4 py-4 rounded-2xl border-2 transition-colors relative ${
                      isSelected
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-green-300'
                    }`}
                    style={{ minHeight: '72px' }}
                  >
                    {isSelected && (
                      <span className="absolute top-3 right-4 text-green-600 text-lg font-bold">✓</span>
                    )}
                    {last4 ? (
                      <>
                        <div className="text-3xl font-bold tracking-widest text-gray-900 leading-tight" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          …{last4}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {a.metrc_plant_tag}
                        </div>
                      </>
                    ) : (
                      <div className="text-base font-semibold text-amber-700">Untagged</div>
                    )}
                    {placedDate && (
                      <div className="text-xs text-gray-400 mt-1">Placed {placedDate}</div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleSelectionContinue}
              disabled={!selectedAssignmentId}
              className={`w-full py-4 font-bold rounded-2xl text-white transition-colors ${
                selectedAssignmentId
                  ? 'bg-green-800 hover:bg-green-900'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
              style={{ minHeight: '64px' }}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── TAG VERIFICATION STEP — shown once assignment is resolved ── */}
        {!contextLoading && !contextError && assignment !== null && (
          <div className={`rounded-2xl p-5 border-2 ${tagConfirmed ? 'border-green-400 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Step 1 — Tag Verification</div>

            {hasTag ? (
              <>
                <div className="text-center mb-4">
                  <div className="text-xs text-gray-500 mb-1">Physical tag on this plant must end with:</div>
                  <div className="text-5xl font-bold text-red-800 tracking-widest" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    …{tagLast4}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Look at the physical METRC tag on the plant</div>
                </div>

                {!tagConfirmed ? (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setTagConfirmed(true)}
                      className="w-full py-4 bg-green-800 text-white font-bold rounded-2xl hover:bg-green-900 transition-colors shadow-sm"
                      style={{ minHeight: '64px' }}
                    >
                      ✓ I confirm the physical tag matches …{tagLast4}
                    </button>
                    <button
                      onClick={() => navigate(`/batches/${batchId}`)}
                      className="w-full py-3 border-2 border-red-300 text-red-700 font-semibold rounded-2xl hover:bg-red-100 transition-colors text-sm"
                      style={{ minHeight: '56px' }}
                    >
                      ✗ Mismatch — investigate (go back)
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
                    <span className="text-2xl">✓</span>
                    Tag confirmed — …{tagLast4}
                    <button onClick={() => setTagConfirmed(false)} className="ml-auto text-xs text-green-600 underline">
                      Undo
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-3 mb-3">
                <div className="font-semibold text-amber-900 text-sm mb-1">⚠ No METRC tag assigned to this plant</div>
                <div className="text-xs text-amber-700">Record who verified this plant's identity in the Notes field below.</div>
              </div>
            )}

            {(!hasTag || tagConfirmed) && !tagConfirmed && (
              <button
                onClick={() => setTagConfirmed(true)}
                className="w-full py-3 bg-amber-600 text-white font-bold rounded-2xl hover:bg-amber-700 transition-colors"
                style={{ minHeight: '56px' }}
              >
                I acknowledge — plant has no METRC tag, proceeding
              </button>
            )}
          </div>
        )}

        {/* ── FORM FIELDS — only shown after tag confirmation ── */}
        {tagConfirmed && (
          <>
            {/* Warning */}
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-800">
              <strong>Final Harvest</strong> — this will cut the plant, unassign it, and transition the container to teardown. This cannot be undone.
            </div>

            {/* Product type */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Product Type <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRODUCT_TYPES.map(pt => (
                  <button
                    key={pt.value}
                    onClick={() => setProductType(pt.value)}
                    className={`py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                      productType === pt.value
                        ? 'border-red-600 bg-red-50 text-red-900'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-red-300'
                    }`}
                    style={{ minHeight: '56px' }}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Wet weight */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Wet Weight <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="0.0"
                  value={wetWeight}
                  onChange={e => setWetWeight(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-2xl px-4 text-3xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  style={{ minHeight: '72px', fontFamily: 'JetBrains Mono, monospace' }}
                />
                <div className="flex flex-col gap-1.5">
                  {WEIGHT_UNITS.map(u => (
                    <button
                      key={u}
                      onClick={() => setWeightUnit(u)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        weightUnit === u
                          ? 'border-red-600 bg-red-50 text-red-900'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-red-300'
                      }`}
                      style={{ minHeight: '48px' }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Notes {notesRequired ? <span className="text-red-400">* (required — no tag assigned)</span> : '(optional)'}
              </label>
              <textarea
                placeholder={notesRequired ? 'Required: describe how plant identity was verified…' : 'Any observations about this harvest…'}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                rows={3}
              />
            </div>

            {user && (
              <div className="text-xs text-gray-400">Applicator: <span className="font-medium text-gray-600">{user.name}</span></div>
            )}

            {pendingSync && (
              <div className="bg-amber-100 border-2 border-amber-400 rounded-xl px-4 py-3 text-sm text-amber-900 font-semibold">
                ⚠ Final harvest saved locally — PENDING SYNC. Do NOT re-enter this harvest. Verify it appears in the harvest log once you are back online.
              </div>
            )}

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{saveError}</div>
            )}
          </>
        )}
      </div>

      {/* Fixed save button — only shown after tag confirmed */}
      {tagConfirmed && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className={`w-full font-bold rounded-2xl text-white shadow-lg transition-all active:scale-[0.98] ${
                saveFlash
                  ? 'bg-red-400 scale-[0.99]'
                  : canSave && !saving
                    ? 'bg-red-700 hover:bg-red-800 active:bg-red-900'
                    : 'bg-gray-300 cursor-not-allowed'
              }`}
              style={{ minHeight: '64px', fontSize: '1.05rem' }}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Recording Final Harvest…
                </span>
              ) : 'Record Final Harvest — Cut Plant'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
