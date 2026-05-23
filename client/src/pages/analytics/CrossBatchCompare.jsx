import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtG(g) {
  if (g == null) return '—';
  if (g >= 1000) return (g / 1000).toFixed(2) + ' kg';
  return g.toFixed(1) + ' g';
}

function fmtPct(rate) {
  if (rate == null) return '—';
  return (rate * 100).toFixed(1) + '%';
}

function fmtNum(n) {
  if (n == null) return '—';
  return n.toLocaleString();
}

// Find best/worst index for a set of values given a comparator ('higher' = higher is better, 'lower' = lower is better).
// Returns { best: idx, worst: idx } or null if not enough non-null data.
function extremes(values, direction) {
  const valid = values
    .map((v, i) => ({ v, i }))
    .filter(x => x.v != null);
  if (valid.length < 2) return null;
  valid.sort((a, b) => a.v - b.v);
  return direction === 'higher'
    ? { best: valid[valid.length - 1].i, worst: valid[0].i }
    : { best: valid[0].i, worst: valid[valid.length - 1].i };
}

function cellClass(idx, ext) {
  if (!ext) return '';
  if (idx === ext.best) return 'bg-green-50 text-green-800 font-semibold';
  if (idx === ext.worst) return 'bg-red-50 text-red-700';
  return '';
}

const MAX_BATCHES = 6;

export default function CrossBatchCompare() {
  const navigate = useNavigate();

  const [batches, setBatches]       = useState([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchError, setBatchError] = useState(null);

  const [selected, setSelected]     = useState([]);   // array of batch_id (numbers)
  const [results, setResults]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  // Load recent batches for the selector
  useEffect(() => {
    setBatchLoading(true);
    api.getBatches({ limit: 50 })
      .then(data => {
        // getBatches returns { batches: [...] } or just an array depending on impl
        const list = Array.isArray(data) ? data : (data.batches ?? []);
        setBatches(list);
        setBatchLoading(false);
      })
      .catch(err => { setBatchError(err.message); setBatchLoading(false); });
  }, []);

  function toggleBatch(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_BATCHES) return prev; // cap at 6
      return [...prev, id];
    });
  }

  function compare() {
    if (selected.length < 2) return;
    setLoading(true);
    setError(null);
    api.getCrossBatchCompare(selected)
      .then(data => { setResults(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }

  // Metrics table definition
  const metrics = results ? [
    {
      label: 'Strain',
      values: results.map(r => r.strain_name),
      fmt: v => v ?? '—',
      direction: null,
    },
    {
      label: 'Sub-zone',
      values: results.map(r => r.sub_zone_id),
      fmt: v => v ?? '—',
      direction: null,
    },
    {
      label: 'Sow Date',
      values: results.map(r => r.sow_date),
      fmt: fmtDate,
      direction: null,
    },
    {
      label: 'Status',
      values: results.map(r => r.status),
      fmt: v => v ?? '—',
      direction: null,
    },
    {
      label: 'Days to Harvest',
      values: results.map(r => r.days_to_harvest),
      fmt: v => v != null ? v + ' d' : '—',
      direction: 'lower',
    },
    {
      label: 'Total Yield',
      values: results.map(r => r.total_yield_g),
      fmt: fmtG,
      direction: 'higher',
    },
    {
      label: 'Avg Yield / Plant',
      values: results.map(r => r.avg_yield_per_plant_g),
      fmt: fmtG,
      direction: 'higher',
    },
    {
      label: 'Plant Loss Rate',
      values: results.map(r => r.plant_loss_rate),
      fmt: fmtPct,
      direction: 'lower',
    },
    {
      label: 'Pesticide Applications',
      values: results.map(r => r.pesticide_application_count),
      fmt: fmtNum,
      direction: 'lower',
    },
    {
      label: 'Fertigation Count',
      values: results.map(r => r.fertigation_count),
      fmt: fmtNum,
      direction: null,
    },
    {
      label: 'Avg EC Deviation',
      values: results.map(r => r.avg_ec_deviation),
      fmt: v => v != null ? v.toFixed(3) : '—',
      direction: 'lower',
    },
  ] : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate('/applications')}
        className="text-sm text-gray-500 mb-4 hover:text-gray-700 flex items-center gap-1"
      >
        ← Applications
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Cross-Batch Comparison
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Select 2–6 batches to compare key performance metrics side by side.
        <span className="ml-2 text-green-700">Green</span> = best · <span className="text-red-600">Red</span> = worst.
      </p>

      {/* ── Batch selector ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Select Batches</h2>
          <span className="text-xs text-gray-400">{selected.length}/{MAX_BATCHES} selected</span>
        </div>

        {batchLoading && <div className="text-sm text-gray-400 py-3 text-center">Loading batches…</div>}
        {batchError  && <div className="text-sm text-red-700 py-3">{batchError}</div>}

        {!batchLoading && !batchError && batches.length === 0 && (
          <div className="text-sm text-gray-400 py-3 text-center">No batches found.</div>
        )}

        {!batchLoading && !batchError && batches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {batches.map(b => {
              const isSelected = selected.includes(b.batch_id);
              const disabled   = !isSelected && selected.length >= MAX_BATCHES;
              return (
                <button
                  key={b.batch_id}
                  onClick={() => !disabled && toggleBatch(b.batch_id)}
                  style={{ minHeight: '40px' }}
                  className={[
                    'px-3 py-1.5 rounded-xl text-sm border transition-all',
                    isSelected
                      ? 'bg-leaf-dark border-leaf-dark text-white bg-gray-800 border-gray-800'
                      : disabled
                        ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-white',
                  ].join(' ')}
                >
                  <span className="font-semibold">{b.batch_name ?? `#${b.batch_id}`}</span>
                  {b.strain_name && (
                    <span className="ml-1 text-xs opacity-70">{b.strain_name}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={compare}
            disabled={selected.length < 2 || loading}
            style={{ minHeight: '48px' }}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
          >
            {loading ? 'Loading…' : 'Compare'}
          </button>
          {selected.length < 2 && (
            <span className="text-xs text-gray-400">Select at least 2 batches to compare</span>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
          {error}
          <button onClick={compare} className="ml-3 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* ── Comparison table ───────────────────────────────────────── */}
      {results && results.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 whitespace-nowrap">Metric</th>
                  {results.map(r => (
                    <th key={r.batch_id} className="text-right px-4 py-3 whitespace-nowrap min-w-[120px]">
                      <div>{r.strain_name ?? `Batch ${r.batch_id}`}</div>
                      <div className="font-mono font-normal text-gray-400 normal-case tracking-normal">
                        #{r.batch_id}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.map(metric => {
                  const ext = extremes(metric.values, metric.direction);
                  return (
                    <tr key={metric.label} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">
                        {metric.label}
                      </td>
                      {metric.values.map((v, idx) => (
                        <td
                          key={idx}
                          className={`px-4 py-3 text-right tabular-nums font-mono ${cellClass(idx, ext)}`}
                        >
                          {metric.fmt(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            {results.length} batches compared · Yield figures are wet weight.
            Avg yield per plant uses plant_count_initial as denominator.
          </p>
        </>
      )}
    </div>
  );
}
