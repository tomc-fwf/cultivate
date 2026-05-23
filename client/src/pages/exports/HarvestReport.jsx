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
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  synced: { label: 'Synced', cls: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-800' },
  not_required: { label: 'N/A', cls: 'bg-gray-100 text-gray-600' },
};

const TYPE_COLORS = {
  partial_harvest: 'bg-blue-100 text-blue-800',
  final_harvest: 'bg-green-100 text-green-800',
};

export default function HarvestReport() {
  const navigate = useNavigate();
  const [batchId, setBatchId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [eventType, setEventType] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedBatches, setExpandedBatches] = useState({});

  const buildParams = () => {
    const p = {};
    if (batchId.trim()) p.batch_id = batchId.trim();
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (eventType) p.event_type = eventType;
    return p;
  };

  const preview = useCallback(() => {
    setLoading(true);
    setError('');
    api.getHarvestRecordsReport(buildParams())
      .then(d => { setData(d); setExpandedBatches({}); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [batchId, dateFrom, dateTo, eventType]);

  const downloadCsv = () => api.downloadHarvestRecordsCsv(buildParams());

  const toggleBatch = (id) => setExpandedBatches(prev => ({ ...prev, [id]: !prev[id] }));

  const totals = data?.harvest_batch_totals ?? null;
  const events = data?.events ?? null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Harvest Records Report
      </h1>
      <p className="text-sm text-gray-500 mb-1">Partial and final harvest events with per-batch weight totals</p>
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-5 text-xs text-green-800">
        Harvest batch totals are used for METRC submission. Rows flagged in amber are missing the METRC harvest batch UID — these must be assigned before METRC submission.
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">Event type</label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All types</option>
              <option value="partial_harvest">Partial harvest</option>
              <option value="final_harvest">Final harvest</option>
            </select>
          </div>
        </div>
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

      {totals !== null && (
        <>
          {/* Harvest batch totals */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Harvest Batch Totals</span>
            <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {totals.length} harvest batch{totals.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {totals.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm mb-4">
              No harvest batches match the selected filters.
            </div>
          ) : (
            <div className="space-y-2 mb-6">
              {totals.map(hb => (
                <div key={hb.harvest_batch_id} className={`bg-white border rounded-2xl overflow-hidden ${hb.missing_uid ? 'border-amber-300' : 'border-gray-200'}`}>
                  <button
                    onClick={() => toggleBatch(hb.harvest_batch_id)}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors"
                    style={{ minHeight: '56px' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {hb.missing_uid && (
                          <span className="text-amber-600 font-bold text-sm">⚠</span>
                        )}
                        <span className="text-sm font-semibold text-gray-800">{hb.batch_name ?? `Harvest Batch ${hb.harvest_batch_id}`}</span>
                        {hb.strain_name && (
                          <span className="text-xs text-gray-500">· {hb.strain_name}</span>
                        )}
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">#{hb.sequence_number}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {hb.missing_uid
                          ? <span className="text-amber-700 font-semibold">Missing METRC harvest UID</span>
                          : <span className="font-mono text-gray-600">{hb.metrc_harvest_batch_uid}</span>
                        }
                        <span className="ml-2 text-gray-400">· {hb.event_count} event{hb.event_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <span className="text-gray-400 flex-shrink-0 mt-0.5">{expandedBatches[hb.harvest_batch_id] ? '▲' : '▼'}</span>
                  </button>

                  {/* Weight totals */}
                  {hb.totals && hb.totals.length > 0 && (
                    <div className="px-4 pb-3 flex flex-wrap gap-2">
                      {hb.totals.map((t, ti) => (
                        <div key={ti} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs">
                          <div className="font-semibold text-gray-700 capitalize">{t.product_type}</div>
                          <div className="text-gray-900 font-bold text-sm">{Number(t.total_weight).toFixed(2)} {t.weight_unit}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expanded individual events for this batch */}
                  {expandedBatches[hb.harvest_batch_id] && events && (
                    <div className="border-t border-gray-100">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Harvested</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Type</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Container</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">METRC Tag</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Product</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Weight</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Applicator</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Sync</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {events
                              .filter(e => e.harvest_batch_id === hb.harvest_batch_id)
                              .map((e, ei) => {
                                const syncMeta = SYNC_LABELS[e.metrc_sync_status] ?? { label: e.metrc_sync_status, cls: 'bg-gray-100 text-gray-600' };
                                return (
                                  <tr key={ei} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDt(e.harvested_at)}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[e.event_type] ?? 'bg-gray-100 text-gray-700'}`}>
                                        {e.event_type === 'partial_harvest' ? 'Partial' : 'Final'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-600 font-mono">{e.container_id ?? '—'}</td>
                                    <td className="px-3 py-2 text-gray-600 font-mono text-xs">{e.metrc_plant_tag ?? '—'}</td>
                                    <td className="px-3 py-2 text-gray-700 capitalize">{e.product_type ?? '—'}</td>
                                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-semibold">
                                      {e.wet_weight != null ? `${e.wet_weight} ${e.weight_unit ?? ''}` : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{e.applicator_name ?? '—'}</td>
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
              ))}
            </div>
          )}

          {/* All events flat view */}
          {events !== null && events.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">All Events</span>
                <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  {data.total_events} total
                </span>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">Harvested</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Type</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Batch</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Strain</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Container</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">METRC Tag</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Product</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Weight</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">METRC Batch UID</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Applicator</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Sync</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {events.map((e, i) => {
                        const syncMeta = SYNC_LABELS[e.metrc_sync_status] ?? { label: e.metrc_sync_status, cls: 'bg-gray-100 text-gray-600' };
                        return (
                          <tr key={i} className={`transition-colors ${e.missing_uid ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {e.missing_uid && <span className="text-amber-500 font-bold mr-1">⚠</span>}
                              {fmtDt(e.harvested_at)}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[e.event_type] ?? 'bg-gray-100 text-gray-700'}`}>
                                {e.event_type === 'partial_harvest' ? 'Partial' : 'Final'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{e.batch_name ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.strain_name ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono">{e.container_id ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono text-xs">{e.metrc_plant_tag ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-700 capitalize">{e.product_type ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-semibold">
                              {e.wet_weight != null ? `${e.wet_weight} ${e.weight_unit ?? ''}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-600 font-mono text-xs">{e.metrc_harvest_batch_uid ?? <span className="text-amber-600 font-semibold">Missing</span>}</td>
                            <td className="px-3 py-2 text-gray-600">{e.applicator_name ?? '—'}</td>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
