import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_teardown';

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className="bg-green-700 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2">
        ✓ {message}
      </div>
    </div>
  );
}

const CHECKLIST = [
  { key: 'plant_removed',       label: 'Plant material removed' },
  { key: 'debris_disposed',     label: 'Debris disposed' },
  { key: 'container_cleaned',   label: 'Container cleaned' },
  { key: 'soil_sample_collected', label: 'Soil sample collected' },
];

export default function TeardownForm() {
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const batchIdParam = searchParams.get('batch_id') ? Number(searchParams.get('batch_id')) : null;

  const [containerData, setContainerData] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  const [checklist, setChecklist] = useState({
    plant_removed: false,
    debris_disposed: false,
    container_cleaned: false,
    soil_sample_collected: false,
  });
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  useEffect(() => {
    api.getContainer(containerId)
      .then(d => { setContainerData(d); setLoadingCtx(false); })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId]);

  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(DRAFT_KEY + '_' + containerId)); } catch { return null; }
    })();
    if (saved) {
      if (saved.checklist) setChecklist(c => ({ ...c, ...saved.checklist }));
      if (saved.notes) setNotes(saved.notes);
    }
  }, [containerId]);

  function scheduleDraftSave(newChecklist, newNotes) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY + '_' + containerId, JSON.stringify({
        checklist: newChecklist ?? checklist,
        notes: newNotes ?? notes,
      }));
    }, 3000);
  }

  function clearDraft() { localStorage.removeItem(DRAFT_KEY + '_' + containerId); }

  function toggleCheck(key) {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    scheduleDraftSave(next, null);
  }

  const effectiveBatchId = batchIdParam ?? containerData?.current_batch?.batch_id ?? null;

  async function handleSave() {
    if (!effectiveBatchId) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.startTeardown(containerId, {
        batch_id: effectiveBatchId,
        ...checklist,
        notes: notes.trim() || null,
      });
      clearDraft();
      setToast('Teardown initiated');
      setTimeout(() => {
        if (checklist.soil_sample_collected) {
          navigate(`/containers/${encodeURIComponent(containerId)}/soil-sample/new?teardown_id=new`);
        } else {
          navigate(`/containers/${encodeURIComponent(containerId)}`);
        }
      }, 1500);
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
  const currentState = current_state?.current_state;

  if (currentState !== 'active' && currentState !== 'empty') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
          ← {containerId}
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          Teardown requires container to be in 'active' or 'empty' state. Currently: <strong>{currentState}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <button
        onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← {containerId}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Begin Teardown
      </h1>

      {current_batch && (
        <div className="text-sm text-gray-500 mb-5">
          <span className="font-medium text-green-800">{current_batch.batch_name || current_batch.strain_name}</span>
          {' · '}
          <span className="font-mono text-xs">{containerId}</span>
          {' · '}
          <span className="text-xs">{current_batch.status}</span>
        </div>
      )}

      <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 mb-5 text-sm text-orange-800">
        Recording teardown will transition this container to <strong>Teardown</strong> state.
        The batch association is preserved for soil sample tracking.
      </div>

      {/* Checklist */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-3">Teardown checklist</label>
        <div className="flex flex-col gap-2">
          {CHECKLIST.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleCheck(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                checklist[key]
                  ? 'border-green-500 bg-green-50 text-green-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              style={{ minHeight: '56px' }}
            >
              <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 ${
                checklist[key] ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {checklist[key] && <span className="text-white text-xs">✓</span>}
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {checklist.soil_sample_collected && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 text-sm text-blue-800">
          You'll be prompted to log the soil sample after teardown is recorded.
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); scheduleDraftSave(null, e.target.value); }}
          rows={3}
          placeholder="Any notes about this teardown…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
      </div>

      {!effectiveBatchId && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm mb-4">
          No active batch found for this container. Navigate here from a batch context.
        </div>
      )}

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {saveError}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-10">
        <button
          onClick={handleSave}
          disabled={!effectiveBatchId || saving}
          className="w-full bg-orange-700 text-white font-bold text-base py-4 rounded-2xl disabled:opacity-40 hover:bg-orange-800 active:bg-orange-900 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Recording teardown…' : 'Begin Teardown'}
        </button>
      </div>
    </div>
  );
}
