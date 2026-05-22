import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, MapPin, Sprout } from 'lucide-react';
import { api } from '../../api';

// ─── Static config ─────────────────────────────────────────────────────────

const PRE_FIELD = [
  { name: 'Germ-01',   type: 'germination' },
  { name: 'Seedlings', type: 'seedling'    },
  { name: 'Cult-Hoop', type: 'veg'         },
];

const FIELD_SUB_ZONES = ['Z1A', 'Z1B', 'Z2A', 'Z2B', 'Z3A', 'Z3B', 'Z4A', 'Z4B'];

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
  'germ':           'Germination',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Field — Veg',
  'field-flower':   'Field — Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
};

const STATE_BAR_COLOR = {
  ready:          'bg-green-200',
  active:         'bg-green-500',
  empty:          'bg-amber-300',
  teardown:       'bg-orange-400',
  startup:        'bg-blue-400',
  out_of_service: 'bg-gray-400',
};

const STATE_LABELS = {
  ready:          'Ready',
  active:         'Active',
  empty:          'Empty',
  teardown:       'Teardown',
  startup:        'Startup',
  out_of_service: 'OOS',
};

const ALL_STATES = ['active', 'empty', 'ready', 'startup', 'teardown', 'out_of_service'];

// ─── Sub-components ─────────────────────────────────────────────────────────

