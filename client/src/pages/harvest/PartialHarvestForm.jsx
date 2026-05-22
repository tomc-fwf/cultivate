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

export default function PartialHarvestForm() {
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

  // Load context: batch + harvest status to find assignment
  useEffect(() => {
    if (!batchId || !harvestBatchId || !assignmentId) {
      setContextError('Missing required parameters (batch, harvest batch, or assignment).');
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

  const canSave = productType !== '' && wetWeight !== '' && Number(wetWeight) > 0;

  async function handleSave() {
    setSaveError('');
    setSaving(true);
    try {
      await api.recordHarvestEvent(Number(harvestBatchId), {
        plant_assignment_id: Number(assignmentId),
        event_type: 'partial_harvest',
        product_type: productType,
        wet_weight: parseFloat(wetWeight),
        weight_unit: weightUnit,
        notes: notes.trim() || null,
      });

      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      setToast({ message: 'Partial harvest recorded', type: 'success' });
      setTimeout(() => navigate(`/harvest/${batchId}`), 1400);
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || 'Failed to record harvest event.');
    }
  }

  const tagLast4 = assignment?.metrc_plant_tag ? assignment.metrc_plant_tag.slice(-4) : null;

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
          Partial Harvest
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-36 flex flex-col gap-4">

        {/* Note: no "manicure" terminology */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-800">
          <strong>Partial Harvest</strong> — plant remains alive. Records product wet weight against the Partial Harvest Batch (MB).
        </div>

        {/* Context card */}
        {contextLoading ? (
          <div className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />
        ) : contextError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{contextError}</div>
        ) : (
          <div className="bg-white border-2 border-purple-200 rounded-2xl px-4 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Plant Context (locked)</div>
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <div className="text-xs text-gray-500">Batch</div>
                <div className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{batch?.strain_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Container</div>
                <div className="font-mono font-bold text-gray-800">{assignment?.container_id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">METRC tag</div>
                {tagLast4 ? (
                  <div className="font-mono text-base font-bold text-green-800">…{tagLast4}</div>
                ) : (
                  <div className="text-xs text-amber-600 italic">No tag</div>
                )}
              </div>
            </div>
          </div>
        )}

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
                    ? 'border-purple-600 bg-purple-50 text-purple-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
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
              className="flex-1 border border-gray-300 rounded-2xl px-4 text-3xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              style={{ minHeight: '72px', fontFamily: 'JetBrains Mono, monospace' }}
              autoFocus={!contextLoading && !contextError}
            />
            <div className="flex flex-col gap-1.5">
              {WEIGHT_UNITS.map(u => (
                <button
                  key={u}
                  onClick={() => setWeightUnit(u)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    weightUnit === u
                      ? 'border-purple-600 bg-purple-50 text-purple-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
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
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes (optional)</label>
          <textarea
            placeholder="Any observations about this partial harvest…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            rows={3}
          />
        </div>

        {user && (
          <div className="text-xs text-gray-400">Applicator: <span className="font-medium text-gray-600">{user.name}</span></div>
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{saveError}</div>
        )}
      </div>

      {/* Fixed save button */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <button
            onClick={handleSave}
            disabled={!canSave || saving || contextLoading || !!contextError}
            className={`w-full font-bold rounded-2xl text-white shadow-lg transition-all active:scale-[0.98] ${
              saveFlash
                ? 'bg-purple-500 scale-[0.99]'
                : canSave && !saving && !contextLoading && !contextError
                  ? 'bg-purple-700 hover:bg-purple-800 active:bg-purple-900'
                  : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ minHeight: '64px', fontSize: '1.05rem' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Recording…
              </span>
            ) : 'Record Partial Harvest'}
          </button>
        </div>
      </div>
    </div>
  );
}
