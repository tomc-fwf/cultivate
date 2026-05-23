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

const SYNC_CHIP = {
  pending:      'bg-amber-100 text-amber-800',
  synced:       'bg-green-100 text-green-800',
  failed:       'bg-red-100 text-red-800',
  not_required: 'bg-gray-100 text-gray-600',
};

export default function MetrcHarvestExport() {
  const navigate = useNavigate();
  const [batchId, setBatchId]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const buildParams = () => {
    const p = {};
    if (batchId.trim()) p.batch_id = batchId.trim();
    if (dateFrom)       p.date_from = dateFrom;
    if (dateTo)         p.date_to   = dateTo;
    return p;
  };

  const preview = useCallback(() => {
    setLoading(true);
    setError('');
    api.getHarvestRecordsReport(buildParams())
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [batchId, dateFrom, dateTo]);

  const downloadCsv = () => api.downloadHarvestRecordsCsv(buildParams());

  const events       = data?.events ?? [];
  const batchTotals  = data?.harvest_batch_totals ?? [];
  const missingUid   = events.some(e => !e.metrc_harvest_batch_uid);

  // Group events by harvest_batch_id preserving order of first occurrence
  const batchIds = [];
  const grouped  = {};
  for (const e of events) {
    const key = e.harvest_batch_id;
    if (!grouped[key]) { grouped[key] = []; batchIds.push(key); }
    grouped[key].push(e);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        METRC Harvest Export
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Harvest events with per-batch weight totals · formatted for METRC submission
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

      {data !== null && missingUid && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 text-sm text-amber-800">
          ⚠️ Some rows are missing a METRC harvest batch UID — these must be assigned in METRC before submission.
        </div>
      )}

      {data !== null && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Results</span>
            <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          </div>

          {events.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
              No harvest events found for the selected filters.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Container</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Tag …last4</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Product</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Wet Wt</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Harvested</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Applicator</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Harvest UID</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchIds.map(hbId => {
                      const batchEvents = grouped[hbId] ?? [];
                      const total       = batchTotals.find(t => t.harvest_batch_id === hbId);
                      const uid         = batchEvents[0]?.metrc_harvest_batch_uid;
                      const missingBatchUid = !uid;

                      return (
                        <TableRowGroup key={hbId}>
                          {batchEvents.map(e => (
                            <tr key={e.harvest_event_id} className={`border-t border-gray-50 hover:bg-gray-50 ${missingBatchUid ? 'bg-amber-50/30' : ''}`}>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${e.event_type === 'final_harvest' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {e.event_type === 'final_harvest' ? 'Final' : 'Partial'}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-gray-700">{e.container_id ?? '—'}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">
                                {e.metrc_plant_tag ? `…${String(e.metrc_plant_tag).slice(-4)}` : '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{e.product_type ?? '—'}</td>
                              <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                                {e.wet_weight != null ? `${e.wet_weight} ${e.weight_unit ?? ''}` : '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDt(e.harvested_at)}</td>
                              <td className="px-3 py-2 text-gray-600">{e.applicator_name ?? '—'}</td>
                              <td className={`px-3 py-2 font-mono ${missingBatchUid ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                                {uid ?? <span className="text-amber-600">⚠ missing</span>}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SYNC_CHIP[e.metrc_sync_status] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {e.metrc_sync_status ?? '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {/* Per-batch subtotal row */}
                          {total && (
                            <tr className="border-t-2 border-gray-200 bg-gray-50">
                              <td colSpan={4} className="px-3 py-2 font-bold text-gray-800 text-xs">
                                Harvest Batch #{hbId} Totals
                              </td>
                              <td colSpan={5} className="px-3 py-2">
                                {total.totals.map((t, i) => (
                                  <span key={i} className="font-bold text-gray-800 text-xs mr-4">
                                    {t.product_type}: {t.total_wet_weight} {t.weight_unit}
                                    <span className="font-normal text-gray-500 ml-1">({t.event_count} events)</span>
                                  </span>
                                ))}
                              </td>
                            </tr>
                          )}
                        </TableRowGroup>
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

// Wrapper so we can use React.Fragment with a key on a group of <tr> elements
function TableRowGroup({ children }) {
  return <>{children}</>;
}
