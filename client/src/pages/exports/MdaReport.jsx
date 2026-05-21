import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return str; }
}

export default function MdaReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const preview = useCallback(() => {
    if (!dateFrom || !dateTo) { setError('Both date_from and date_to are required.'); return; }
    setLoading(true);
    setError('');
    api.getMdaPesticideReport({ date_from: dateFrom, date_to: dateTo })
      .then(data => { setRows(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFrom, dateTo]);

  const downloadCsv = () => {
    if (!dateFrom || !dateTo) { setError('Both date_from and date_to are required.'); return; }
    api.downloadMdaCsv({ date_from: dateFrom, date_to: dateTo });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        MDA Pesticide Report
      </h1>
      <p className="text-sm text-gray-500 mb-1">Per MN Statute 18B.37 field format</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-5 text-xs text-amber-800">
        MDA-ready format per MN Statute 18B.37. Not currently required for unlicensed operations — for defensive recordkeeping and future licensing.
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To date <span className="text-red-500">*</span></label>
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
              No pesticide applications in the selected date range.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Date</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Applicator</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">License #</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Crop</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Site</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Product</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">EPA Reg #</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Rate</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Volume</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Method</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Target Pest</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Temp °F</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Wind mph</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">PHI ✓</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDate(r.application_date)}</td>
                        <td className="px-3 py-2 text-gray-700">{r.applicator_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.applicator_license ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.crop ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.site ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-800 font-medium">{r.product_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono">{r.epa_reg_no ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {r.rate_value != null ? `${r.rate_value} ${r.rate_unit ?? ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {r.volume_applied != null ? `${r.volume_applied} ${r.volume_unit ?? ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.application_method ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.target_pest ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.ambient_temp_f ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.wind_speed_mph ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {r.phi_compliant === 1 || r.phi_compliant === true
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-600 font-bold">✗</span>}
                        </td>
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
