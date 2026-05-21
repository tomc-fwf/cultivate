import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';

// State color classes for container cells
const STATE_CELL = {
  ready:           'bg-green-100 border-green-300 text-green-800',
  active:          'bg-green-500 border-green-600 text-white',
  empty:           'bg-amber-300 border-amber-400 text-amber-900',
  teardown:        'bg-orange-400 border-orange-500 text-white',
  startup:         'bg-blue-400 border-blue-500 text-white',
  out_of_service:  'bg-gray-300 border-gray-400 text-gray-600',
};

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

// States that can be set manually (active/empty require a batch — blocked by API)
const MANUAL_STATES = ['ready', 'startup', 'teardown', 'out_of_service'];

export default function ContainerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isSupervisorPlus = user?.role === 'supervisor' || user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSubZone = searchParams.get('sub_zone_id');

  const [summary, setSummary] = useState([]);
  const [subZoneData, setSubZoneData] = useState(null);
  const [stateFilter, setStateFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [error, setError] = useState('');

  // Container action sheet
  const [activeContainer, setActiveContainer] = useState(null); // { container_id, current_state, position }
  const [settingState, setSettingState] = useState(false);
  const [stateError, setStateError] = useState('');

  // Bulk reset
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  // Load summary on mount
  useEffect(() => {
    api.getContainerSummary()
      .then(data => { setSummary(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Load sub-zone grid when sub_zone_id is in URL
  useEffect(() => {
    if (!selectedSubZone) {
      setSubZoneData(null);
      return;
    }
    setLoadingGrid(true);
    const params = { sub_zone_id: selectedSubZone };
    api.getContainers(params)
      .then(data => { setSubZoneData(data); setLoadingGrid(false); })
      .catch(e => { setError(e.message); setLoadingGrid(false); });
  }, [selectedSubZone]);

  function selectSubZone(szId) {
    setStateFilter('all');
    setSearchParams({ sub_zone_id: szId });
  }

  function clearSubZone() {
    setStateFilter('all');
    setSearchParams({});
  }

  function reloadGrid(szId) {
    setLoadingGrid(true);
    Promise.all([
      api.getContainerSummary(),
      api.getContainers({ sub_zone_id: szId }),
    ]).then(([sumData, gridData]) => {
      setSummary(sumData);
      setSubZoneData(gridData);
      setLoadingGrid(false);
    }).catch(e => { setError(e.message); setLoadingGrid(false); });
  }

  async function handleSetState(toState) {
    if (!activeContainer) return;
    setSettingState(true);
    setStateError('');
    try {
      await api.updateContainerState(activeContainer.container_id, { to_state: toState });
      setActiveContainer(null);
      if (selectedSubZone) reloadGrid(selectedSubZone);
    } catch (e) {
      setStateError(e.message);
    } finally {
      setSettingState(false);
    }
  }

  async function handleBulkReset() {
    if (!window.confirm('Reset all unoccupied containers (no active batch) to "Ready"? This will log a transition for each one.')) return;
    setResetting(true);
    setResetMsg('');
    try {
      const result = await api.bulkResetContainersToReady();
      setResetMsg(result.message);
      const sumData = await api.getContainerSummary();
      setSummary(sumData);
      if (selectedSubZone) reloadGrid(selectedSubZone);
    } catch (e) {
      setResetMsg(`Error: ${e.message}`);
    } finally {
      setResetting(false);
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
  // Sub-zone grid view
  // -------------------------------------------------------------------------
  if (selectedSubZone) {
    const szInfo = summary.find(s => s.sub_zone_id === selectedSubZone);

    if (loadingGrid) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button onClick={clearSubZone} className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
            ← All Zones
          </button>
          <div className="text-gray-500 text-sm">Loading containers…</div>
        </div>
      );
    }

    if (!subZoneData) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button onClick={clearSubZone} className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
            ← All Zones
          </button>
          <div className="text-gray-500 text-sm">Sub-zone not found.</div>
        </div>
      );
    }

    const { sub_zone, containers } = subZoneData;

    // Group containers by row_number
    const byRow = {};
    for (const c of containers) {
      const rn = c.row_number;
      if (!byRow[rn]) byRow[rn] = [];
      byRow[rn].push(c);
    }
    const rowNumbers = Object.keys(byRow).map(Number).sort((a, b) => a - b);

    // Filter containers by selected state
    const filteredContainers = stateFilter === 'all'
      ? containers
      : containers.filter(c => c.current_state === stateFilter);

    // Build filtered by-row map
    const filteredByRow = {};
    for (const c of filteredContainers) {
      const rn = c.row_number;
      if (!filteredByRow[rn]) filteredByRow[rn] = [];
      filteredByRow[rn].push(c);
    }

    // State counts for sub-zone
    const szCounts = szInfo
      ? szInfo.counts
      : ALL_STATES.reduce((acc, s) => { acc[s] = containers.filter(c => c.current_state === s).length; return acc; }, {});

    return (
      <>
      <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
        <button
          onClick={clearSubZone}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
        >
          ← All Zones
        </button>

        {/* Sub-zone header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            {sub_zone.sub_zone_id}
          </h1>
          <div className="text-sm text-gray-500">
            Zone {selectedSubZone.charAt(1)} · {sub_zone.pot_size_gal}-gal · {sub_zone.container_count} containers
          </div>
        </div>

        {/* State filter chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setStateFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              stateFilter === 'all'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            All ({containers.length})
          </button>
          {ALL_STATES.map(state => {
            const count = szCounts[state] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={state}
                onClick={() => setStateFilter(stateFilter === state ? 'all' : state)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  stateFilter === state
                    ? 'bg-gray-800 text-white border-gray-800'
                    : `${STATE_CHIP[state]} border-transparent hover:opacity-80`
                }`}
              >
                {STATE_LABELS[state]} ({count})
              </button>
            );
          })}
        </div>

        {/* Container grid by row */}
        <div className="flex flex-col gap-5">
          {rowNumbers.map(rowNum => {
            const rowContainers = filteredByRow[rowNum] ?? [];
            if (rowContainers.length === 0 && stateFilter !== 'all') return null;
            const allRowContainers = byRow[rowNum] ?? [];
            return (
              <div key={rowNum}>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Row {rowNum} <span className="text-gray-400 font-normal normal-case">
                    ({allRowContainers.length} containers)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allRowContainers.map(c => {
                    const isFiltered = stateFilter !== 'all' && c.current_state !== stateFilter;
                    return (
                      <button
                        key={c.container_id}
                        onClick={() => !isFiltered && setActiveContainer(c)}
                        className={`relative flex items-center justify-center rounded-lg border font-mono text-xs font-bold transition-colors ${
                          STATE_CELL[c.current_state] ?? 'bg-gray-100 border-gray-300'
                        } ${isFiltered ? 'opacity-25 cursor-default' : 'hover:opacity-80 active:scale-95'}`}
                        style={{ width: 48, height: 48, minWidth: 48 }}
                        title={`${c.container_id} — ${STATE_LABELS[c.current_state] ?? c.current_state}`}
                      >
                        {c.position}
                        {c.metrc_plant_tag && (
                          <span
                            className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-green-400 border border-white"
                            title="METRC tag assigned"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* State legend */}
        <div className="mt-6 flex flex-wrap gap-3">
          {ALL_STATES.map(state => (
            <div key={state} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`w-3.5 h-3.5 rounded border ${STATE_CELL[state]}`} />
              {STATE_LABELS[state]}
            </div>
          ))}
        </div>

        {/* Admin: bulk reset */}
        {isAdmin && (
          <div className="mt-6 border-t border-gray-100 pt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleBulkReset}
              disabled={resetting}
              className="text-sm px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Reset unoccupied → Ready'}
            </button>
            {resetMsg && <span className="text-sm text-gray-600">{resetMsg}</span>}
          </div>
        )}
      </div>

      {/* Container action sheet */}
      {activeContainer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setActiveContainer(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-mono font-bold text-gray-900">{activeContainer.container_id}</div>
                <div className="text-sm text-gray-500 mt-0.5">
                  Current: <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATE_CHIP[activeContainer.current_state]}`}>
                    {STATE_LABELS[activeContainer.current_state]}
                  </span>
                </div>
              </div>
              <button
                onClick={() => navigate(`/containers/${encodeURIComponent(activeContainer.container_id)}`)}
                className="text-sm text-green-700 font-semibold hover:text-green-900"
              >
                Full Detail →
              </button>
            </div>

            {isSupervisorPlus && (
              <>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Set State</div>
                <div className="grid grid-cols-2 gap-2">
                  {MANUAL_STATES.map(state => (
                    <button
                      key={state}
                      onClick={() => handleSetState(state)}
                      disabled={settingState || state === activeContainer.current_state}
                      className={`py-3 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-40 ${
                        state === activeContainer.current_state
                          ? `${STATE_CELL[state]} opacity-40 cursor-default`
                          : `${STATE_CHIP[state]} border-transparent hover:opacity-80`
                      }`}
                    >
                      {STATE_LABELS[state]}
                      {state === activeContainer.current_state && ' ✓'}
                    </button>
                  ))}
                </div>
                {stateError && (
                  <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{stateError}</div>
                )}
              </>
            )}
            {!isSupervisorPlus && (
              <div className="text-sm text-gray-500">Supervisor or Admin role required to change state.</div>
            )}
          </div>
        </div>
      )}
      </>
    );
  }

  // -------------------------------------------------------------------------
  // All-zones overview
  // -------------------------------------------------------------------------
  const totals = sumCounts(summary);
  const grandTotal = ALL_STATES.reduce((n, s) => n + (totals[s] ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Containers
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{grandTotal} total</span>
          {isAdmin && (
            <button
              onClick={handleBulkReset}
              disabled={resetting}
              className="text-xs px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Reset unoccupied → Ready'}
            </button>
          )}
        </div>
      </div>
      {resetMsg && <div className="mb-4 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2">{resetMsg}</div>}

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

      {/* Sub-zone cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map(sz => {
          const szTotal = ALL_STATES.reduce((n, s) => n + (sz.counts[s] ?? 0), 0);
          const nonZeroCounts = ALL_STATES.filter(s => (sz.counts[s] ?? 0) > 0);

          return (
            <div
              key={sz.sub_zone_id}
              className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 hover:border-green-300 transition-colors cursor-pointer"
              onClick={() => selectSubZone(sz.sub_zone_id)}
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

              <button
                onClick={(e) => { e.stopPropagation(); selectSubZone(sz.sub_zone_id); }}
                className="text-xs text-green-700 font-semibold hover:text-green-900 text-left"
              >
                View Grid →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
