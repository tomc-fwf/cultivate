import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto`}>
        {type === 'success' ? '✓ ' : '✗ '}{message}
      </div>
    </div>
  );
}

function fmtDate(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return ts; }
}

export default function WeatherEventClose() {
  const { harvestBatchId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const batchId = searchParams.get('batch_id');
  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  // Context
  const [harvestBatch, setHarvestBatch] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState('');

  // Form fields
  const [closeNotes, setCloseNotes] = useState('');
  const [ambientTempF, setAmbientTempF] = useState('');
  const [ambientRh, setAmbientRh] = useState('');
  const [windSpeedMph, setWindSpeedMph] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  // Load harvest batch info via harvest status
  useEffect(() => {
    if (!batchId) {
      setContextError('batch_id query param is required.');
      setContextLoading(false);
      return;
    }
    setContextLoading(true);
    api.getHarvestStatus(batchId)
      .then(data => {
        const hb = data.harvest_batches?.find(h => String(h.harvest_batch_id) === harvestBatchId);
        if (!hb) {
          setContextError('Harvest batch not found.');
        } else if (hb.status !== 'in_progress') {
          setContextError(`Harvest batch is not in progress (status: ${hb.status}).`);
        } else {
          setHarvestBatch(hb);
        }
        setContextLoading(false);
      })
      .catch(e => { setContextError(e.message); setContextLoading(false); });
  }, [batchId, harvestBatchId]);

  // Role gate — redirect if not supervisor
  useEffect(() => {
    if (!isSupervisor) navigate(-1);
  }, [isSupervisor, navigate]);

  const MIN_NOTES_LENGTH = 20;
  const canSave = closeNotes.trim().length >= MIN_NOTES_LENGTH;

  async function handleSave() {
    setSaveError('');
    setSaving(true);
    try {
      await api.forceCloseHarvestBatch(Number(harvestBatchId), {
        close_notes: closeNotes.trim(),
        ambient_temp_f: ambientTempF !== '' ? parseFloat(ambientTempF) : null,
        ambient_rh: ambientRh !== '' ? parseFloat(ambientRh) : null,
        wind_speed_mph: windSpeedMph !== '' ? parseFloat(windSpeedMph) : null,
      });
      setToast({ message: 'Harvest batch closed. New batch created.', type: 'success' });
      setTimeout(() => {
        if (batchId) navigate(`/harvest/${batchId}`);
        else navigate('/batches');
      }, 1800);
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || 'Failed to force-close harvest batch.');
    }
  }

  if (!isSupervisor) return null;

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
          Force Close — Weather Event
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-36 flex flex-col gap-4">

        {/* Role badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">Supervisor Action</span>
        </div>

        {/* Red warning */}
        <div className="bg-red-100 border-2 border-red-400 rounded-2xl px-5 py-5 text-red-900">
          <div className="text-base font-bold mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
            ⚠ Force-Closing Harvest Batch
          </div>
          <div className="text-sm space-y-1">
            <div>This will <strong>close the current harvest batch</strong> and create a new one for remaining plants.</div>
            <div>The cultivation batch remains in <strong>harvesting</strong> status — harvest continues under the new batch.</div>
            <div>Use this only when a major weather event disrupts harvest conditions mid-harvest.</div>
          </div>
        </div>

        {/* Context */}
        {contextLoading ? (
          <div className="h-20 bg-white rounded-2xl border border-gray-200 animate-pulse" />
        ) : contextError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{contextError}</div>
        ) : harvestBatch ? (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Current Harvest Batch (to be closed)</div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                {harvestBatch.batch_type === 'harvest' ? 'Harvest Batch (HB)' : 'Partial Harvest Batch (MB)'}
              </span>
              <span className="text-xs text-gray-400 font-mono">#{harvestBatch.sequence_number}</span>
            </div>
            {harvestBatch.metrc_name && (
              <div className="font-mono text-xs text-gray-500 mb-1">{harvestBatch.metrc_name}</div>
            )}
            <div className="text-xs text-gray-500">
              Started {fmtDate(harvestBatch.started_at)} ·{' '}
              {(harvestBatch.final_harvest_count ?? 0) + (harvestBatch.partial_harvest_count ?? 0)} events recorded
            </div>
          </div>
        ) : null}

        {/* Close notes — required */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Weather Event Description <span className="text-red-400">*</span>
          </label>
          <textarea
            placeholder="Describe the weather event that is forcing this close (e.g. 'Severe thunderstorm, wind gusts to 60 mph, forced to halt harvest and cover remaining plants')…"
            value={closeNotes}
            onChange={e => setCloseNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            rows={4}
          />
          <div className={`text-xs mt-1 ${closeNotes.trim().length < MIN_NOTES_LENGTH ? 'text-amber-600' : 'text-green-600'}`}>
            {closeNotes.trim().length < MIN_NOTES_LENGTH
              ? `${MIN_NOTES_LENGTH - closeNotes.trim().length} more characters required`
              : '✓ Description provided'}
          </div>
        </div>

        {/* New batch conditions */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            New Batch Conditions (for the replacement harvest batch)
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Temp (°F)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="—"
                value={ambientTempF}
                onChange={e => setAmbientTempF(e.target.value)}
                className="w-full border border-gray-300 rounded-2xl px-3 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">RH (%)</label>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                max="100"
                placeholder="—"
                value={ambientRh}
                onChange={e => setAmbientRh(e.target.value)}
                className="w-full border border-gray-300 rounded-2xl px-3 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Wind (mph)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="—"
                value={windSpeedMph}
                onChange={e => setWindSpeedMph(e.target.value)}
                className="w-full border border-gray-300 rounded-2xl px-3 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          </div>
        </div>

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
              canSave && !saving && !contextLoading && !contextError
                ? 'bg-red-700 hover:bg-red-800 active:bg-red-900'
                : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ minHeight: '64px', fontSize: '1.05rem' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Closing Batch…
              </span>
            ) : 'Force Close — Create New Harvest Batch'}
          </button>
        </div>
      </div>
    </div>
  );
}
