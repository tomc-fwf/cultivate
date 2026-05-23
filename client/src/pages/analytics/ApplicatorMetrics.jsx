import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmt(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDev(val) {
  if (val == null) return '—';
  return val.toFixed(3);
}

export default function ApplicatorMetrics() {
  const navigate = useNavigate();
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  useEffect(() => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo)   params.date_to   = dateTo;

    setLoading(true);
    setError(null);
    api.getApplicatorMetrics(params)
      .then(data => { setRows(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [dateFrom, dateTo]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate('/applications')}
        className="text-sm text-gray-500 mb-4 hover:text-gray-700 flex items-center gap-1"
      >
        ← Applications
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Applicator Performance
      </h1>
      <p className="text-sm text-gray-500 mb-5">Application counts and EC accuracy across all four application types.</p>

      {/* Date filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        {(dateFrom || dateTo) && (
          <div className="flex flex-col justify-end">
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-2"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
          {error}
          <button
            onClick={() => { setLoading(true); setError(null); api.getApplicatorMetrics().then(d => { setRows(d); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); }); }}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-gray-500 py-8 text-center">No application records found.</div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Fertigation</th>
                <th className="text-right px-4 py-3">Pesticide</th>
                <th className="text-right px-4 py-3">Avg EC Dev</th>
                <th className="text-right px-4 py-3">Active Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={row.user_id ?? i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900">{row.user_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{row.application_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.fertigation_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.pesticide_count > 0 ? (
                      <span className="text-red-700 font-semibold">{row.pesticide_count}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono text-gray-700">
                    {row.avg_ec_deviation != null ? (
                      <span className={row.avg_ec_deviation > 0.2 ? 'text-amber-700' : 'text-green-700'}>
                        {fmtDev(row.avg_ec_deviation)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmt(row.date_range?.first)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {rows.length} applicator{rows.length !== 1 ? 's' : ''} · Avg EC deviation from recipe midpoint
        </p>
      )}
    </div>
  );
}
