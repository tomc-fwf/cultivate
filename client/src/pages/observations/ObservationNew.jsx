import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_observation';

function toLocalDatetimeString(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : type === 'warning' ? 'bg-amber-600' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-auto`}>
        {type === 'success' ? '✓ ' : '⚠ '}{message}
      </div>
    </div>
  );
}

function getRowsForSubZone(subZoneId) {
  if (!subZoneId) return [];
  const match = subZoneId.match(/^Z(\d)([AB])$/);
  if (!match) return [];
  const [, zone, sub] = match;
  return Array.from({ length: 5 }, (_, i) => `Z${zone}-${sub}-R${i + 1}`);
}

const STATUS_LABELS = {
  'germ': 'Germination', 'seedling': 'Seedlings', 'cult-hoop': 'Cult-Hoop',
  'field-veg': 'Field — Veg', 'field-flower': 'Field — Flower',
  'flush': 'Flush', 'harvest_window': 'Harvest Window', 'harvesting': 'Harvesting',
};
const STATUS_CHIP = {
  'germ': 'bg-gray-100 text-gray-700', 'seedling': 'bg-lime-100 text-lime-700',
  'cult-hoop': 'bg-green-100 text-green-700', 'field-veg': 'bg-green-100 text-green-800',
  'field-flower': 'bg-purple-100 text-purple-700', 'flush': 'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700', 'harvesting': 'bg-red-100 text-red-700',
};

const CATEGORIES = [
  { value: 'healthy',           label: 'Healthy',          color: 'bg-green-100 text-green-800  border-green-300' },
  { value: 'pest',              label: 'Pest',             color: 'bg-red-100   text-red-800    border-red-300' },
  { value: 'deficiency',        label: 'Deficiency',       color: 'bg-amber-100 text-amber-800  border-amber-300' },
  { value: 'disease',           label: 'Disease',          color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'damage',            label: 'Damage',           color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'harvest_readiness', label: 'Harvest Readiness', color: 'bg-orange-200 text-orange-900 border-orange-400' },
  { value: 'other',             label: 'Other',            color: 'bg-gray-100  text-gray-700   border-gray-300' },
];

const SEVERITIES = [
  { value: 'low',    label: 'Low',    color: 'border-green-400 bg-green-50 text-green-800' },
  { value: 'medium', label: 'Medium', color: 'border-amber-400 bg-amber-50 text-amber-800' },
  { value: 'high',   label: 'High',   color: 'border-red-500   bg-red-50   text-red-800' },
];

// ─── Voice input hook ─────────────────────────────────────────────────────
function useVoiceInput(onTranscript) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const supported = typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  function start() {
    if (!supported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = e => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognitionRef.current = r;
    r.start();
    setListening(true);
  }

  function stop() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  return { supported, listening, start, stop };
}

// ─── Readiness summary bar ────────────────────────────────────────────────
function ReadinessSummary({ batchId, refreshKey }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!batchId) return;
    api.getReadinessSummary(batchId)
      .then(setRows)
      .catch(() => {});
  }, [batchId, refreshKey]);

  if (rows.length === 0) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
      <div className="text-xs font-bold text-orange-800 uppercase tracking-wide mb-2">Harvest Readiness by Row</div>
      <div className="flex flex-col gap-1.5">
        {rows.map(row => {
          const pct = row.observed_containers > 0
            ? Math.round((row.ready_count / row.observed_containers) * 100)
            : 0;
          return (
            <div key={row.row_id} className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-gray-700 w-16 flex-shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {row.row_id}
              </span>
              <div className="flex-1 bg-orange-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-orange-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-orange-800 w-20 text-right flex-shrink-0">
                {row.ready_count}/{row.observed_containers} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function ObservationNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const batchIdParam = searchParams.get('batch_id');
  const rowIdParam   = searchParams.get('row_id');
  const containerIdParam = searchParams.get('container_id');

  // Batch
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [lockedBatch, setLockedBatch] = useState(null);
  const [lockedBatchLoading, setLockedBatchLoading] = useState(false);

  // Form fields
  const [targetLevel, setTargetLevel] = useState(
    containerIdParam ? 'container' : rowIdParam ? 'row' : 'row'
  );
  const [targetRowId, setTargetRowId] = useState(rowIdParam ?? '');
  const [targetContainerId, setTargetContainerId] = useState(containerIdParam ?? '');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [note, setNote] = useState('');
  const [observedAt, setObservedAt] = useState(toLocalDatetimeString());
  const [showOptional, setShowOptional] = useState(false);

  // Harvest readiness fields
  const [maturityPct, setMaturityPct] = useState(50);
  const [readyToHarvest, setReadyToHarvest] = useState(null); // true | false | null
  const [harvestPriority, setHarvestPriority] = useState('');

  // Readiness summary refresh
  const [summaryKey, setSummaryKey] = useState(0);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [toast, setToast] = useState(null);
  const [saveCount, setSaveCount] = useState(0); // for "log another" flow

  const autoSaveTimer = useRef(null);

  const activeBatch = lockedBatch ?? selectedBatch;
  const isHarvestWindow = activeBatch?.status === 'harvest_window' || activeBatch?.status === 'harvesting';
  const isHarvestReadiness = category === 'harvest_readiness';
  const rowsForBatch = getRowsForSubZone(activeBatch?.sub_zone_id);

  // Auto-set category to harvest_readiness when batch is in harvest_window
  useEffect(() => {
    if (isHarvestWindow && !category) setCategory('harvest_readiness');
  }, [isHarvestWindow, category]);

  // Voice input
  const voice = useVoiceInput(transcript => setNote(prev => prev ? `${prev} ${transcript}` : transcript));

  // Load batches
  useEffect(() => {
    if (batchIdParam) return;
    setBatchesLoading(true);
    api.getBatches({ status: 'active' })
      .then(data => { setBatches(data.filter(b => b.status !== 'closed')); setBatchesLoading(false); })
      .catch(() => setBatchesLoading(false));
  }, [batchIdParam]);

  // Load locked batch
  useEffect(() => {
    if (!batchIdParam) return;
    setLockedBatchLoading(true);
    api.getBatch(batchIdParam)
      .then(b => { setLockedBatch(b); setLockedBatchLoading(false); })
      .catch(() => setLockedBatchLoading(false));
  }, [batchIdParam]);

  // Restore draft
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (!draft || draft.batchIdParam !== batchIdParam) return;
      if (draft.targetLevel) setTargetLevel(draft.targetLevel);
      if (draft.severity) setSeverity(draft.severity);
      if (draft.note) setNote(draft.note);
    } catch { /* ignore */ }
  }, [batchIdParam]);

  // Auto-save draft
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        batchIdParam, targetLevel, category, severity, note, savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [batchIdParam, targetLevel, category, severity, note]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Can save?
  const batchId = batchIdParam ? Number(batchIdParam) : activeBatch?.batch_id;
  const hasTarget = targetLevel === 'batch'
    || (targetLevel === 'row' && targetRowId !== '')
    || (targetLevel === 'container' && targetContainerId !== '');
  const hasSeverity = isHarvestReadiness || severity !== '';
  const canSave = Boolean(batchId) && Boolean(category) && hasTarget && hasSeverity;

  function resetForNext() {
    // Keep batch, target level and row selected — reset only content
    setCategory(isHarvestWindow ? 'harvest_readiness' : '');
    setSeverity('');
    setNote('');
    setMaturityPct(50);
    setReadyToHarvest(null);
    setHarvestPriority('');
    setSaveCount(c => c + 1);
  }

  async function handleSave(andNext = false) {
    setSaveError('');
    setSaving(true);

    const payload = {
      batch_id: batchId,
      row_id: targetLevel === 'row' ? targetRowId : null,
      container_id: targetLevel === 'container' ? targetContainerId : null,
      observed_at: new Date(observedAt).toISOString(),
      category,
      severity: isHarvestReadiness ? null : severity,
      note: note.trim() || null,
      maturity_pct: isHarvestReadiness && maturityPct !== '' ? maturityPct : null,
      ready_to_harvest: isHarvestReadiness && readyToHarvest !== null ? (readyToHarvest ? 1 : 0) : null,
      harvest_priority: isHarvestReadiness && harvestPriority !== '' ? parseInt(harvestPriority, 10) : null,
    };

    try {
      await api.createObservation(payload);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }

      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      setSummaryKey(k => k + 1);

      if (andNext) {
        setToast({ message: `Saved (${saveCount + 1})`, type: 'success' });
        resetForNext();
        setSaving(false);
      } else {
        setToast({ message: 'Saved · Synced', type: 'success' });
        setTimeout(() => {
          navigate(batchIdParam ? `/batches/${batchIdParam}` : '/observations');
        }, 1200);
      }
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || 'Failed to save. Please try again.');
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-700 font-medium text-sm hover:text-green-900" style={{ minHeight: '44px', minWidth: '44px' }}>
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Log Observation
          </h1>
          {isHarvestWindow && (
            <p className="text-xs text-orange-600 font-semibold">Harvest window active</p>
          )}
        </div>
        {saveCount > 0 && (
          <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
            {saveCount} saved
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-40 flex flex-col gap-4">

        {/* ── BATCH ── */}
        {batchIdParam ? (
          lockedBatchLoading ? (
            <div className="h-20 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ) : lockedBatch ? (
            <BatchCard batch={lockedBatch} />
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">Batch not found</div>
          )
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Batch <span className="text-red-400">*</span></label>
            {batchesLoading ? (
              <div className="h-24 bg-white rounded-2xl border animate-pulse" />
            ) : batches.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">No active batches.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {batches.map(batch => (
                  <button key={batch.batch_id} onClick={() => { setSelectedBatch(batch); setCategory(''); }}
                    className={`text-left w-full px-4 py-3 rounded-2xl border-2 transition-colors ${selectedBatch?.batch_id === batch.batch_id ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`}
                    style={{ minHeight: '64px' }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{batch.strain_name}</span>
                      {batch.sub_zone_id && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{batch.sub_zone_id}</span>}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[batch.status] ?? batch.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── READINESS SUMMARY (harvest_window only) ── */}
        {isHarvestWindow && batchId && (
          <ReadinessSummary batchId={batchId} refreshKey={summaryKey} />
        )}

        {/* ── TARGET ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Target <span className="text-red-400">*</span></label>
          <div className="flex gap-2 mb-2">
            {[
              { value: 'batch', label: activeBatch?.sub_zone_id ?? 'Whole batch' },
              { value: 'row', label: 'Row' },
              { value: 'container', label: 'Container' },
            ].map(opt => (
              <button key={opt.value} onClick={() => setTargetLevel(opt.value)}
                className={`flex-1 py-2.5 rounded-2xl border-2 text-xs font-semibold transition-colors ${targetLevel === opt.value ? 'border-green-600 bg-green-50 text-green-900' : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'}`}
                style={{ minHeight: '48px' }}
              >{opt.label}</button>
            ))}
          </div>

          {targetLevel === 'row' && (
            rowsForBatch.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {rowsForBatch.map(rowId => (
                  <button key={rowId} onClick={() => setTargetRowId(rowId)}
                    className={`px-3 py-2 rounded-xl border-2 text-sm font-mono font-semibold transition-colors ${targetRowId === rowId ? 'border-green-600 bg-green-50 text-green-900' : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'}`}
                    style={{ minHeight: '44px' }}
                  >{rowId}</button>
                ))}
              </div>
            ) : (
              <input type="text" placeholder="e.g. Z1-A-R3" value={targetRowId}
                onChange={e => setTargetRowId(e.target.value.toUpperCase())}
                className="w-full border border-gray-300 rounded-2xl px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
            )
          )}

          {targetLevel === 'container' && (
            <input type="text" placeholder="e.g. Z1-A-R3-C12" value={targetContainerId}
              onChange={e => setTargetContainerId(e.target.value.toUpperCase())}
              className="mt-2 w-full border border-gray-300 rounded-2xl px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
          )}
        </div>

        {/* ── CATEGORY ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Category <span className="text-red-400">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.filter(c => c.value !== 'harvest_readiness' || isHarvestWindow).map(cat => (
              <button key={cat.value} onClick={() => { setCategory(cat.value); setSeverity(''); }}
                className={`py-3 px-3 rounded-2xl border-2 text-sm font-semibold transition-colors text-left ${
                  category === cat.value ? `${cat.color} border-2` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                style={{ minHeight: '52px' }}
              >{cat.label}</button>
            ))}
          </div>
        </div>

        {/* ── HARVEST READINESS FIELDS ── */}
        {isHarvestReadiness && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-4 flex flex-col gap-4">
            <div className="text-xs font-bold text-orange-800 uppercase tracking-wide">Harvest Readiness Assessment</div>

            {/* Maturity % slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">Maturity %</label>
                <span className="text-2xl font-bold text-orange-700" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {maturityPct}%
                </span>
              </div>
              <input type="range" min={0} max={100} step={5}
                value={maturityPct}
                onChange={e => setMaturityPct(Number(e.target.value))}
                className="w-full accent-orange-600"
                style={{ height: '32px' }}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0% — not ready</span>
                <span>100% — peak</span>
              </div>
            </div>

            {/* Ready to harvest */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ready to harvest?</label>
              <div className="flex gap-3">
                {[{ val: true, label: 'Yes — Ready', style: 'border-green-500 bg-green-50 text-green-800' },
                  { val: false, label: 'No — Not yet', style: 'border-gray-300 bg-white text-gray-600' }
                ].map(opt => (
                  <button key={String(opt.val)} onClick={() => setReadyToHarvest(opt.val)}
                    className={`flex-1 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${readyToHarvest === opt.val ? opt.style : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                    style={{ minHeight: '52px' }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SEVERITY (not for harvest_readiness) ── */}
        {!isHarvestReadiness && category && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Severity <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button key={s.value} onClick={() => setSeverity(s.value)}
                  className={`flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-colors ${severity === s.value ? s.color : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                  style={{ minHeight: '52px' }}
                >{s.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── NOTE ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</label>
          <div className="relative">
            <textarea
              placeholder="Describe what you're observing… (long-press mic for voice)"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-300 rounded-2xl px-4 py-3 pr-14 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              rows={3}
            />
            {voice.supported && (
              <button
                onPointerDown={voice.listening ? voice.stop : voice.start}
                className={`absolute right-3 bottom-3 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${voice.listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                title={voice.listening ? 'Tap to stop' : 'Long-press for voice input'}
              >
                🎙
              </button>
            )}
          </div>
          {voice.listening && (
            <p className="text-xs text-red-500 font-semibold mt-1 ml-1">Listening… tap mic to stop</p>
          )}
        </div>

        {/* ── OPTIONAL FIELDS ── */}
        <div>
          <button onClick={() => setShowOptional(s => !s)}
            className="flex items-center gap-2 text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors"
            style={{ minHeight: '44px' }}
          >
            <span className={`transition-transform ${showOptional ? 'rotate-90' : ''}`}>▶</span>
            {showOptional ? 'Hide optional fields' : 'Show optional fields'}
          </button>

          {showOptional && (
            <div className="mt-3 flex flex-col gap-3">
              {isHarvestReadiness && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Harvest priority (1 = process first)</label>
                  <input type="number" inputMode="numeric" min="1" placeholder="—"
                    value={harvestPriority} onChange={e => setHarvestPriority(e.target.value)}
                    className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                    style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Observed at</label>
                <input type="datetime-local" value={observedAt} onChange={e => setObservedAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{ minHeight: '56px' }}
                />
              </div>
            </div>
          )}
        </div>

        {user && (
          <div className="text-xs text-gray-400">
            Observer: <span className="font-medium text-gray-600">{user.name}</span>
          </div>
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{saveError}</div>
        )}
      </div>

      {/* ── FIXED BUTTONS — Save + Log Another ── */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto flex flex-col gap-2">
          {/* "Log Another" — useful during row walks */}
          <button
            onClick={() => handleSave(true)}
            disabled={!canSave || saving}
            className={`w-full font-semibold rounded-2xl text-sm border-2 transition-all active:scale-[0.98] ${
              canSave && !saving
                ? 'border-green-700 text-green-700 bg-white hover:bg-green-50'
                : 'border-gray-200 text-gray-300 bg-white cursor-not-allowed'
            }`}
            style={{ minHeight: '48px' }}
          >
            Save + Log Another
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={!canSave || saving}
            className={`w-full font-bold rounded-2xl text-white shadow-lg transition-all active:scale-[0.98] ${
              saveFlash ? 'bg-green-500 scale-[0.99]'
                : canSave && !saving ? 'bg-green-800 hover:bg-green-900 active:bg-green-950'
                : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ minHeight: '64px', fontSize: '1.05rem' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Saving…
              </span>
            ) : 'Save Observation'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchCard({ batch }) {
  return (
    <div className={`border-2 rounded-2xl px-4 py-4 ${batch.status === 'harvest_window' || batch.status === 'harvesting' ? 'bg-orange-50 border-orange-300' : 'bg-white border-green-300'}`}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Fraunces, serif' }}>{batch.strain_name}</span>
        {batch.sub_zone_id && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{batch.sub_zone_id}</span>}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
      </div>
      <div className="text-xs text-gray-500">Day {batch.days_in_stage ?? 0} · {batch.plant_count_current ?? batch.plant_count_initial} plants</div>
    </div>
  );
}
