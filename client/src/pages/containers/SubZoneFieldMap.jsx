import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../api';

const STATE_CELL = {
  active:          'bg-green-700 border-green-800 text-white',
  empty:           'bg-yellow-500 border-yellow-600 text-white',
  teardown:        'bg-orange-500 border-orange-600 text-white',
  startup:         'bg-blue-500 border-blue-600 text-white',
  ready:           'bg-green-200 border-green-300 text-green-900',
  out_of_service:  'bg-gray-400 border-gray-500 text-white',
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

function stateCounts(containers) {
  const counts = { active: 0, ready: 0, empty: 0, teardown: 0, startup: 0, out_of_service: 0 };
  for (const c of containers) {
    if (c.current_state in counts) counts[c.current_state]++;
  }
  return counts;
}

// Bottom sheet for quick actions on a container
function QuickActionSheet({ container, onClose }) {
  const navigate = useNavigate();
  const id = encodeURIComponent(container.container_id);

  // Close on backdrop tap
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={handleBackdrop}
    >
      <div className="w-full bg-white rounded-t-2xl p-5 pb-8 shadow-xl">
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
          >
            View Container Detail
          </button>
          <button
            onClick={() => navigate(`/observations/new?container_id=${container.container_id}`)}
            className="py-3 rounded-xl bg-gray-100 text-gray-800 font-medium text-sm"
          >
            Add Observation
          </button>
          <button
            onClick={() => navigate(`/applications/foliar/new?container_id=${container.container_id}`)}
            className="py-3 rounded-xl bg-gray-100 text-gray-800 font-medium text-sm"
          >
            Log Foliar
          </button>
          <button
            onClick={() => navigate(`/applications/pesticide/new?container_id=${container.container_id}`)}
            className="py-3 rounded-xl bg-gray-100 text-gray-800 font-medium text-sm"
          >
            Log Pesticide
          </button>
          <button
            onClick={() => navigate(`/containers/${id}/loss`)}
            className="py-3 rounded-xl bg-red-50 text-red-700 font-medium text-sm"
          >
            Record Loss
          </button>
        </div>
      </div>
    </div>
  );
}

// Individual container cell with tap/long-press
function ContainerCell({ container, onLongPress }) {
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
      onLongPress(container);
    }, 300);
  }

  function endPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!didLongPress.current) {
      navigate(`/containers/${encodeURIComponent(container.container_id)}`);
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
      {/* Overlay dots */}
      {(hasRei || hasObs) && (
        <div className="absolute top-1 right-1 flex gap-0.5">
          {hasRei && <span className="w-2 h-2 rounded-full bg-red-500 block" title="REI active" />}
          {hasObs && <span className="w-2 h-2 rounded-full bg-amber-400 block" title="Open observation" />}
        </div>
      )}
    </div>
  );
}

export default function SubZoneFieldMap() {
  const { subZoneId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSheet, setActiveSheet] = useState(null);

  useEffect(() => {
    if (!subZoneId) return;
    setLoading(true);
    api.getContainers({ sub_zone_id: subZoneId })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [subZoneId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-gray-500 text-sm">Loading field map…</div>
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

  // Group by row_number
  const byRow = {};
  for (const c of containers) {
    const rn = c.row_number;
    if (!byRow[rn]) byRow[rn] = [];
    byRow[rn].push(c);
  }
  const rowNumbers = Object.keys(byRow).map(Number).sort((a, b) => a - b);

  const totalRei = containers.filter(c => c.rei_active_until).length;
  const totalObs = containers.filter(c => c.has_open_observation).length;

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
        {/* Back */}
        <Link
          to="/containers"
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
        >
          ← All Zones
        </Link>

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            {subZoneId} — Field Map
          </h1>
          <div className="text-sm text-gray-500 mb-3">
            Zone {subZoneId.charAt(1)} · {sub_zone.pot_size_gal}-gal · {sub_zone.container_count} containers
          </div>

          {/* State count summary */}
          <div className="flex flex-wrap gap-2">
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

          {/* REI / observation alerts */}
          {(totalRei > 0 || totalObs > 0) && (
            <div className="mt-3 flex gap-3 flex-wrap">
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

        {/* Legend */}
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

        {/* Rows */}
        <div className="space-y-4">
          {rowNumbers.map(rn => {
            const rowContainers = byRow[rn] ?? [];
            return (
              <div key={rn}>
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Row {rn}</div>
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
                    {rowContainers.map(c => (
                      <ContainerCell
                        key={c.container_id}
                        container={c}
                        onLongPress={setActiveSheet}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick action bottom sheet */}
      {activeSheet && (
        <QuickActionSheet
          container={activeSheet}
          onClose={() => setActiveSheet(null)}
        />
      )}
    </>
  );
}
