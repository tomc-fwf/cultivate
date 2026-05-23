import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmtG(g) {
  if (g == null) return '—';
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  return `${g.toFixed(1)} g`;
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <div className={`text-2xl font-bold ${highlight ? 'text-amber-800' : 'text-gray-800'}`}>{value}</div>
      <div className="text-sm font-medium text-gray-700 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AnnualSummary() {
  const navigate = useNavigate();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.getAnnualSummary({ year })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [year]);

  useEffect(() => { load(); }, []);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const b = data?.batches;
  const p = data?.plants;
  const y = data?.yield;
  const c = data?.compliance;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <style>{`
        @media print {
          body { background: #faf6ed; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          h1 { font-family: 'Fraunces', serif; color: #1f3320; }
          .card-grid { grid-template-columns: repeat(3, 1fr); }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print">
        <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
          ← Applications
        </button>
      </div>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            Annual Batch Summary
          </h1>
          <p className="text-sm text-gray-500">Year-to-date operational summary · OCM annual review</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="bg-green-700 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-green-800 disabled:opacity-50"
            style={{ minHeight: '42px' }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            style={{ minHeight: '42px' }}
          >
            Print
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700 no-print">{error}</div>
      )}

      {data && (
        <>
          {/* Batches */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Batches — {year}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 card-grid">
            <StatCard label="Total Batches" value={b?.total ?? '—'} />
            <StatCard label="Autoflowers" value={b?.by_strain_type?.auto ?? '—'} />
            <StatCard label="Photoperiods" value={b?.by_strain_type?.photo ?? '—'} />
          </div>

          {/* Plants */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Plants</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 card-grid">
            <StatCard label="Plants Placed" value={p?.total_placed ?? '—'} />
            <StatCard label="Plants Lost" value={p?.total_lost ?? '—'} highlight={p?.total_lost > 0} sub="mid-batch losses" />
            <StatCard label="Plants Harvested" value={p?.total_harvested ?? '—'} sub="final harvest events" />
          </div>

          {/* Yield */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Yield</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xl font-bold text-gray-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {fmtG(y?.total_wet_weight_g)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Total wet weight</div>
              </div>
              <div>
                <div className="text-xl font-bold text-gray-700" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {fmtG(y?.total_waste_trim_g)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Waste trim</div>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">By product type</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {y?.by_product_type_g && Object.entries(y.by_product_type_g).map(([type, g]) => (
                  <div key={type}>
                    <div className="text-sm font-bold text-gray-700" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {fmtG(g)}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">{type.replace('_', ' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Compliance */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Compliance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 card-grid">
            <StatCard
              label="Pesticide Applications"
              value={c?.total_pesticide_applications ?? '—'}
            />
            <StatCard
              label="PHI Violations"
              value={c?.phi_violations ?? '—'}
              highlight={c?.phi_violations > 0}
              sub={c?.phi_violations > 0 ? 'Review PHI Compliance Report' : 'No violations'}
            />
            <StatCard
              label="METRC Pending"
              value={c?.metrc_pending ?? '—'}
              highlight={c?.metrc_pending > 0}
              sub="across all event types"
            />
          </div>

          {/* METRC pending detail */}
          {c?.metrc_pending > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
              <div className="text-sm font-semibold text-amber-800 mb-2">METRC Pending Detail</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {c.metrc_pending_by_type && Object.entries(c.metrc_pending_by_type).map(([type, count]) => (
                  count > 0 && (
                    <div key={type} className="flex justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                      <span className="text-gray-600 capitalize">{type.replace(/_/g, ' ')}</span>
                      <span className="font-bold text-amber-800">{count}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Generated at footer */}
          <div className="text-xs text-gray-400 text-right">
            Generated {new Date(data.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        </>
      )}
    </div>
  );
}
