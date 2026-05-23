import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

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

export default function PlantReplacementForm() {
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const batchIdParam = searchParams.get('batch_id');

  // Context
  const [containerData, setContainerData] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  // Form state
  const [notes, setNotes] = useState('');

  const autoSaveTimer = useRef(null);

  // Draft persistence
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(`cv_draft_plant_replacement_${containerId}`, JSON.stringify({
        notes, savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [containerId, notes]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cv_draft_plant_replacement_${containerId}`);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.notes) setNotes(draft.notes);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.getContainer(containerId)
      .then(d => { setContainerData(d); setLoadingCtx(false); })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId]);

  const effectiveBatchId = batchIdParam
    ? Number(batchIdParam)
    : (containerData?.current_state?.current_batch_id ?? null);

  async function handleSave() {
    if (!effectiveBatchId) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.recordReplacement({
        batch_id: effectiveBatchId,
        container_id: containerId,
        notes: notes.trim() || null,
      });
      try { localStorage.removeItem(`cv_draft_plant_replacement_${containerId}`); } catch { /* ignore */ }
      setToast('Replacement plant assigned. Use Tag Assignment to link a METRC tag.');
      setTimeout(() => navigate(`/containers/${encodeURIComponent(containerId)}`), 2000);
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);
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

  const { container, current_state, current_batch } = containerData ?? {};
  const state = current_state?.current_state;

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
        Assign Replacement Plant
      </h1>

      {/* Context breadcrumb */}
      {current_batch && (
        <div className="text-sm text-gray-500 mb-4">
          <span className="font-medium text-green-800">{current_batch.strain_name}</span>
          {' · '}
          <span className="font-mono text-xs">{containerId}</span>
          {' · '}
          <span className="italic">{current_batch.strain_type === 'auto' ? 'Autoflower' : 'Photoperiod'}</span>
        </div>
      )}

      {/* Guard: wrong state */}
      {state !== 'empty' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          Container is currently <strong>{state}</strong>. Only empty containers can receive a replacement plant.
        </div>
      )}

      {/* Guard: no batch */}
      {!effectiveBatchId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          No active batch found for this container.
        </div>
      )}

      {/* Container state card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Container Context</div>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-sm text-gray-800">{containerId}</span>
          <span className="text-xs bg-amber-200 text-amber-900 font-semibold px-2.5 py-0.5 rounded-full">Empty</span>
        </div>
        {current_batch && (
          <>
            <div className="text-sm text-gray-600">
              Strain: <span className="font-semibold text-green-800">{current_batch.strain_name}</span>
              <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                current_batch.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {current_batch.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
              </span>
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Batch status: <span className="font-medium capitalize">{current_batch.status?.replace(/-/g, ' ')}</span>
            </div>
          </>
        )}
      </div>

      {/* Info notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-5">
        <div className="text-sm font-semibold text-blue-800 mb-1">Next step: assign a METRC tag</div>
        <div className="text-xs text-blue-700">
          A new plant assignment will be created without a METRC tag. Use the Tag Assignment workflow
          after placing the replacement plant to link its tag.
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Replacement plant source, reason for replacement, etc.…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
        />
      </div>

      {/* Error */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {saveError}
        </div>
      )}

      {/* Save button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 safe-area-inset-bottom z-10">
        <button
          onClick={handleSave}
          disabled={state !== 'empty' || !effectiveBatchId || saving}
          className="w-full bg-green-800 text-white font-bold text-base py-4 rounded-2xl disabled:opacity-40 hover:bg-green-900 active:bg-green-950 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Assigning replacement…' : 'Assign Replacement Plant'}
        </button>
      </div>
    </div>
  );
}
