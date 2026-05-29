import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';

const STATUS_CHIP = {
  'cult-hoop': 'bg-green-100 text-green-700',
  'field-veg': 'bg-green-100 text-green-800',
};

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl`}>
        {message}
      </div>
    </div>
  );
}

// Slide-up sheet for assigning a specific sub-zone
function AssignSheet({ zone, maxAssignable, batch, onClose, onAssigned }) {
  const [count, setCount] = useState(String(Math.min(zone.ready_count, maxAssignable)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const parsed = parseInt(count, 10);
  const invalid = isNaN(parsed) || parsed <= 0 || parsed > zone.ready_count;

  async function handleAssign() {
    if (invalid || busy) return;
    setBusy(true);
    setErr('');
    try {
      const result = await api.assignZone(batch.batch_id, {
        sub_zone_id: zone.sub_zone_id,
        count: parsed,
      });
      onAssigned(result);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl pb-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>
                Assign to {zone.sub_zone_id}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                {zone.pot_size_gal}-gal · {zone.ready_count} ready slot{zone.ready_count !== 1 ? 's' : ''} available
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="px-5 pt-5 pb-2">
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">
            Containers to fill
          </label>
          <p className="text-xs text-gray-500 mb-3">
            {maxAssignable} plant{maxAssignable !== 1 ? 's' : ''} unassigned ·{' '}
            {zone.ready_count} slot{zone.ready_count !== 1 ? 's' : ''} ready
          </p>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={zone.ready_count}
            value={count}
            onChange={e => setCount(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold font-mono text-center focus:outline-none focus:ring-2 focus:ring-green-600"
            style={{ minHeight: '64px' }}
            autoFocus
          />
          {invalid && count !== '' && (
            <p className="text-red-500 text-xs mt-1.5">
              {parsed > zone.ready_count
                ? `Only ${zone.ready_count} ready slot${zone.ready_count !== 1 ? 's' : ''} available`
                : 'Enter a number greater than 0'}
            </p>
          )}
          {err && <p className="text-red-600 text-sm mt-2 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
        </div>

        <div className="px-5 pt-3">
          <button
            onClick={handleAssign}
            disabled={invalid || busy}
            className="w-full py-4 bg-green-800 text-white font-semibold rounded-2xl hover:bg-green-900 disabled:opacity-40 transition-colors text-base"
            style={{ minHeight: '56px' }}
          >
            {busy ? 'Assigning…' : `Assign ${!invalid ? parsed : ''} Container${parsed !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssignToField() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [batch, setBatch] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [activeZone, setActiveZone] = useState(null); // zone being assigned

  const load = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([
        api.getBatch(id),
        api.getFieldAssignment(id),
      ]);
      setBatch(b);
      setAssignment(a);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handleAssigned(result) {
    setAssignment(result.field_assignment);
    setActiveZone(null);
    setToast({ message: `${result.assigned} container${result.assigned !== 1 ? 's' : ''} assigned to ${result.sub_zone_id} · Plan v${result.field_assignment?.latest_plan?.version ?? ''} saved` });
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-6 text-gray-500 text-sm">Loading…</div>;
  }

  if (error || !batch || !assignment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error || 'Not found'}</div>
      </div>
    );
  }

  const { total_plants, total_assigned, total_unassigned, zones } = assignment;
  const pct = total_plants > 0 ? Math.round((total_assigned / total_plants) * 100) : 0;

  // Zones with any assignment or any ready slots — filter out totally empty zones
  const relevantZones = zones.filter(z => z.assigned_count > 0 || z.ready_count > 0);
  const emptyZones = zones.filter(z => z.assigned_count === 0 && z.ready_count === 0);

  return (
    <>
      {toast && <Toast message={toast.message} type="success" onDone={() => setToast(null)} />}
      {activeZone && (
        <AssignSheet
          zone={activeZone}
          maxAssignable={total_unassigned}
          batch={batch}
          onClose={() => setActiveZone(null)}
          onAssigned={handleAssigned}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <button
          onClick={() => navigate(`/batches/${id}`)}
          className="text-sm text-green-700 font-medium mb-5 flex items-center gap-1 hover:text-green-900"
        >
          ← {batch.name || batch.strain_name}
        </button>

        {/* Batch header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            Assign to Field
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500">
            <span className="font-medium text-gray-700">{batch.name || batch.strain_name}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {batch.status}
            </span>
          </div>
        </div>

        {/* Progress summary */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
                {total_assigned}
                <span className="text-lg font-normal text-gray-400"> / {total_plants}</span>
              </div>
              <div className="text-sm text-gray-500 mt-0.5">plants assigned</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-600 font-mono tabular-nums">{total_unassigned}</div>
              <div className="text-sm text-gray-500">remaining</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-green-600 h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1.5 text-right">{pct}% placed</div>

          {/* Plan history link */}
          {assignment.latest_plan && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Plan auto-saved after each assignment</span>
              <Link
                to={`/planting-plans?batch_id=${id}`}
                className="text-green-700 font-semibold hover:text-green-900"
              >
                View History →
              </Link>
            </div>
          )}
        </div>

        {/* Zone assignment cards */}
        {total_unassigned === 0 && total_assigned > 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 mb-4 text-sm text-green-800 font-medium">
            All {total_plants} plants assigned to field. ✓
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {relevantZones.map(zone => {
            const isFull = zone.ready_count === 0 && zone.assigned_count > 0;
            const hasAssigned = zone.assigned_count > 0;
            const canAssign = zone.ready_count > 0 && total_unassigned > 0;

            return (
              <div
                key={zone.sub_zone_id}
                className={`bg-white border rounded-2xl px-5 py-4 flex items-center gap-4 ${
                  isFull ? 'border-green-200' : 'border-gray-200'
                }`}
              >
                {/* Zone label */}
                <div className="flex-shrink-0 w-16 text-center">
                  <div className="font-bold text-lg text-gray-900 font-mono">{zone.sub_zone_id}</div>
                  <div className="text-xs text-gray-400">{zone.pot_size_gal}-gal</div>
                </div>

                {/* Assignment status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-gray-900 font-mono tabular-nums text-lg">
                      {zone.assigned_count}
                    </span>
                    <span className="text-sm text-gray-400">assigned</span>
                    {zone.ready_count > 0 && (
                      <span className="text-sm text-green-700 font-medium">
                        · {zone.ready_count} ready
                      </span>
                    )}
                  </div>

                  {/* Mini progress bar */}
                  {zone.total_containers > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                      <div
                        className="bg-green-500 h-full rounded-full"
                        style={{ width: `${Math.round((zone.assigned_count / zone.total_containers) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="flex-shrink-0">
                  {canAssign ? (
                    <button
                      onClick={() => setActiveZone(zone)}
                      className="px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 active:scale-95 transition-all"
                      style={{ minHeight: '44px' }}
                    >
                      Assign
                    </button>
                  ) : isFull ? (
                    <span className="text-xs text-green-700 font-semibold">Full ✓</span>
                  ) : total_unassigned === 0 ? (
                    <span className="text-xs text-gray-400">All placed</span>
                  ) : (
                    <span className="text-xs text-gray-400">No ready slots</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Zones with no ready slots and no assignments — collapsed */}
          {emptyZones.length > 0 && (
            <div className="text-xs text-gray-400 text-center py-2">
              {emptyZones.map(z => z.sub_zone_id).join(', ')} — no ready containers
            </div>
          )}
        </div>
      </div>
    </>
  );
}
