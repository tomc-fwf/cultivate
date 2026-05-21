import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_soil_sample';

const SAMPLE_TYPES = [
  { value: 'individual',        label: 'Individual Container' },
  { value: 'composite_row',     label: 'Composite Row' },
  { value: 'composite_subzone', label: 'Composite Sub-zone' },
];

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

export default function SoilSampleForm() {
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const teardownIdParam = searchParams.get('teardown_id');

  const [containerData, setContainerData] = useState(null);
  const [teardownId, setTeardownId] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  const [sampleLabel, setSampleLabel] = useState('');
  const [sampleType, setSampleType] = useState('individual');
  const [labName, setLabName] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  useEffect(() => {
    api.getContainer(containerId)
      .then(d => {
        setContainerData(d);
        // If teardown_id param is 'new', use most recent teardown event's id
        if (teardownIdParam === 'new') {
          const mostRecent = d.teardown_events?.[0];
          if (mostRecent) setTeardownId(mostRecent.teardown_id);
        } else if (teardownIdParam) {
          setTeardownId(Number(teardownIdParam));
        }
        setLoadingCtx(false);
      })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId, teardownIdParam]);

  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(DRAFT_KEY + '_' + containerId)); } catch { return null; }
    })();
    if (saved) {
      if (saved.sampleLabel) setSampleLabel(saved.sampleLabel);
      if (saved.sampleType) setSampleType(saved.sampleType);
      if (saved.labName) setLabName(saved.labName);
      if (saved.notes) setNotes(saved.notes);
    }
  }, [containerId]);

  function scheduleDraftSave(overrides = {}) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY + '_' + containerId, JSON.stringify({
        sampleLabel, sampleType, labName, notes, ...overrides,
      }));
    }, 3000);
  }

  function clearDraft() { localStorage.removeItem(DRAFT_KEY + '_' + containerId); }

  const canSave = sampleLabel.trim().length > 0 && sampleType;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.createSoilSample(containerId, {
        sample_type: sampleType,
        sample_label: sampleLabel.trim(),
        teardown_id: teardownId ?? null,
        lab_name: labName.trim() || null,
        notes: notes.trim() || null,
      });
      clearDraft();
      setToast('Soil sample recorded');
      setTimeout(() => navigate(`/containers/${encodeURIComponent(containerId)}`), 1500);
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

  const { container, current_state } = containerData ?? {};

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
        Log Soil Sample
      </h1>
      <div className="text-sm text-gray-500 mb-5">
        <span className="font-mono text-xs">{containerId}</span>
        {current_state?.current_state && (
          <> · <span className="capitalize">{current_state.current_state}</span></>
        )}
        {teardownId && <> · Teardown #{teardownId}</>}
      </div>

      {/* Sample label */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Sample bag label *
        </label>
        <input
          type="text"
          value={sampleLabel}
          onChange={e => { setSampleLabel(e.target.value); scheduleDraftSave({ sampleLabel: e.target.value }); }}
          placeholder="e.g. Z1A-R3-C12-TD-05-21"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
          style={{ minHeight: '56px' }}
          autoFocus
        />
        <p className="text-xs text-gray-400 mt-1">The physical label written on the sample bag sent to the lab.</p>
      </div>

      {/* Sample type */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Sample type *</label>
        <div className="flex flex-col gap-2">
          {SAMPLE_TYPES.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setSampleType(opt.value); scheduleDraftSave({ sampleType: opt.value }); }}
              className={`w-full text-left px-4 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                sampleType === opt.value
                  ? 'border-green-500 bg-green-50 text-green-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              style={{ minHeight: '56px' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lab name */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Lab name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={labName}
          onChange={e => { setLabName(e.target.value); scheduleDraftSave({ labName: e.target.value }); }}
          placeholder="e.g. Midwest Labs, A&L Great Lakes…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
          style={{ minHeight: '56px' }}
        />
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); scheduleDraftSave({ notes: e.target.value }); }}
          rows={3}
          placeholder="Any notes about this sample…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
        />
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {saveError}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-10">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-green-800 text-white font-bold text-base py-4 rounded-2xl disabled:opacity-40 hover:bg-green-900 active:bg-green-950 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Saving sample…' : 'Log Soil Sample'}
        </button>
      </div>
    </div>
  );
}
