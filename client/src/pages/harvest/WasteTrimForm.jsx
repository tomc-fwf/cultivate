import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_waste_trim';

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

const STATUS_CHIP = {
  'germ':           'bg-gray-100 text-gray-700',
  'seedling':       'bg-lime-100 text-lime-700',
  'cult-hoop':      'bg-green-100 text-green-700',
  'field-veg':      'bg-green-100 text-green-800',
  'field-flower':   'bg-purple-100 text-purple-700',
  'flush':          'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700',
  'harvesting':     'bg-red-100 text-red-700',
};
const STATUS_LABELS = {
  'germ': 'Germination', 'seedling': 'Seedlings', 'cult-hoop': 'Cult-Hoop',
  'field-veg': 'Field — Veg', 'field-flower': 'Field — Flower',
  'flush': 'Flush', 'harvest_window': 'Harvest Window', 'harvesting': 'Harvesting',
};

const TRIM_REASONS = [
  { value: 'defoliation',     label: 'Defoliation' },
  { value: 'lollipoping',     label: 'Lollipoping' },
  { value: 'ipm_removal',     label: 'IPM Removal' },
  { value: 'disease_removal', label: 'Disease Removal' },
  { value: 'pest_damage',     label: 'Pest Damage' },
  { value: 'physical_damage', label: 'Physical Damage' },
  { value: 'senescence',      label: 'Senescence' },
  { value: 'other',           label: 'Other' },
];

const WEIGHT_UNITS = ['g', 'oz', 'lb'];

