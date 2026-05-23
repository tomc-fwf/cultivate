import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmtDt(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return str; }
}

const SYNC_LABELS = {
  pending: { label: 'Pending', cls: 'bg-red-100 text-red-800' },
  synced: { label: 'Synced', cls: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-800' },
  not_required: { label: 'N/A', cls: 'bg-gray-100 text-gray-600' },
};

export default function PlantLossReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [batchId, setBatchId] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buildParams = () => {
    const p = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (batchId.trim()) p.batch_id = batchId.trim();
    if (syncStatus) p.metrc_sync_status = syncStatus;
    return p;
  };

  const preview = useCallback(() => {
    setLoading(true);
    setError('');
    api.getPlantLossesReport(buildParams())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFrom, dateTo, batchId, syncStatus]);

  const downloadCsv = () => api.downloadPlantLossesCsv(buildParams());

  const records = data?.records ?? null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Plant Loss & Destruction Log
      </h1>
      <p className="text-sm text-gray-500 mb-1">All mid-batch plant losses with METRC sync status</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-5 text-xs text-amber-800">
        Records all plant loss events. Rows flagged in red require METRC destruction reporting. Export for OCM compliance review.
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Batch ID (optional)</label>
            <input
              type="text"
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
              placeholder="e.g. 2026-AUTO-1"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">METRC sync status</label>
            <select
              value={syncStatus}
              onChange={e => setSyncStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="synced">Synced</option>
              <option value="failed">Failed</option>
              <option value="not_required">Not required</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={preview}
            disabled={loading}
            className="flex-1 bg-green-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {loading ? 'Loading…' : 'Preview'}
          </button>
          <button
            onClick={downloadCsv}
            className="px-4 bg-gray-100 text-gray-800 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200 transition-colors flex items-center gap-1.5"
            style={{ minHeight: '44px' }}
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {records !== null && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Results</span>
            <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {data.total_records} record{data.total_records !== 1 ? 's' : ''}
            </span>
          </div>

          {data.pending_metrc_count > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2">
              <span className="text-red-600 font-bold text-base">⚠</span>
              <span className="text-sm text-red-700 font-semibold">
                {data.pending_metrc_count} loss event{data.pending_metrc_count !== 1 ? 's' : ''} pending METRC destruction reporting
              </span>
            </div>
          )}

          {records.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
              No plant loss events match the selected filters.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">Occurred</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">Discovered</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Batch</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Container</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">METRC Tag</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Cause</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Disposition</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Reported by</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">METRC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.map((r, i) => {
                      const syncMeta = SYNC_LABELS[r.metrc_sync_status] ?? { label: r.metrc_sync_status, cls: 'bg-gray-100 text-gray-600' };
                      return (
                        <tr key={i} className={`transition-colors ${r.pending_metrc ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {r.pending_metrc && <span className="text-red-500 font-bold mr-1">⚠</span>}
                            {fmtDt(r.occurred_at)}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDt(r.discovered_at)}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.batch_name ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono">{r.container_id ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono text-xs">{r.metrc_plant_tag ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{r.loss_type?.replace(/_/g, ' ') ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{r.loss_cause ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-700 text-center font-semibold">{r.plant_count ?? 1}</td>
                          <td className="px-3 py-2 text-gray-600">{r.plant_disposition?.replace(/_/g, ' ') ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{r.reported_by_name ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${syncMeta.cls}`}>
                              {syncMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
