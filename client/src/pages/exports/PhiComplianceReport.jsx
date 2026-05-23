import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function fmtDate(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return str; }
}

function fmtDt(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return str; }
}

function defaultDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export default function PhiComplianceReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [batchId, setBatchId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buildParams = () => {
    const p = {};
    if (dateFrom) p.date_from = dateFrom;
    if (batchId.trim()) p.batch_id = batchId.trim();
    return p;
  };

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.getPhiComplianceReport(buildParams())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFrom, batchId]);

  // Auto-load on mount with defaults
  useEffect(() => { load(); }, []);

  const summary = data?.summary ?? null;
  const applications = data?.applications ?? null;

  const violations = summary?.phi_violations ?? 0;
  const riskBatches = summary?.phi_risk_batches ?? 0;
  const total = summary?.total_applications ?? 0;
  const clean = total - violations;

  const overallStatus = violations > 0 || riskBatches > 0
    ? (riskBatches > 0 ? 'red' : 'amber')
    : 'green';

  const summaryBg = overallStatus === 'red'
    ? 'bg-red-50 border-red-300'
    : overallStatus === 'amber'
    ? 'bg-amber-50 border-amber-300'
    : 'bg-green-50 border-green-300';

  const summaryText = overallStatus === 'red'
    ? 'text-red-800'
    : overallStatus === 'amber'
    ? 'text-amber-800'
    : 'text-green-800';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        PHI Compliance Report
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        Pre-Harvest Interval status for all pesticide applications · MDA Statute 18B.37
      </p>

      {/* Explanatory note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 text-xs text-blue-800 leading-relaxed">
        <strong>phi_compliant = false</strong> means the application was logged while the expected harvest date was within the
        product's operational PHI window. If an override was recorded, the reason appears in the Notes column.
        A <strong>PHI risk flag</strong> is raised when a batch is in flush/harvest_window/harvesting status and either has
        a non-compliant application or the harvest is within 14 days of an application.
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From date (default: 90 days ago)</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Batch ID (optional)</label>
            <input
              type="text"
              inputMode="numeric"
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
              placeholder="e.g. 42"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={load}
              disabled={loading}
              className="w-full bg-green-700 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-green-800 disabled:opacity-50"
              style={{ minHeight: '42px' }}
            >
              {loading ? 'Loading…' : 'Run Report'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {/* Summary bar */}
      {summary && (
        <div className={`border rounded-2xl px-5 py-4 mb-5 ${summaryBg}`}>
          <div className={`text-sm font-bold mb-3 ${summaryText}`}>
            {overallStatus === 'green' && '✓ PHI Compliance — All Clear'}
            {overallStatus === 'amber' && '⚠ PHI Compliance — Violations Present (no active harvest)'}
            {overallStatus === 'red' && '⛔ PHI Compliance — Risk: Active Harvest Batch with PHI Concern'}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${violations > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {violations}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">PHI violations</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${riskBatches > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {riskBatches}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">At-risk batches</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700">{total}</div>
              <div className="text-xs text-gray-600 mt-0.5">Total applications</div>
            </div>
          </div>
        </div>
      )}

      {/* Applications table */}
      {applications && applications.length === 0 && (
        <div className="text-center text-gray-500 py-12">No pesticide applications found for this period.</div>
      )}

      {applications && applications.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Applied At</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Expected Harvest</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">PHI</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {applications.map(a => (
                  <tr
                    key={a.pesticide_app_id}
                    className={a.phi_risk_flag ? 'bg-red-50' : a.phi_compliant === false || a.phi_compliant === 0 ? 'bg-amber-50' : ''}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDt(a.applied_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{a.product_name}</div>
                      {a.epa_reg_no && <div className="text-xs text-gray-500">EPA {a.epa_reg_no}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{a.batch_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        ['harvesting', 'harvest_window'].includes(a.batch_status)
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {a.batch_status}
                      </span>
                      {a.phi_risk_flag && (
                        <span className="ml-1 inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                          ⛔ PHI risk
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDate(a.expected_harvest_date)}</td>
                    <td className="px-4 py-3">
                      {a.phi_compliant === true || a.phi_compliant === 1
                        ? <span className="text-green-700 font-medium">✓ Compliant</span>
                        : a.phi_compliant === false || a.phi_compliant === 0
                        ? <span className="text-red-700 font-medium">✗ Violation</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">{a.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            {applications.length} application{applications.length !== 1 ? 's' : ''} · Rows highlighted red = PHI risk flag active · Amber = violation, no active harvest
          </div>
        </div>
      )}
    </div>
  );
}
