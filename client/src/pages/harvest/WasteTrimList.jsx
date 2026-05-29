import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../../api';

function fmtDate(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ts.slice(0, 10); }
}

function fmtWeight(weight, unit) {
  if (weight == null) return '—';
  return `${weight} ${unit || ''}`.trim();
}

const REASON_LABELS = {
  defoliation: 'Defoliation',
  lollipoping: 'Lollipoping',
  ipm_removal: 'IPM Removal',
  disease_removal: 'Disease Removal',
  pest_damage: 'Pest Damage',
  physical_damage: 'Physical Damage',
  senescence: 'Senescence',
  other: 'Other',
};

const DISPOSITION_OPTIONS = [
  { value: 'composted',   label: 'Composted' },
  { value: 'incinerated', label: 'Incinerated' },
  { value: 'quarantined', label: 'Quarantined' },
  { value: 'tested',      label: 'Tested' },
  { value: 'other',       label: 'Other' },
];

const STATUS_CHIP = {
  collected: 'bg-amber-100 text-amber-800 border-amber-200',
  held:      'bg-blue-100 text-blue-800 border-blue-200',
  disposed:  'bg-gray-100 text-gray-500 border-gray-200',
  reported:  'bg-green-100 text-green-700 border-green-200',
};

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

function DisposeModal({ record, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [disposition, setDisposition] = useState('composted');
  const [disposedAt, setDisposedAt] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!disposition || !disposedAt) { setError('Disposition and date are required.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.disposeWasteTrim(record.waste_trim_id, { disposition, disposed_at: disposedAt, notes: notes || null });
      onSaved();
    } catch (e) {
      setError(e.message || 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl px-5 pt-5 pb-24 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
              Mark Disposed
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {fmtWeight(record.wet_weight, record.weight_unit)} · {REASON_LABELS[record.trim_reason] ?? record.trim_reason} · {fmtDate(record.trimmed_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" style={{ minHeight: '44px', minWidth: '44px' }}>✕</button>
        </div>

        {/* Disposition chips */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Disposition</label>
          <div className="flex flex-wrap gap-2">
            {DISPOSITION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDisposition(opt.value)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors ${
                  disposition === opt.value
                    ? 'border-green-600 bg-green-50 text-green-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                }`}
                style={{ minHeight: '44px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Disposed Date</label>
          <input
            type="date"
            value={disposedAt}
            onChange={e => setDisposedAt(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            style={{ minHeight: '48px', fontFamily: 'JetBrains Mono, monospace' }}
          />
        </div>

        {/* Notes */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Disposal location, method details…"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm mb-4">{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-green-700 text-white font-bold rounded-2xl py-4 text-base hover:bg-green-800 active:bg-green-900 transition-colors disabled:opacity-50"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Saving…' : 'Confirm Disposal'}
        </button>
      </div>
    </div>
  );
}

const STATUS_ORDER = ['collected', 'held', 'disposed', 'reported'];

export default function WasteTrimList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get('batch_id');

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disposeTarget, setDisposeTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  function load() {
    setLoading(true);
    setError('');
    const params = batchId ? { batch_id: batchId } : {};
    api.getWasteTrim(params)
      .then(data => { setRecords(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [batchId]);

  // Group by waste_status in the required order
  const grouped = STATUS_ORDER.reduce((acc, status) => {
    const group = records.filter(r => r.waste_status === status);
    if (group.length > 0) acc.push({ status, items: group });
    return acc;
  }, []);

  const pendingCount = records.filter(r => r.waste_status === 'collected' || r.waste_status === 'held').length;

  async function handleHold(rec) {
    setActionLoading(rec.waste_trim_id);
    try {
      await api.holdWasteTrim(rec.waste_trim_id, {});
      setToast({ message: 'Marked as held', type: 'success' });
      load();
    } catch (e) {
      setToast({ message: e.message || 'Failed to update', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReport(rec) {
    setActionLoading(rec.waste_trim_id);
    try {
      await api.reportWasteTrim(rec.waste_trim_id, { metrc_sync_status: 'synced' });
      setToast({ message: 'Marked as reported to METRC', type: 'success' });
      load();
    } catch (e) {
      setToast({ message: e.message || 'Failed to update', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-10">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      {disposeTarget && (
        <DisposeModal
          record={disposeTarget}
          onClose={() => setDisposeTarget(null)}
          onSaved={() => {
            setDisposeTarget(null);
            setToast({ message: 'Marked as disposed', type: 'success' });
            load();
          }}
        />
      )}

      {/* Back */}
      <button
        onClick={() => batchId ? navigate(`/harvest/${batchId}`) : navigate(-1)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
        style={{ minHeight: '44px' }}
      >
        ← {batchId ? 'Harvest Dashboard' : 'Back'}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'Fraunces, serif' }}>
            Waste Trim
          </h1>
          {pendingCount > 0 && (
            <p className="text-sm text-amber-700 mt-0.5 font-medium">{pendingCount} record{pendingCount !== 1 ? 's' : ''} awaiting disposal</p>
          )}
        </div>
        {batchId && (
          <Link
            to={`/harvest/waste-trim/new?batch_id=${batchId}`}
            className="text-sm font-semibold bg-amber-50 border-2 border-amber-200 text-amber-900 rounded-2xl px-4 hover:border-amber-400 transition-colors flex items-center gap-1"
            style={{ minHeight: '48px', textDecoration: 'none' }}
          >
            ✂️ Record Trim
          </Link>
        )}
      </div>

      {loading && (
        <div className="text-gray-500 text-sm py-6 text-center">Loading…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-sm text-gray-500 text-center">
          No waste trim records found.
          {batchId && (
            <div className="mt-2">
              <Link to={`/harvest/waste-trim/new?batch_id=${batchId}`} className="text-green-700 font-semibold">Record the first trim →</Link>
            </div>
          )}
        </div>
      )}

      {!loading && grouped.map(({ status, items }) => (
        <div key={status} className="mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            {status.charAt(0).toUpperCase() + status.slice(1)}
            <span className="ml-1.5 font-normal text-gray-300">({items.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {items.map(rec => (
              <div
                key={rec.waste_trim_id}
                className={`bg-white border rounded-2xl p-4 ${
                  status === 'collected' ? 'border-amber-200' : status === 'held' ? 'border-blue-200' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_CHIP[status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {status}
                      </span>
                      {rec.container_id && (
                        <span className="font-mono text-xs text-gray-600">{rec.container_id}</span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-semibold text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmtWeight(rec.wet_weight, rec.weight_unit)}
                      </span>
                      <span className="text-sm text-gray-500">{REASON_LABELS[rec.trim_reason] ?? rec.trim_reason}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Trimmed {fmtDate(rec.trimmed_at)}
                      {rec.disposition && <span className="ml-2 capitalize">· {rec.disposition}</span>}
                      {rec.disposed_at && <span className="ml-2">disposed {fmtDate(rec.disposed_at)}</span>}
                    </div>
                    {rec.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">{rec.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {status === 'collected' && (
                      <button
                        onClick={() => handleHold(rec)}
                        disabled={actionLoading === rec.waste_trim_id}
                        className="text-xs font-semibold bg-blue-50 border border-blue-300 text-blue-800 rounded-xl px-3 hover:bg-blue-100 transition-colors disabled:opacity-50"
                        style={{ minHeight: '44px' }}
                      >
                        {actionLoading === rec.waste_trim_id ? '…' : 'Mark Held'}
                      </button>
                    )}
                    {(status === 'collected' || status === 'held') && (
                      <button
                        onClick={() => setDisposeTarget(rec)}
                        disabled={actionLoading === rec.waste_trim_id}
                        className="text-xs font-semibold bg-green-50 border border-green-300 text-green-800 rounded-xl px-3 hover:bg-green-100 transition-colors disabled:opacity-50"
                        style={{ minHeight: '44px' }}
                      >
                        Mark Disposed
                      </button>
                    )}
                    {status === 'disposed' && (
                      <button
                        onClick={() => handleReport(rec)}
                        disabled={actionLoading === rec.waste_trim_id}
                        className="text-xs font-semibold bg-purple-50 border border-purple-300 text-purple-800 rounded-xl px-3 hover:bg-purple-100 transition-colors disabled:opacity-50"
                        style={{ minHeight: '44px' }}
                      >
                        {actionLoading === rec.waste_trim_id ? '…' : 'Mark Reported'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
