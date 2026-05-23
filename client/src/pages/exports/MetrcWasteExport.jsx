import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmtDt(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return str; }
}

const SOURCE_CHIP = {
  waste_trim:  'bg-amber-100 text-amber-800',
  plant_loss:  'bg-red-100 text-red-800',
};

const SYNC_CHIP = {
  pending:      'bg-amber-100 text-amber-800',
  synced:       'bg-green-100 text-green-800',
  failed:       'bg-red-100 text-red-800',
  not_required: 'bg-gray-100 text-gray-600',
};

export default function MetrcWasteExport() {
  const navigate = useNavigate();
  const [batchId, setBatchId]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [rows, setRows]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const buildParams = () => {
    const p = {};
    if (batchId.trim()) p.batch_id  = batchId.trim();
    if (dateFrom)       p.date_from = dateFrom;
    if (dateTo)         p.date_to   = dateTo;
    return p;
  };

  const preview = useCallback(() => {
    setLoading(true);
    setError('');
    api.getMetrcWasteExport(buildParams())
      .then(d  => { setRows(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [batchId, dateFrom, dateTo]);

  const downloadCsv = () => api.downloadMetrcWasteCsv(buildParams());

  const trimCount    = rows ? rows.filter(r => r.event_type === 'waste_trim').length : 0;
  const lossCount    = rows ? rows.filter(r => r.event_type === 'plant_loss').length : 0;
  const pendingCount = rows ? rows.filter(r => r.metrc_sync_status === 'pending' || r.metrc_sync_status === 'failed').length : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        METRC Waste Export
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Unified waste trim and plant loss events · formatted for METRC Record Destruction
      </p>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Batch ID (optional)</label>
            <input
              type="number" value={batchId} onChange={e => setBatchId(e.target.value)}
              placeholder="All batches"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={preview} disabled={loading}
            className="flex-1 bg-green-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {loading ? 'Loading…' : 'Preview'}
          </button>
          <button
            onClick={downloadCsv}
            className="px-4 bg-gray-100 text-gray-800 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200 transition-colors"
            style={{ minHeight: '44px' }}
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {rows !== null && (
        <div>
          {/* Summary counts */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-amber-800">{trimCount}</div>
              <div className="text-xs text-amber-600 font-medium">Waste Trim Events</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-red-800">{lossCount}</div>
              <div className="text-xs text-red-600 font-medium">Plant Loss Events</div>
            </div>
            <div className={`border rounded-xl p-3 text-center ${pendingCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`text-2xl font-bold ${pendingCount > 0 ? 'text-red-800' : 'text-gray-600'}`}>{pendingCount}</div>
              <div className={`text-xs font-medium ${pendingCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>Pending METRC Sync</div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Results</span>
            <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {rows.length} event{rows.length !== 1 ? 's' : ''}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
              No waste events found for the selected filters.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Source</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Date</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Tag …last4</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Reason / Loss Type</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Wet Wt</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Status / Disposition</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Applicator</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => {
                      const flagRow = r.metrc_sync_status === 'pending' || r.metrc_sync_status === 'failed';
                      return (
                        <tr key={i} className={`hover:bg-gray-50 transition-colors ${flagRow ? 'bg-red-50/40' : ''}`}>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SOURCE_CHIP[r.event_type] ?? 'bg-gray-100 text-gray-700'}`}>
                              {r.event_type === 'waste_trim' ? 'Trim' : 'Plant Loss'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDt(r.event_date)}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">
                            {r.metrc_tag ? `…${String(r.metrc_tag).slice(-4)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{r.reason ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                            {r.wet_weight != null ? `${r.wet_weight} ${r.weight_unit ?? ''}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {r.waste_status ?? r.disposition ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{r.applicator_name ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SYNC_CHIP[r.metrc_sync_status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {r.metrc_sync_status ?? '—'}
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
