import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

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
  const assignmentId = searchParams.get('assignment_id');

  // Context loading
  const [batch, setBatch] = useState(null);
  const [assignment, setAssignment] = useState(null);
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [toast, setToast] = useState(null);

  // Load context
  useEffect(() => {
    if (!batchId || !harvestBatchId || !assignmentId) {
      setContextError('Missing required parameters.');
      setContextLoading(false);
      return;
    }
    setContextLoading(true);
    Promise.all([api.getBatch(batchId), api.getHarvestStatus(batchId)])
      .then(([batchData, harvestStatus]) => {
        setBatch(batchData);
        const found = harvestStatus.plant_assignments?.find(
          a => String(a.assignment_id) === assignmentId && a.unassigned_at === null
        );
        if (!found) {
          setContextError('Plant assignment not found or already unassigned.');
        } else {
          setAssignment(found);
        }
        setContextLoading(false);
      })
      .catch(e => { setContextError(e.message); setContextLoading(false); });
  }, [batchId, harvestBatchId, assignmentId]);

  const tagLast4 = assignment?.metrc_plant_tag ? assignment.metrc_plant_tag.slice(-4) : null;
  const hasTag = Boolean(assignment?.metrc_plant_tag);

  // Notes are required when plant has no tag
  const notesRequired = !hasTag;
  const canSave = productType !== '' && wetWeight !== '' && Number(wetWeight) > 0
    && tagConfirmed && (!notesRequired || notes.trim() !== '');

  async function handleSave() {
    setSaveError('');
    setSaving(true);
    try {
      await api.recordHarvestEvent(Number(harvestBatchId), {
        plant_assignment_id: Number(assignmentId),
        event_type: 'final_harvest',
        product_type: productType,
        wet_weight: parseFloat(wetWeight),
        weight_unit: weightUnit,
        notes: notes.trim() || null,
      });

      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      setToast({ message: 'Plant harvested. Container is now in teardown.', type: 'success' });
      setTimeout(() => navigate(`/harvest/${batchId}`), 2000);
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || 'Failed to record final harvest.');
    }
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
                <div className="font-mono font-bold text-gray-800">{assignment?.container_id}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAG VERIFICATION STEP — must complete before form appears ── */}
        {!contextLoading && !contextError && (
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
                  autoFocus
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
                      style={{ minHeight: '32px' }}
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
