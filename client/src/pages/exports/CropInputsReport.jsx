import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const CLASS_COLORS = {
  fertigation: 'bg-blue-100 text-blue-800',
  foliar: 'bg-green-100 text-green-800',
  pesticide: 'bg-red-100 text-red-800',
  amendment: 'bg-amber-100 text-amber-800',
};

function fmtDt(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return str; }
}

export default function CropInputsReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [batchId, setBatchId] = useState('');
  const [inputClass, setInputClass] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buildParams = () => {
    const p = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (batchId.trim()) p.batch_id = batchId.trim();
    if (inputClass) p.input_class = inputClass;
    return p;
  };

  const preview = useCallback(() => {
    setLoading(true);
    setError('');
    api.getCropInputsReport(buildParams())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFrom, dateTo, batchId, inputClass]);

  const downloadCsv = () => api.downloadCropInputsCsv(buildParams());

  const rows = data?.rows ?? null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Rule 4770 Crop Input Log
      </h1>
      <p className="text-sm text-gray-500 mb-1">All four application classes in chronological order · MN Rule 4770</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-5 text-xs text-blue-800">
        Unified crop input log across fertigation, foliar, pesticide, and soil amendment applications.
        Fertigation rows are expanded to individual ingredients. Required for MN Statute 342.25 five-year cultivation records.
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">Input class</label>
            <select
              value={inputClass}
              onChange={e => setInputClass(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All classes</option>
              <option value="fertigation">Fertigation</option>
              <option value="foliar">Foliar</option>
              <option value="pesticide">Pesticide</option>
              <option value="amendment">Amendment</option>
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

      {rows !== null && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Results</span>
            <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {data.total_rows} row{data.total_rows !== 1 ? 's' : ''}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
              No crop input applications match the selected filters.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">Date / Time</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Class</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Batch</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Location</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Product</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">EPA Reg #</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Quantity</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Lot #</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Applicator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDt(r.applied_at)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${CLASS_COLORS[r.input_class] ?? 'bg-gray-100 text-gray-700'}`}>
                            {r.input_class}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.batch_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.location ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-800 font-medium">{r.product_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono">{r.epa_reg_no ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.quantity_display ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.lot_number ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.applicator_name ?? '—'}</td>
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