export default function WasteTrimForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const batchIdParam = searchParams.get('batch_id');
  const containerIdParam = searchParams.get('container_id');

  // Batch context
  const [lockedBatch, setLockedBatch] = useState(null);
  const [lockedBatchLoading, setLockedBatchLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(batchIdParam ? Number(batchIdParam) : null);

  // Form state
  const [trimReason, setTrimReason] = useState('');
  const [trimReasonNotes, setTrimReasonNotes] = useState('');
  const [wetWeight, setWetWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('g');
  const [containerId, setContainerId] = useState(containerIdParam ?? '');
  const [notes, setNotes] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  // Load locked batch
  useEffect(() => {
    if (!batchIdParam) return;
    setLockedBatchLoading(true);
    api.getBatch(batchIdParam)
      .then(b => { setLockedBatch(b); setLockedBatchLoading(false); })
      .catch(() => setLockedBatchLoading(false));
  }, [batchIdParam]);

  // Load batch list if no batch param
  useEffect(() => {
    if (batchIdParam) return;
    setBatchesLoading(true);
    api.getBatches({})
      .then(data => { setBatches(data.filter(b => b.status !== 'closed')); setBatchesLoading(false); })
      .catch(() => setBatchesLoading(false));
  }, [batchIdParam]);

  // Restore draft
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (!draft || draft.batchIdParam !== batchIdParam) return;
      if (draft.trimReason) setTrimReason(draft.trimReason);
      if (draft.trimReasonNotes) setTrimReasonNotes(draft.trimReasonNotes);
      if (draft.wetWeight) setWetWeight(draft.wetWeight);
      if (draft.weightUnit) setWeightUnit(draft.weightUnit);
      if (draft.containerId && !containerIdParam) setContainerId(draft.containerId);
      if (draft.notes) setNotes(draft.notes);
    } catch { /* ignore */ }
  }, [batchIdParam, containerIdParam]);

  // Auto-save draft
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        batchIdParam, trimReason, trimReasonNotes, wetWeight, weightUnit, containerId, notes,
        savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [batchIdParam, trimReason, trimReasonNotes, wetWeight, weightUnit, containerId, notes]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  const batchId = batchIdParam ? Number(batchIdParam) : selectedBatchId;
  const activeBatch = lockedBatch ?? batches.find(b => b.batch_id === batchId);
  const canSave = Boolean(batchId) && trimReason !== '' && wetWeight !== '' && Number(wetWeight) > 0;

  async function handleSave() {
    setSaveError('');
    setSaving(true);

    const payload = {
      batch_id: batchId,
      container_id: containerId.trim() || undefined,
      trim_reason: trimReason,
      trim_reason_notes: (trimReason === 'other' && trimReasonNotes.trim()) ? trimReasonNotes.trim() : undefined,
      wet_weight: parseFloat(wetWeight),
      weight_unit: weightUnit,
      notes: notes.trim() || undefined,
    };

    try {
      await api.createWasteTrim(payload);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      setToast({ message: 'Waste trim recorded', type: 'success' });
      setTimeout(() => {
        if (batchIdParam) navigate(`/harvest/${batchIdParam}`);
        else navigate('/');
      }, 1400);
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || 'Failed to save.');
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-green-700 font-medium text-sm hover:text-green-900"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1" style={{ fontFamily: 'Fraunces, serif' }}>
          Record Waste Trim
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-36 flex flex-col gap-4">

        {/* Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Waste trim generates <strong>waste, not product</strong>. Available at any batch status — trimmed material will be disposed, not sold.
        </div>

        {/* Batch */}
        {batchIdParam ? (
          lockedBatchLoading ? (
            <div className="h-16 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ) : lockedBatch ? (
            <div className="bg-white border-2 border-amber-300 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{lockedBatch.strain_name}</span>
                {lockedBatch.sub_zone_id && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{lockedBatch.sub_zone_id}</span>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[lockedBatch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[lockedBatch.status] ?? lockedBatch.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">Batch not found</div>
          )
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Batch <span className="text-red-400">*</span>
            </label>
            {batchesLoading ? (
              <div className="h-16 bg-white rounded-2xl border animate-pulse" />
            ) : batches.length === 0 ? (
              <div className="text-sm text-gray-500">No active batches</div>
            ) : (
              <div className="flex flex-col gap-2">
                {batches.map(b => (
                  <button
                    key={b.batch_id}
                    onClick={() => setSelectedBatchId(b.batch_id)}
                    className={`text-left w-full px-4 py-3 rounded-2xl border-2 transition-colors ${
                      selectedBatchId === b.batch_id ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-amber-300'
                    }`}
                    style={{ minHeight: '56px' }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{b.strain_name}</span>
                      {b.sub_zone_id && <span className="text-xs text-gray-500">{b.sub_zone_id}</span>}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Container (optional unless passed as param) */}
        {containerIdParam ? (
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Container</div>
            <div className="font-mono font-bold text-gray-800">{containerIdParam}</div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Container (optional)</label>
            <input
              type="text"
              placeholder="e.g. Z1-A-R3-C12"
              value={containerId}
              onChange={e => setContainerId(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-2xl px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>
        )}

        {/* Trim Reason */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Trim Reason <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TRIM_REASONS.map(r => (
              <button
                key={r.value}
                onClick={() => setTrimReason(r.value)}
                className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition-colors text-left ${
                  trimReason === r.value
                    ? 'border-amber-600 bg-amber-50 text-amber-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300'
                }`}
                style={{ minHeight: '56px' }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {trimReason === 'other' && (
            <textarea
              placeholder="Describe the reason…"
              value={trimReasonNotes}
              onChange={e => setTrimReasonNotes(e.target.value)}
              className="mt-2 w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              rows={2}
            />
          )}
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
              className="flex-1 border border-gray-300 rounded-2xl px-4 text-3xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              style={{ minHeight: '72px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            <div className="flex flex-col gap-1.5">
              {WEIGHT_UNITS.map(u => (
                <button
                  key={u}
                  onClick={() => setWeightUnit(u)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    weightUnit === u
                      ? 'border-amber-600 bg-amber-50 text-amber-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300'
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
            placeholder="Additional observations…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
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
            disabled={!canSave || saving}
            className={`w-full font-bold rounded-2xl text-white shadow-lg transition-all active:scale-[0.98] ${
              saveFlash
                ? 'bg-amber-500 scale-[0.99]'
                : canSave && !saving
                  ? 'bg-amber-700 hover:bg-amber-800 active:bg-amber-900'
                  : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ minHeight: '64px', fontSize: '1.05rem' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Recording…
              </span>
            ) : 'Record Waste Trim'}
          </button>
        </div>
      </div>
    </div>
  );
}
