import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';

// State colors for summary bar segments
const STATE_BAR_COLOR = {
  ready:           'bg-green-200',
  active:          'bg-green-500',
  empty:           'bg-amber-300',
  teardown:        'bg-orange-400',
  startup:         'bg-blue-400',
  out_of_service:  'bg-gray-400',
};

// State label chip colors for sub-zone cards
const STATE_CHIP = {
  ready:           'bg-green-100 text-green-800',
  active:          'bg-green-500 text-white',
  empty:           'bg-amber-200 text-amber-900',
  teardown:        'bg-orange-200 text-orange-900',
  startup:         'bg-blue-100 text-blue-800',
  out_of_service:  'bg-gray-200 text-gray-700',
};

const ALL_STATES = ['ready', 'active', 'empty', 'teardown', 'startup', 'out_of_service'];

const STATE_LABELS = {
  ready:           'Ready',
  active:          'Active',
  empty:           'Empty',
  teardown:        'Teardown',
  startup:         'Startup',
  out_of_service:  'Out of Service',
};

function sumCounts(summaries) {
  const totals = { ready: 0, active: 0, empty: 0, teardown: 0, startup: 0, out_of_service: 0 };
  for (const sz of summaries) {
    for (const state of ALL_STATES) {
      totals[state] += sz.counts[state] ?? 0;
    }
  }
  return totals;
}

const VALID_STATES = ['ready', 'active', 'empty', 'teardown', 'startup', 'out_of_service'];

export default function ContainerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bulk scope state picker: { scope: 'zone'|'sub_zone'|'row'|'all', scope_id, label }
  const [bulkScope, setBulkScope] = useState(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    api.getContainerSummary()
      .then(data => { setSummary(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);


  async function handleBulkSetState(toState) {
    if (!bulkScope) return;
    setBulkWorking(true);
    setBulkError('');
    setBulkMsg('');
    try {
      const result = await api.bulkSetContainerState({
        to_state: toState,
        scope: bulkScope.scope,
        scope_id: bulkScope.scope_id,
      });
      setBulkMsg(result.message);
      const sumData = await api.getContainerSummary();
      setSummary(sumData);
      setTimeout(() => { setBulkScope(null); setBulkMsg(''); }, 1500);
    } catch (e) {
      setBulkError(e.message);
    } finally {
      setBulkWorking(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-gray-500 text-sm">Loading containers…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // All-zones overview
  // -------------------------------------------------------------------------
  const totals = sumCounts(summary);
  const grandTotal = ALL_STATES.reduce((n, s) => n + (totals[s] ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Containers
        </h1>
        <div className="flex items-center gap-3">
          <Link to="/soil-samples" className="text-sm text-green-700 font-medium hover:text-green-900">
            Soil Samples →
          </Link>
          <span className="text-sm text-gray-500">{grandTotal} total</span>
        </div>
      </div>

      {/* Global state counts summary bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {ALL_STATES.map(state => (
            <span key={state} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${STATE_BAR_COLOR[state]}`} />
              <span className="text-gray-600">{STATE_LABELS[state]}:</span>
              <span className="font-bold text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {totals[state] ?? 0}
              </span>
            </span>
          ))}
        </div>

        {/* Global distribution bar */}
        {grandTotal > 0 && (
          <div className="flex rounded-full overflow-hidden h-2 mt-3">
            {ALL_STATES.map(state => {
              const pct = ((totals[state] ?? 0) / grandTotal) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={state}
                  className={STATE_BAR_COLOR[state]}
                  style={{ width: `${pct}%` }}
                  title={`${STATE_LABELS[state]}: ${totals[state]}`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Zone-level bulk actions (admin) */}
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...new Set(summary.map(sz => sz.zone_id))].sort((a, b) => a - b).map(zoneId => (
            <button
              key={zoneId}
              onClick={() => { setBulkScope({ scope: 'zone', scope_id: String(zoneId), label: `Zone ${zoneId}` }); setBulkMsg(''); setBulkError(''); }}
              className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-green-400 hover:text-green-800 font-medium"
            >
              Set Zone {zoneId} state…
            </button>
          ))}
          <button
            onClick={() => { setBulkScope({ scope: 'all', scope_id: undefined, label: 'All Containers' }); setBulkMsg(''); setBulkError(''); }}
            className="text-xs px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-medium"
          >
            Set ALL containers…
          </button>
        </div>
      )}

      {/* Sub-zone cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map(sz => {
          const szTotal = ALL_STATES.reduce((n, s) => n + (sz.counts[s] ?? 0), 0);
          const nonZeroCounts = ALL_STATES.filter(s => (sz.counts[s] ?? 0) > 0);

          return (
            <div
              key={sz.sub_zone_id}
              className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 hover:border-green-300 transition-colors cursor-pointer"
              onClick={() => navigate(`/containers/map/${sz.sub_zone_id}`)}
            >
              {/* Header */}
              <div>
                <div className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                  {sz.sub_zone_id}
                </div>
                <div className="text-xs text-gray-500">
                  Zone {sz.zone_id} · {sz.pot_size_gal}-gal
                </div>
              </div>

              {/* Mini distribution bar */}
              {szTotal > 0 && (
                <div className="flex rounded-full overflow-hidden h-1.5">
                  {ALL_STATES.map(state => {
                    const pct = ((sz.counts[state] ?? 0) / szTotal) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={state}
                        className={STATE_BAR_COLOR[state]}
                        style={{ width: `${pct}%` }}
                        title={`${STATE_LABELS[state]}: ${sz.counts[state]}`}
                      />
                    );
                  })}
                </div>
              )}

              {/* State chips (non-zero only) */}
              <div className="flex flex-wrap gap-1">
                {nonZeroCounts.map(state => (
                  <span
                    key={state}
                    className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${STATE_CHIP[state]}`}
                  >
                    {sz.counts[state]} {STATE_LABELS[state]}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to={`/containers/map/${sz.sub_zone_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-green-700 font-semibold hover:text-green-900"
                >
                  View →
                </Link>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setBulkScope({ scope: 'sub_zone', scope_id: sz.sub_zone_id, label: sz.sub_zone_id }); setBulkMsg(''); setBulkError(''); }}
                    className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-1.5 py-0.5"
                  >
                    Set state…
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk state sheet (overview level) */}
      {bulkScope && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={() => setBulkScope(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-5 pb-24 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-gray-900">Set State — {bulkScope.label}</div>
              <button onClick={() => setBulkScope(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="text-xs text-gray-500 mb-4">
              Sets every container in this scope to the chosen state and logs each transition.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {VALID_STATES.map(state => (
                <button
                  key={state}
                  onClick={() => handleBulkSetState(state)}
                  disabled={bulkWorking}
                  className={`py-3 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ${STATE_CHIP[state]} border-transparent hover:opacity-80`}
                >
                  {STATE_LABELS[state]}
                </button>
              ))}
            </div>
            {bulkWorking && <div className="mt-3 text-sm text-gray-500 text-center">Updating…</div>}
            {bulkMsg && <div className="mt-3 text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{bulkMsg}</div>}
            {bulkError && <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{bulkError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
