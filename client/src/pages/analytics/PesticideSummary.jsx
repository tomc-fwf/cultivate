import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const EARTHY_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=JetBrains+Mono:wght@400;700&display=swap');
  @media print {
    body { background: #faf6ed; color: #1f3320; font-family: sans-serif; }
    .no-print { display: none !important; }
    h1 { font-family: 'Fraunces', serif; color: #1f3320; }
    h2 { font-family: 'Fraunces', serif; color: #a04727; font-size: 1rem; margin: 1rem 0 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
    th { background: #1f3320; color: #faf6ed; padding: 6px 8px; text-align: left; font-family: 'Fraunces', serif; }
    td { padding: 5px 8px; border-bottom: 1px solid #d6cfc0; }
    td.num { font-family: 'JetBrains Mono', monospace; text-align: right; }
    .print-footer { margin-top: 2rem; font-size: 0.65rem; color: #6b7280; }
  }
`;

function fmt(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtVol(val, unit) {
  if (val == null) return '—';
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit ?? ''}`.trim();
}

export default function PesticideSummary() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear]       = useState(String(currentYear));
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = (yr) => {
    setLoading(true);
    setError(null);
    api.getPesticideSummary({ year: yr })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(year); }, [year]);

  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 4; y--) {
    yearOptions.push(String(y));
  }

  const products = data?.products ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
      {/* Inject print styles */}
      <style>{EARTHY_CSS}</style>

      <button
        onClick={() => navigate('/applications')}
        className="text-sm text-gray-500 mb-4 hover:text-gray-700 flex items-center gap-1 no-print"
      >
        ← Applications
      </button>

      {/* Header row */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Annual Pesticide Use Summary
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Per-product aggregate for license renewal · MN Statute 18B.37
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          style={{ minHeight: '44px' }}
        >
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Print header (only visible in print) */}
      <div className="hidden" style={{ display: 'none' }} id="print-header">
        <h2 style={{ fontFamily: 'Fraunces, serif', color: '#1f3320', marginBottom: '0.25rem' }}>
          Fairwater Farm — Pesticide Use Summary {data?.year}
        </h2>
      </div>

      {/* Year picker */}
      <div className="flex items-center gap-3 mt-5 mb-6 no-print">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Year</label>
        <select
          value={year}
          onChange={e => setYear(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {data && (
          <span className="text-xs text-gray-400">
            {products.length} product{products.length !== 1 ? 's' : ''} · {year}
          </span>
        )}
      </div>

      {loading && (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
          {error}
          <button
            onClick={() => load(year)}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="text-sm text-gray-500 py-8 text-center">
          No pesticide applications recorded for {year}.
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <>
          {/* Print-only title row */}
          <p className="hidden print:block text-xs text-gray-500 mb-3">
            Fairwater Farm — Annual Pesticide Use Summary {data?.year} · MN Statute 18B.37
          </p>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">EPA Reg #</th>
                  <th className="text-right px-4 py-3"># Apps</th>
                  <th className="text-right px-4 py-3">Total Volume</th>
                  <th className="text-right px-4 py-3">Batches</th>
                  <th className="text-left px-4 py-3">Date Range</th>
                  <th className="text-left px-4 py-3">Target Pests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p, i) => (
                  <tr key={p.input_id ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">{p.product_name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {p.epa_reg_no ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                      {p.application_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 font-mono text-xs">
                      {fmtVol(p.total_volume_applied, p.volume_unit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {p.unique_batches_count}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {fmt(p.date_range?.first)}
                      {p.date_range?.first !== p.date_range?.last && (
                        <> – {fmt(p.date_range?.last)}</>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.target_pests ?? []).map((pest, j) => (
                          <span
                            key={j}
                            className="inline-block bg-red-50 text-red-800 text-xs px-2 py-0.5 rounded-full border border-red-100"
                          >
                            {pest}
                          </span>
                        ))}
                        {(p.target_pests ?? []).length === 0 && (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            {products.length} product{products.length !== 1 ? 's' : ''} · {year} · Sorted by application count
          </p>
        </>
      )}
    </div>
  );
}