function BatchCard({ batch, plan, navigate }) {
  const isCultHoop = batch.status === 'cult-hoop';
  const chipCls = STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600';

  function handlePlanClick(e) {
    e.stopPropagation();
    if (plan) {
      navigate(`/planting-plans/${plan.plan_id}`);
    } else {
      navigate(`/planting-plans/new?batch_id=${batch.batch_id}`);
    }
  }

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors"
      onClick={() => navigate(`/batches/${batch.batch_id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{batch.strain_name}</p>
          <p className="text-sm text-gray-500">
            {batch.plant_count_current ?? batch.plant_count_initial} plants
            {batch.days_in_stage != null ? ` · Day ${batch.days_in_stage}` : ''}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${chipCls}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
      </div>
      {isCultHoop && (
        <button
          onClick={handlePlanClick}
          className="mt-2 w-full text-xs font-semibold bg-green-700 text-white rounded-md px-3 py-1.5 hover:bg-green-800 transition-colors"
        >
          {plan ? 'View Field Plan' : 'Plan Field Placement'}
        </button>
      )}
    </div>
  );
}

function StateBar({ counts, total }) {
  if (!total) return <div className="h-3 bg-gray-100 rounded-full" />;
  return (
    <div className="flex h-3 rounded-full overflow-hidden gap-px">
      {ALL_STATES.map(state => {
        const n = counts[state] ?? 0;
        if (!n) return null;
        const pct = (n / total) * 100;
        return (
          <div
            key={state}
            className={`${STATE_BAR_COLOR[state]} flex-none`}
            style={{ width: `${pct}%` }}
            title={`${STATE_LABELS[state]}: ${n}`}
          />
        );
      })}
    </div>
  );
}

function StateCountRow({ counts }) {
  const nonZero = ALL_STATES.filter(s => (counts[s] ?? 0) > 0);
  if (!nonZero.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
      {nonZero.map(state => (
        <span key={state} className="text-xs text-gray-500">
          {counts[state]} {STATE_LABELS[state].toLowerCase()}
        </span>
      ))}
    </div>
  );
}

function FieldSubZoneCard({ szId, summary, batch, isMobile, expanded, onToggle }) {
  const potLabel = summary ? `${summary.pot_size_gal}-gal` : '';
  const total = summary?.container_count ?? 0;
  const counts = summary?.counts ?? {};

  const inner = (
    <>
      <StateBar counts={counts} total={total} />
      <StateCountRow counts={counts} />
      {batch ? (
        <div className="mt-2 flex items-center gap-2">
          <Sprout size={13} className="text-green-700 shrink-0" />
          <span className="text-sm font-medium text-gray-900 truncate">{batch.strain_name}</span>
          <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[batch.status] ?? batch.status}
          </span>
          {batch.days_in_stage != null && (
            <span className="text-xs text-gray-500 shrink-0">Day {batch.days_in_stage}</span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400 italic">No active batch</p>
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800">{szId}</span>
            {potLabel && <span className="text-xs text-gray-400">{potLabel}</span>}
            {batch && (
              <span className="text-xs text-gray-600 truncate max-w-[120px]">{batch.strain_name}</span>
            )}
          </div>
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </button>
        {expanded && <div className="px-3 pb-3 bg-white border-t border-gray-100">{inner}</div>}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">{szId}</span>
          {potLabel && <span className="text-xs text-gray-400">{potLabel} · {total} containers</span>}
        </div>
        <Link
          to={`/containers/map/${szId}`}
          className="text-xs text-blue-600 font-semibold hover:text-blue-800 shrink-0"
        >
          Field Map →
        </Link>
      </div>
      {inner}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function LocationView() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [summary, setSummary] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedZones, setExpandedZones] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    Promise.all([
      api.getBatches({ status: 'active' }),
      api.getContainerSummary(),
      api.getPlantingPlans(),
    ])
      .then(([b, s, p]) => { setBatches(b); setSummary(s); setPlans(p); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleZone(szId) {
    setExpandedZones(prev => ({ ...prev, [szId]: !prev[szId] }));
  }

  // Index batches by location
  const preBatches = {}; // locationName → batch[]
  const fieldBatches = {}; // sub_zone_id → batch (most recent active)
  for (const b of batches) {
    if (!b.current_location_name) continue;
    if (b.current_location_type === 'field') {
      // sub_zone_id matches location name for field locations
      fieldBatches[b.current_location_name] = b;
    } else {
      if (!preBatches[b.current_location_name]) preBatches[b.current_location_name] = [];
      preBatches[b.current_location_name].push(b);
    }
  }

  // Index container summary by sub_zone_id
  const summaryByZone = Object.fromEntries(summary.map(s => [s.sub_zone_id, s]));

  // Index plans: batch_id → latest draft or active plan
  const planByBatch = {};
  for (const p of plans) {
    if (p.status !== 'draft' && p.status !== 'active') continue;
    const existing = planByBatch[p.batch_id];
    if (!existing || p.plan_id > existing.plan_id) {
      planByBatch[p.batch_id] = p;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-gray-400">
        Loading locations…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <MapPin size={20} className="text-green-700" />
        <h1 className="text-xl font-bold text-gray-900">Locations</h1>
      </div>

      {/* ── Pre-field ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Pre-field
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PRE_FIELD.map(loc => {
            const locationBatches = preBatches[loc.name] ?? [];
            return (
              <div key={loc.name} className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-2">{loc.name}</h3>
                {locationBatches.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No batches here</p>
                ) : (
                  <div className="space-y-2">
                    {locationBatches.map(b => (
                      <BatchCard
                        key={b.batch_id}
                        batch={b}
                        plan={planByBatch[b.batch_id] ?? null}
                        navigate={navigate}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Field ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Field — Zones 1–4
        </h2>

        {/* Mobile: accordion list */}
        {isMobile ? (
          <div className="space-y-2">
            {FIELD_SUB_ZONES.map(szId => (
              <FieldSubZoneCard
                key={szId}
                szId={szId}
                summary={summaryByZone[szId]}
                batch={fieldBatches[szId] ?? null}
                isMobile={true}
                expanded={!!expandedZones[szId]}
                onToggle={() => toggleZone(szId)}
              />
            ))}
          </div>
        ) : (
          /* Desktop: 2×4 grid (zones as columns, A/B as rows within each zone) */
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(z => (
              <div key={z} className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">
                  Zone {z}
                </p>
                {['A', 'B'].map(d => {
                  const szId = `Z${z}${d}`;
                  return (
                    <FieldSubZoneCard
                      key={szId}
                      szId={szId}
                      summary={summaryByZone[szId]}
                      batch={fieldBatches[szId] ?? null}
                      isMobile={false}
                      expanded={true}
                      onToggle={() => {}}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
