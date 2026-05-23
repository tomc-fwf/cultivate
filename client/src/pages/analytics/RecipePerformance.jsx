import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmt(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateRange(dateRange) {
  if (!dateRange?.first && !dateRange?.last) return '—';
  const first = fmt(dateRange.first);
  const last  = fmt(dateRange.last);
  if (first === last) return first;
  return `${first} – ${last}`;
}

function fmtWeight(grams) {
  if (grams == null) return '—';
  return (grams / 1000).toFixed(2) + ' kg';
}

function fmtYield(g) {
  if (g == null) return '—';
  return g.toFixed(1) + ' g';
}

export default function RecipePerformance() {
  const navigate = useNavigate();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    api.getRecipePerformance()
      .then(data => { setRows(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate('/applications')}
        className="text-sm text-gray-500 mb-4 hover:text-gray-700 flex items-center gap-1"
      >
        ← Applications
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Recipe Performance
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Harvest yield aggregated by fertigation recipe version — based on batches that reached final harvest.
      </p>

      {loading && (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
          {error}
          <button onClick={load} className="ml-3 underline hover:no-underline">Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-gray-500 py-8 text-center">
          No data yet — recipe performance requires at least one batch with final harvest events.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Recipe</th>
                  <th className="text-center px-4 py-3">Version</th>
                  <th className="text-right px-4 py-3">Batches</th>
                  <th className="text-right px-4 py-3">Plants Harvested</th>
                  <th className="text-right px-4 py-3">Avg Yield / Plant</th>
                  <th className="text-right px-4 py-3">Total Harvest</th>
                  <th className="text-right px-4 py-3">Date Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => (
                  <tr key={row.recipe_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">{row.recipe_name}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-gray-600">
                      <span className="bg-gray-100 text-gray-700 text-xs font-mono px-2 py-0.5 rounded">
                        v{row.version}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                      {row.batches_used}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.harvest_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-gray-800">
                      {fmtYield(row.avg_yield_per_plant_g)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-green-800">
                      {fmtWeight(row.total_wet_weight_g)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {fmtDateRange(row.date_range)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            {rows.length} recipe version{rows.length !== 1 ? 's' : ''} ·{' '}
            Avg yield per plant = total wet weight ÷ initial plant count for batches using this recipe
          </p>

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <strong>Note:</strong> Yield correlation does not imply causation — environmental factors,
            strain genetics, and batch size all contribute.
          </div>
        </>
      )}
    </div>
  );
}
