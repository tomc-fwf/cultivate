import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmtDt(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return str; }
}

const SYNC_CHIP = {
  pending:      'bg-amber-100 text-amber-800',
  synced:       'bg-green-100 text-green-800',
  failed:       'bg-red-100 text-red-800',
  not_required: 'bg-gray-100 text-gray-600',
};

export default function MetrcTagAssignmentExport() {
  const navigate = useNavigate();
  const [batchId, setBatchId] = useState('');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const buildParams = () => {
    const p = {};
    if (batchId.trim()) p.batch_id = batchId.trim();
    return p;
  };

  const preview = useCallback(() => {
    setLoading(true);
    setError('');
    api.getMetrcTagAssignments(buildParams())
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [batchId]);

  const downloadCsv = () => api.downloadMetrcTagAssignmentsCsv(buildParams());

  const assignments  = data?.assignments ?? [];
  const unsyncedCount = assignments.filter(a => a.metrc_sync_status === 'pending' || a.metrc_sync_status === 'failed').length;

  // Group assignments by batch_id
  const batchOrder = [];
  const grouped    = {};
  for (const a of assignments) {
    const key = a.batch_id;
    if (!grouped[key]) { grouped[key] = []; batchOrder.push(key); }
    grouped[key].push(a);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        METRC Tag Assignments
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Active plant-to-container METRC tag assignments · grouped by batch
      </p>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Batch ID (optional)</label>
            <input
              type="number" value={batchId} onChange={e => setBatchId(e.target.value)}
              placeholder="All active batches"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
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

      {data !== null && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Results</span>
            <div className="flex items-center gap-2">
              {unsyncedCount > 0 && (
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
                  {unsyncedCount} unsynced
                </span>
              )}
              <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
                {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
              No active tag assignments found.
            </div>
          ) : (
            <div className="space-y-4">
              {batchOrder.map(bId => {
                const batchAssignments = grouped[bId] ?? [];
                const first = batchAssignments[0];
                return (
                  <div key={bId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-700">
                        {first?.strain_name ?? `Batch #${bId}`}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {first?.metrc_plant_batch_uid ?? 'No METRC UID'}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">{batchAssignments.length} plants</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-50">
                            <th className="px-3 py-2 text-left font-semibold text-gray-500">Container</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-500">METRC Tag</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-500">Placed At</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-500">Tagged At</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-500">Unassigned</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-500">Sync</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {batchAssignments.map(a => (
                            <tr key={a.assignment_id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2 font-mono text-gray-700">{a.container_id ?? '—'}</td>
                              <td className="px-3 py-2 font-mono text-gray-700 text-xs">{a.metrc_plant_tag ?? '—'}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDt(a.placed_at)}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDt(a.tagged_at)}</td>
                              <td className="px-3 py-2 text-gray-500">{a.unassigned_at ? fmtDt(a.unassigned_at) : <span className="text-green-600 font-medium">Active</span>}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SYNC_CHIP[a.metrc_sync_status] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {a.metrc_sync_status ?? '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
