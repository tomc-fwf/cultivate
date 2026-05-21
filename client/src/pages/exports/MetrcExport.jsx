import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return String(isoStr); }
}

const TYPE_CHIP = {
  fertigation: 'bg-blue-100 text-blue-800',
  foliar:      'bg-green-100 text-green-800',
  pesticide:   'bg-red-100 text-red-800',
  amendment:   'bg-amber-100 text-amber-800',
};

export default function MetrcExport() {
  const navigate = useNavigate();
  const [batchId, setBatchId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const preview = useCallback(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (batchId) params.batch_id = batchId;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.getMetrcAdditivesExport(params)
      .then(data => { setRows(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [batchId, dateFrom, dateTo]);

  const downloadCsv = () => {
    const params = {};
    if (batchId) params.batch_id = batchId;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.downloadMetrcCsv(params);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        METRC Record Additives
      </h1>
      <p className="text-sm text-gray-500 mb-5">All four application types · formatted for METRC entry</p>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Batch ID (optional)</label>
            <input
              type="number"
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
              placeholder="All batches"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
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
        <div className="flex gap-2 mt-3">
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

      {rows !== null && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Results</span>
            <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {rows.length} application{rows.length !== 1 ? 's' : ''}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
              No applications found for the selected filters.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Applied</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Batch</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Product</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Lot #</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Rate</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Volume</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Applicator</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_CHIP[r.application_type] ?? 'bg-gray-100 text-gray-700'}`}>
                            {r.application_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDateTime(r.applied_at)}</td>
                        <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.batch_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-800 font-medium">{r.product_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.lot_number ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {r.rate != null ? `${r.rate} ${r.rate_unit ?? ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {r.volume_applied != null ? `${r.volume_applied} ${r.volume_unit ?? ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.applicator_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.location ?? '—'}</td>
                      </tr>
                    ))}
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
