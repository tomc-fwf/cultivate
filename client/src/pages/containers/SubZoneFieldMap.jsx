import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import ContainerQuickSheet from './ContainerQuickSheet';

const STATUS_CHIP = {
  'germ':           'bg-gray-100 text-gray-700',
  'seedling':       'bg-lime-100 text-lime-700',
  'cult-hoop':      'bg-green-100 text-green-700',
  'field-veg':      'bg-green-100 text-green-800',
  'field-flower':   'bg-purple-100 text-purple-700',
  'flush':          'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700',
  'harvesting':     'bg-red-100 text-red-700',
};

const STATUS_LABELS = {
  'germ':           'Germ',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Veg',
  'field-flower':   'Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
};

const STATE_CELL = {
  active:          'bg-green-700 border-green-800 text-white',
  empty:           'bg-yellow-500 border-yellow-600 text-white',
  teardown:        'bg-orange-500 border-orange-600 text-white',
  startup:         'bg-blue-500 border-blue-600 text-white',
  ready:           'bg-green-200 border-green-300 text-green-900',
  out_of_service:  'bg-gray-400 border-gray-500 text-white',
};

const STATE_CHIP_COLORS = {
  ready:           'bg-green-100 text-green-800',
  active:          'bg-green-500 text-white',
  empty:           'bg-amber-200 text-amber-900',
  teardown:        'bg-orange-200 text-orange-900',
  startup:         'bg-blue-100 text-blue-800',
  out_of_service:  'bg-gray-200 text-gray-700',
};

const STATE_LABELS = {
  active:          'Active',
  empty:           'Empty',
  teardown:        'Teardown',
  startup:         'Startup',
  ready:           'Ready',
  out_of_service:  'Out of Service',
};

const ALL_STATES = ['active', 'ready', 'empty', 'teardown', 'startup', 'out_of_service'];
const VALID_STATES = ['ready', 'active', 'empty', 'teardown', 'startup', 'out_of_service'];

function stateCounts(containers) {
  const counts = { active: 0, ready: 0, empty: 0, teardown: 0, startup: 0, out_of_service: 0 };
  for (const c of containers) {
    if (c.current_state in counts) counts[c.current_state]++;
  }
  return counts;
}

// Bottom sheet for quick actions in field mode
function QuickActionSheet({ container, onClose }) {
  const navigate = useNavigate();
  const id = encodeURIComponent(container.container_id);

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={handleBackdrop}
    >
      <div className="w-full bg-white rounded-t-2xl p-5 pb-24 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-gray-900 text-base">{container.container_id}</p>
            <p className="text-sm text-gray-500 capitalize">{STATE_LABELS[container.current_state] ?? container.current_state}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate(`/containers/${id}`)}
            className="col-span-2 py-3 rounded-xl bg-green-700 text-white font-semibold text-sm"
            style={{ minHeight: 48 }}
          >
            View Container Detail
          </button>
          <button
            onClick={() => navigate(`/observations/new?container_id=${container.container_id}`)}
            className="py-3 rounded-xl bg-gray-100 text-gray-800 font-medium text-sm"
            style={{ minHeight: 48 }}
          >
            Add Observation
          </button>
          <button
            onClick={() => navigate(`/applications/foliar/new?container_id=${container.container_id}`)}
            className="py-3 rounded-xl bg-gray-100 text-gray-800 font-medium text-sm"
            style={{ minHeight: 48 }}
          >
            Log Foliar
          </button>
          <button
            onClick={() => navigate(`/applications/pesticide/new?container_id=${container.container_id}`)}
            className="py-3 rounded-xl bg-gray-100 text-gray-800 font-medium text-sm"
            style={{ minHeight: 48 }}
          >
            Log Pesticide
          </button>
          <button
            onClick={() => navigate(`/containers/${id}/loss`)}
            className="py-3 rounded-xl bg-red-50 text-red-700 font-medium text-sm"
            style={{ minHeight: 48 }}
          >
            Record Loss
          </button>
        </div>
      </div>
    </div>
  );
}

// Container cell — onTap overrides default navigate-to-detail; onLongPress opens action sheet
function ContainerCell({ container, onLongPress, onTap }) {
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const didLongPress = useRef(false);

  const cellClass = STATE_CELL[container.current_state] ?? 'bg-gray-200 border-gray-300 text-gray-700';
  const hasRei = Boolean(container.rei_active_until);
  const hasObs = Boolean(container.has_open_observation);

  function startPress() {
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress?.(container);
    }, 300);
  }

  function endPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!didLongPress.current) {
      if (onTap) onTap(container);
      else navigate(`/containers/${encodeURIComponent(container.container_id)}`);
    }
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    didLongPress.current = false;
  }

  return (
    <div
      className={`relative border rounded-lg flex flex-col items-center justify-center select-none cursor-pointer active:opacity-75 transition-opacity ${cellClass}`}
      style={{ minWidth: 56, minHeight: 56, width: 56, height: 56 }}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={cancelPress}
    >
      <span className="text-xs font-bold leading-none">C{container.position}</span>
      {(hasRei || hasObs) && (
        <div className="absolute top-1 right-1 flex gap-0.5">
          {hasRei && <span className="w-2 h-2 rounded-full bg-red-500 block" title="REI active" />}
          {hasObs && <span className="w-2 h-2 rounded-full bg-amber-400 block" title="Open observation" />}
        </div>
      )}
      {container.metrc_plant_tag && !hasRei && !hasObs && (
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-white/60 border border-current block" title="METRC tagged" />
      )}
    </div>
  );
}

