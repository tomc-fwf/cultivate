import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_startup';

const MEDIA_PCT_CHIPS = [
  { value: 33,  label: '33%' },
  { value: 50,  label: '50%' },
  { value: 100, label: '100%' },
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

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

export default function StartupForm() {
  const { containerId } = useParams();
  const navigate = useNavigate();

  const [containerData, setContainerData] = useState(null);
  const [soilSamples, setSoilSamples] = useState([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  // Form state — pre-populated from most recent teardown / sample
  const [priorTeardownId, setPriorTeardownId] = useState(null);
  const [priorSoilSampleId, setPriorSoilSampleId] = useState(null);
  const [mediaPct, setMediaPct] = useState(33);
  const [mediaPctCustom, setMediaPctCustom] = useState('');
  const [useCustomPct, setUseCustomPct] = useState(false);
  const [mediaBrand, setMediaBrand] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  useEffect(() => {
    Promise.all([api.getContainer(containerId), api.getSoilSamples(containerId)])
      .then(([cd, samples]) => {
        setContainerData(cd);
        setSoilSamples(samples);

        const mostRecentTeardown = cd.teardown_events?.[0];
        const mostRecentSample = samples?.[0];

        if (mostRecentTeardown) setPriorTeardownId(mostRecentTeardown.teardown_id);
        if (mostRecentSample) setPriorSoilSampleId(mostRecentSample.sample_id);

        setLoadingCtx(false);
      })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId]);

  // Restore draft after context load so pre-populated values can be overridden
  useEffect(() => {
    if (loadingCtx) return;
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(DRAFT_KEY + '_' + containerId)); } catch { return null; }
    })();
    if (saved) {
      if (saved.mediaPct != null) setMediaPct(saved.mediaPct);
      if (saved.useCustomPct != null) setUseCustomPct(saved.useCustomPct);
      if (saved.mediaPctCustom) setMediaPctCustom(saved.mediaPctCustom);
      if (saved.mediaBrand) setMediaBrand(saved.mediaBrand);
      if (saved.notes) setNotes(saved.notes);
    }
  }, [loadingCtx, containerId]);

  function scheduleDraftSave(overrides = {}) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY + '_' + containerId, JSON.stringify({
        mediaPct, useCustomPct, mediaPctCustom, mediaBrand, notes, ...overrides,
      }));
    }, 3000);
  }

  function clearDraft() { localStorage.removeItem(DRAFT_KEY + '_' + containerId); }

  const effectiveMediaPct = useCustomPct
    ? (parseFloat(mediaPctCustom) || null)
    : mediaPct;

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await api.startStartup(containerId, {
        prior_teardown_id: priorTeardownId ?? null,
        prior_soil_sample_id: priorSoilSampleId ?? null,
        media_replaced_pct: effectiveMediaPct,
        media_brand: mediaBrand.trim() || null,
        notes: notes.trim() || null,
      });
      clearDraft();
      setToast('Startup initiated');
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

  const { current_state, teardown_events } = containerData ?? {};
  const currentState = current_state?.current_state;

  if (currentState !== 'teardown') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
          ← {containerId}
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          Startup requires container to be in 'teardown' state. Currently: <strong>{currentState}</strong>
        </div>
      </div>
    );
  }

  const mostRecentTeardown = teardown_events?.[0];
  const mostRecentSample = soilSamples?.[0];

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
        Begin Startup
      </h1>
      <div className="text-sm text-gray-500 mb-5">
        <span className="font-mono text-xs">{containerId}</span> · Teardown → Startup
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-5 text-sm text-blue-800">
        Startup transitions the container to <strong>Startup</strong> state. Use this phase for
        media replacement and amendments before planting.
      </div>

      {/* Prior teardown context */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Prior teardown</label>
        {mostRecentTeardown ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
            <span className="text-green-600">✓</span>
            <div>
              <div className="font-medium text-gray-800">Teardown #{mostRecentTeardown.teardown_id}</div>
              <div className="text-xs text-gray-500">Started {fmtDate(mostRecentTeardown.started_at)}</div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            No teardown event found — proceeding without teardown reference.
          </div>
        )}
      </div>

      {/* Prior soil sample context */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Prior soil sample</label>
        {mostRecentSample ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
            <span className="text-green-600">✓</span>
            <div>
              <div className="font-medium text-gray-800">{mostRecentSample.sample_label}</div>
              <div className="text-xs text-gray-500">
                {fmtDate(mostRecentSample.sampled_at)}
                {mostRecentSample.results_received ? ' · Results received' : ' · Results pending'}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            No soil sample found. Recommend logging a soil sample before startup to inform amendment decisions.
          </div>
        )}
      </div>

      {/* Media replaced % */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Media replaced</label>
        <div className="flex gap-2 flex-wrap mb-2">
          {MEDIA_PCT_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => { setMediaPct(chip.value); setUseCustomPct(false); scheduleDraftSave({ mediaPct: chip.value, useCustomPct: false }); }}
              className={`px-5 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                !useCustomPct && mediaPct === chip.value
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              style={{ minHeight: '56px' }}
            >
              {chip.label}
            </button>
          ))}
          <button
            onClick={() => { setUseCustomPct(true); scheduleDraftSave({ useCustomPct: true }); }}
            className={`px-5 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
              useCustomPct
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
            style={{ minHeight: '56px' }}
          >
            Custom
          </button>
        </div>
        {useCustomPct && (
          <input
            type="number"
            min="0"
            max="100"
            inputMode="decimal"
            value={mediaPctCustom}
            onChange={e => { setMediaPctCustom(e.target.value); scheduleDraftSave({ mediaPctCustom: e.target.value }); }}
            placeholder="Enter percentage (0–100)"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{ minHeight: '56px' }}
          />
        )}
      </div>

      {/* Media brand */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Media brand <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={mediaBrand}
          onChange={e => { setMediaBrand(e.target.value); scheduleDraftSave({ mediaBrand: e.target.value }); }}
          placeholder="e.g. Pro-Mix HP, Mother Earth Coco…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
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
          placeholder="Amendment plan, notes from soil sample results…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
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
          disabled={saving}
          className="w-full bg-blue-700 text-white font-bold text-base py-4 rounded-2xl disabled:opacity-40 hover:bg-blue-800 active:bg-blue-900 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Starting up…' : 'Begin Startup'}
        </button>
      </div>
    </div>
  );
}
