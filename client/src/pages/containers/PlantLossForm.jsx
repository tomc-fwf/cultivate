import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useOfflineSubmit } from '../../lib/offlineQueue';

const DRAFT_KEY = 'cv_draft_plant_loss';

const LOSS_TYPES = [
  { value: 'death_natural',    label: 'Natural Death' },
  { value: 'death_disease',    label: 'Disease' },
  { value: 'death_pest',       label: 'Pest' },
  { value: 'physical_damage',  label: 'Physical Damage' },
  { value: 'removal_culled',   label: 'Culled' },
  { value: 'removal_quality',  label: 'Quality Removal' },
  { value: 'accidental',       label: 'Accidental' },
  { value: 'other',            label: 'Other' },
];

const DISPOSITIONS = [
  { value: 'disposed_compost', label: 'Compost' },
  { value: 'disposed_waste',   label: 'Waste' },
  { value: 'quarantined',      label: 'Quarantine' },
  { value: 'tested',           label: 'Test' },
  { value: 'other',            label: 'Other' },
];

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className="bg-green-700 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto">
        ✓ {message}
      </div>
    </div>
  );
}

export default function PlantLossForm() {
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const batchIdParam = searchParams.get('batch_id');

  // Container + assignment context
  const [containerData, setContainerData] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  // Form state
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [lossType, setLossType] = useState('');
  const [lossCause, setLossCause] = useState('');
  const [disposition, setDisposition] = useState('');
  const [notes, setNotes] = useState('');

  // Save state
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  const { submit, saving, pendingSync } = useOfflineSubmit({
    draftKey: DRAFT_KEY + '_' + containerId,
    onSuccess: (_, isOffline) => {
      if (isOffline) {
        setToast('Network lost — plant loss saved locally. Will sync when online.');
      } else {
        setToast('Plant loss recorded. METRC sync pending.');
        setTimeout(() => navigate(`/containers/${encodeURIComponent(containerId)}`), 1800);
      }
    },
    onError: (e) => setSaveError(e.message || 'Failed to record loss. Please try again.'),
  });

  // Load context
  useEffect(() => {
    setLoadingCtx(true);
    Promise.all([
      api.getContainer(containerId),
      api.getContainerAssignments(containerId),
    ])
      .then(([cd, asgn]) => {
        setContainerData(cd);
        const active = asgn.assignments ?? [];
        setAssignments(active);
        if (active.length === 1) setSelectedAssignmentId(active[0].assignment_id);
        setLoadingCtx(false);
      })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId]);

  // Draft persistence
  useEffect(() => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY + '_' + containerId)); } catch { return null; } })();
    if (saved) {
      if (saved.lossType) setLossType(saved.lossType);
      if (saved.lossCause) setLossCause(saved.lossCause);
      if (saved.disposition) setDisposition(saved.disposition);
      if (saved.notes) setNotes(saved.notes);
    }
  }, [containerId]);

  function scheduleDraftSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY + '_' + containerId, JSON.stringify({ lossType, lossCause, disposition, notes }));
    }, 3000);
  }

  function clearDraft() { localStorage.removeItem(DRAFT_KEY + '_' + containerId); }

  const effectiveBatchId = batchIdParam
    ? Number(batchIdParam)
    : (containerData?.current_batch?.batch_id ?? null);

  const canSave = selectedAssignmentId && lossType && disposition && effectiveBatchId;

  async function handleSave() {
    if (!canSave) return;
    setSaveError('');
    const payload = {
      batch_id: effectiveBatchId,
      container_id: containerId,
      plant_assignment_id: selectedAssignmentId,
      loss_type: lossType,
      loss_cause: lossCause.trim() || null,
      plant_disposition: disposition,
      notes: notes.trim() || null,
    };
    await submit(
      () => api.recordPlantLoss(payload),
      { endpoint: '/api/plant-loss', payload, entity_type: 'plant_loss' }
    );
  }

  if (loadingCtx) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (ctxError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{ctxError}</div>
      </div>
    );
  }

  const { current_batch } = containerData ?? {};

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Back */}
      <button
        onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← {containerId}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Record Plant Loss
      </h1>

      {/* Context breadcrumb */}
      {current_batch && (
        <div className="text-sm text-gray-500 mb-4">
          <span className="font-medium text-green-800">{current_batch.batch_name || current_batch.strain_name}</span>
          {' · '}
          <span className="font-mono text-xs">{containerId}</span>
        </div>
      )}

      {/* Warning banner */}
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl px-4 py-3 mb-5">
        <div className="text-sm font-semibold text-red-800 mb-1">This action cannot be undone</div>
        <div className="text-xs text-red-700">
          Recording a loss will unassign this plant and mark it as a METRC waste event.
          {assignments.length <= 1
            ? ' The container will become Empty.'
            : ' The container will become Empty if this is the last active plant.'}
        </div>
      </div>

      {/* Plant selector — only shown when multiple plants in container */}
      {assignments.length > 1 && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Which plant?</label>
          <div className="flex flex-col gap-2">
            {assignments.map(a => (
              <button
                key={a.assignment_id}
                onClick={() => setSelectedAssignmentId(a.assignment_id)}
                className={`w-full text-left px-4 py-3 rounded-2xl border-2 text-sm transition-colors ${
                  selectedAssignmentId === a.assignment_id
                    ? 'border-red-400 bg-red-50 text-red-900 font-semibold'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
                style={{ minHeight: '56px' }}
              >
                {a.metrc_plant_tag
                  ? <>Tag: <span className="font-mono">{a.metrc_plant_tag.slice(0, -4)}<span className="font-bold">{a.metrc_plant_tag.slice(-4)}</span></span></>
                  : <span className="italic text-gray-500">Untagged placement (placed {new Date(a.placed_at).toLocaleDateString()})</span>
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {/* If no active plants (shouldn't reach here normally) */}
      {assignments.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          No active plant assignments found for this container.
        </div>
      )}

      {/* Loss type */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Loss type *</label>
        <div className="grid grid-cols-2 gap-2">
          {LOSS_TYPES.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setLossType(opt.value); scheduleDraftSave(); }}
              className={`px-4 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                lossType === opt.value
                  ? 'border-red-500 bg-red-50 text-red-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              style={{ minHeight: '56px' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loss cause */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Cause <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={lossCause}
          onChange={e => { setLossCause(e.target.value); scheduleDraftSave(); }}
          placeholder="e.g. root rot, broken stem, spotted wilt…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          style={{ minHeight: '56px' }}
        />
      </div>

      {/* Disposition */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Disposition *</label>
        <div className="grid grid-cols-3 gap-2">
          {DISPOSITIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setDisposition(opt.value); scheduleDraftSave(); }}
              className={`px-3 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                disposition === opt.value
                  ? 'border-orange-500 bg-orange-50 text-orange-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              style={{ minHeight: '56px' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); scheduleDraftSave(); }}
          rows={3}
          placeholder="Any additional context…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
        />
      </div>

      {pendingSync && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700 font-medium mb-3">
          ⏱ Saved locally — will sync when connection is restored
        </div>
      )}

      {/* Error */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {saveError}
        </div>
      )}

      {/* Save button — bottom of viewport on mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 safe-area-inset-bottom z-10">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-red-700 text-white font-bold text-base py-4 rounded-2xl disabled:opacity-40 hover:bg-red-800 active:bg-red-900 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Recording loss…' : 'Record Plant Loss'}
        </button>
      </div>
    </div>
  );
}