export default function SubZoneFieldMap() {
  const { subZoneId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [mode, setMode] = useState('field'); // 'field' | 'state'
  const [data, setData] = useState(null);
  const [activeBatch, setActiveBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Field mode
  const [activeSheet, setActiveSheet] = useState(null);

  // State mode
  const [stateFilter, setStateFilter] = useState('all');
  const [activeContainer, setActiveContainer] = useState(null);
  const [bulkScope, setBulkScope] = useState(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkError, setBulkError] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!subZoneId) return;
    setLoading(true);
    Promise.all([
      api.getContainers({ sub_zone_id: subZoneId }),
      api.getBatches({ status: 'active' }).catch(() => []),
    ]).then(([containerData, batches]) => {
      setData(containerData);
      const found = Array.isArray(batches)
        ? (batches.find(b => b.sub_zone_id === subZoneId) ?? null)
        : null;
      setActiveBatch(found);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, [subZoneId, refreshKey]);

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
      reload();
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
        <div className="text-gray-500 text-sm">Loading…</div>
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

  if (!data) return null;

  const { sub_zone, containers } = data;
  const counts = stateCounts(containers);

  const byRow = {};
  for (const c of containers) {
    const rn = c.row_number;
    if (!byRow[rn]) byRow[rn] = [];
    byRow[rn].push(c);
  }
  const rowNumbers = Object.keys(byRow).map(Number).sort((a, b) => a - b);

  const filteredByRow = {};
  if (stateFilter !== 'all') {
    for (const c of containers) {
      if (c.current_state === stateFilter) {
        const rn = c.row_number;
        if (!filteredByRow[rn]) filteredByRow[rn] = [];
        filteredByRow[rn].push(c);
      }
    }
  }

  const totalRei = containers.filter(c => c.rei_active_until).length;
  const totalObs = containers.filter(c => c.has_open_observation).length;

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 py-6 pb-40">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
        >
          ← Back
        </button>

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            {subZoneId}
          </h1>
          <div className="text-sm text-gray-500 mb-3">
            Zone {subZoneId.charAt(1)} · {sub_zone.pot_size_gal}-gal · {sub_zone.container_count} containers
          </div>

          {/* State count chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {ALL_STATES.map(state => (
              counts[state] > 0 && (
                <span
                  key={state}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATE_CELL[state]}`}
                >
                  {counts[state]} {STATE_LABELS[state]}
                </span>
              )
            ))}
          </div>

          {/* Active batch card */}
          {activeBatch ? (
            <div
              className="bg-white rounded-2xl border border-gray-200 px-4 py-3 mb-3 cursor-pointer hover:border-green-300 transition-colors"
              onClick={() => navigate(`/batches/${activeBatch.batch_id}`)}
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-gray-900">{activeBatch.batch_name || activeBatch.strain_name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[activeBatch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[activeBatch.status] ?? activeBatch.status}
                </span>
                <span className="text-sm text-gray-500">Day {activeBatch.days_in_stage ?? 0}</span>
              </div>
              <div className="text-sm text-gray-600">
                {activeBatch.plant_count_current ?? activeBatch.plant_count_initial} plants
              </div>
            </div>
          ) : (
            <p className="italic text-gray-400 text-sm mb-3">No active planting group — sub-zone is empty</p>
          )}

          {/* REI / observation alerts */}
          {(totalRei > 0 || totalObs > 0) && (
            <div className="flex gap-3 flex-wrap">
              {totalRei > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {totalRei} REI active
                </span>
              )}
              {totalObs > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  {totalObs} open observation{totalObs !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-xl p-0.5 mb-5">
          <button
            onClick={() => setMode('field')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'field' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Field Actions
          </button>
          <button
            onClick={() => setMode('state')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'state' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            State View
          </button>
        </div>

        {/* State mode controls */}
        {mode === 'state' && (
          <div className="mb-4 space-y-3">
            {/* Filter chips */}
            <div className="flex flex-wrap gap-2">
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
                const count = counts[state] ?? 0;
                if (count === 0) return null;
                return (
                  <button
                    key={state}
                    onClick={() => setStateFilter(stateFilter === state ? 'all' : state)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      stateFilter === state
                        ? 'bg-gray-800 text-white border-gray-800'
                        : `${STATE_CHIP_COLORS[state]} border-transparent hover:opacity-80`
                    }`}
                  >
                    {STATE_LABELS[state]} ({count})
                  </button>
                );
              })}
            </div>

            {/* Admin sub-zone bulk set */}
            {isAdmin && (
              <div className="flex justify-end">
                <button
                  onClick={() => { setBulkScope({ scope: 'sub_zone', scope_id: subZoneId, label: subZoneId }); setBulkMsg(''); setBulkError(''); }}
                  className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-green-400 hover:text-green-800 font-medium"
                >
                  Set all in {subZoneId}…
                </button>
              </div>
            )}
          </div>
        )}

        {/* Legend (field mode only — state mode uses filter chips) */}
        {mode === 'field' && (
          <div className="flex flex-wrap gap-2 mb-5">
            {ALL_STATES.map(state => (
              <span key={state} className={`text-xs px-2 py-0.5 rounded border ${STATE_CELL[state]}`}>
                {STATE_LABELS[state]}
              </span>
            ))}
            <span className="text-xs px-2 py-0.5 rounded border border-red-300 bg-white text-red-700 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> REI
            </span>
            <span className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-white text-amber-700 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Open obs
            </span>
          </div>
        )}

        {/* Rows */}
        <div className="space-y-4">
          {rowNumbers.map(rn => {
            const allRowContainers = byRow[rn] ?? [];
            const zone = subZoneId.charAt(1);
            const desig = subZoneId.charAt(2);
            const rowId = `Z${zone}-${desig}-R${rn}`;

            return (
              <div key={rn}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold text-gray-500">
                    Row {rn}{' '}
                    <span className="text-gray-400 font-normal">({allRowContainers.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {mode === 'state' && isAdmin && (
                      <button
                        onClick={() => { setBulkScope({ scope: 'row', scope_id: rowId, label: `${subZoneId} Row ${rn}` }); setBulkMsg(''); setBulkError(''); }}
                        className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5"
                      >
                        Set row…
                      </button>
                    )}
                    {mode === 'field' && (
                      <button
                        onClick={() => navigate(`/inspect/${rowId}`)}
                        className="text-xs font-semibold text-teal-700 hover:text-teal-900 px-2.5 py-1 rounded-lg hover:bg-teal-50 transition-colors"
                        style={{ minHeight: '32px' }}
                      >
                        Inspect Row →
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
                    {mode === 'field' ? (
                      allRowContainers.map(c => (
                        <ContainerCell
                          key={c.container_id}
                          container={c}
                          onLongPress={setActiveSheet}
                        />
                      ))
                    ) : (
                      allRowContainers.map(c => {
                        const isFiltered = stateFilter !== 'all' && c.current_state !== stateFilter;
                        return (
                          <ContainerCell
                            key={c.container_id}
                            container={c}
                            onTap={!isFiltered ? setActiveContainer : undefined}
                            onLongPress={undefined}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Field mode: action sheet on long-press */}
      {mode === 'field' && activeSheet && (
        <QuickActionSheet
          container={activeSheet}
          onClose={() => setActiveSheet(null)}
        />
      )}

      {/* State mode: ContainerQuickSheet on tap */}
      {mode === 'state' && activeContainer && (
        <ContainerQuickSheet
          container={activeContainer}
          subZonePotSize={sub_zone?.pot_size_gal}
          onClose={() => setActiveContainer(null)}
          onStateChanged={() => { setActiveContainer(null); reload(); }}
        />
      )}

      {/* Bulk state sheet (state mode admin) */}
      {bulkScope && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={() => setBulkScope(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-t-2xl w-full max-w-lg p-5 pb-24 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
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
                  className={`py-3 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ${STATE_CHIP_COLORS[state]} border-transparent hover:opacity-80`}
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

      {/* Field mode action bar — pinned above NavBar */}
      {mode === 'field' && (
        <div className="fixed bottom-20 left-0 right-0 z-40 bg-white border-t border-gray-100 px-4 py-3">
          <div className="max-w-5xl mx-auto flex gap-2 overflow-x-auto">
            {activeBatch && (
              <>
                <button
                  onClick={() => navigate(`/applications/fertigation/new?batch_id=${activeBatch.batch_id}`)}
                  className="bg-green-700 text-white rounded-2xl px-4 py-3 font-semibold text-sm whitespace-nowrap shrink-0"
                  style={{ minHeight: '48px' }}
                >
                  Apply Fertigation
                </button>
                <button
                  onClick={() => navigate(`/applications/foliar/new?batch_id=${activeBatch.batch_id}`)}
                  className="bg-gray-100 text-gray-800 rounded-2xl px-4 py-3 font-semibold text-sm whitespace-nowrap shrink-0"
                  style={{ minHeight: '48px' }}
                >
                  Log Foliar
                </button>
              </>
            )}
            <button
              onClick={() => {
                const zone = subZoneId.charAt(1);
                const desig = subZoneId.charAt(2);
                navigate(`/inspect/Z${zone}-${desig}-R1`);
              }}
              className="bg-gray-100 text-gray-800 rounded-2xl px-4 py-3 font-semibold text-sm whitespace-nowrap shrink-0"
              style={{ minHeight: '48px' }}
            >
              Walk Row
            </button>
          </div>
        </div>
      )}
    </>
  );
}
