import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

// ─── Status / phase maps ───────────────────────────────────────────────────

const STATUS_LABELS = {
  'germ':           'Germination',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Field — Veg',
  'field-flower':   'Field — Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
  'closed':         'Closed',
  'harvest':        'Harvest (legacy)',
};

const STATUS_CHIP = {
  'germ':           'bg-gray-100 text-gray-700',
  'seedling':       'bg-lime-100 text-lime-700',
  'cult-hoop':      'bg-green-100 text-green-700',
  'field-veg':      'bg-green-100 text-green-800',
  'field-flower':   'bg-purple-100 text-purple-700',
  'flush':          'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700',
  'harvesting':     'bg-red-100 text-red-700',
  'closed':         'bg-gray-100 text-gray-400',
  'harvest':        'bg-orange-100 text-orange-700',
};

// Physical location for each status
const LOCATION_LABEL = {
  'germ':           'Germ-01',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Field',
  'field-flower':   'Field',
  'flush':          'Field',
  'harvest_window': 'Field',
  'harvesting':     'Field',
  'closed':         null,
};

// What the transition button says
const TRANSITION_ACTION = {
  'seedling':       'Move to Seedlings',
  'cult-hoop':      'Move to Cult-Hoop',
  'field-veg':      'Move to Field',
  'field-flower':   'Begin Flower',
  'flush':          'Begin Flush',
  'harvest_window': 'Begin Harvest Window',
  'harvesting':     'Begin Harvesting',
  'closed':         'Close Plant Batch',
};

// Description shown in lifecycle timeline
const STAGE_DESC = {
  'germ':           'Days 0–7 · BASE recipe · Tray-level',
  'seedling':       'Days 7–21 · BASE → SEEDLING · Sub-zone',
  'cult-hoop':      'Days 17–25 · SEEDLING recipe · Sub-zone',
  'field-veg':      'Day 25+ · VEG recipe · Drip irrigation',
  'field-flower':   'Bloom phase · FLOWER recipe',
  'flush':          'Pre-harvest · FLUSH recipe',
  'harvest_window': 'Daily maturity assessments · Per-container',
  'harvesting':     '1–2 day harvest window · Per-plant events',
  'closed':         'All plants harvested',
};

const LIFECYCLE_ORDER = [
  'germ', 'seedling', 'cult-hoop', 'field-veg', 'field-flower',
  'flush', 'harvest_window', 'harvesting', 'closed',
];

const NEXT_STATUS = {
  'germ':           'seedling',
  'seedling':       'cult-hoop',
  'cult-hoop':      'field-veg',
  'field-veg':      'field-flower',
  'field-flower':   'flush',
  'flush':          'harvest_window',
  'harvest_window': 'harvesting',
  'harvesting':     'closed',
  // legacy
  'harvest':        'closed',
};

const DATE_FOR_STATUS = {
  'seedling':       'transplant_date',
  'field-veg':      'field_move_date',
  'harvest_window': 'harvest_date',
  'harvest':        'harvest_date',
  'closed':         'closed_date',
};

const STAGE_DATES = {
  'germ':           b => b.sow_date,
  'seedling':       b => b.transplant_date,
  'cult-hoop':      b => b.transplant_date,
  'field-veg':      b => b.field_move_date,
  'field-flower':   b => b.field_move_date,
  'flush':          b => b.harvest_date,
  'harvest_window': b => b.harvest_date,
  'harvesting':     b => b.harvest_date,
  'closed':         b => b.closed_date,
};

const SUB_ZONES = [
  { id: 'Z1A', potSize: '30 gal' }, { id: 'Z1B', potSize: '10 gal' },
  { id: 'Z2A', potSize: '30 gal' }, { id: 'Z2B', potSize: '10 gal' },
  { id: 'Z3A', potSize: '30 gal' }, { id: 'Z3B', potSize: '10 gal' },
  { id: 'Z4A', potSize: '30 gal' }, { id: 'Z4B', potSize: '10 gal' },
];

// ─── Main Component ────────────────────────────────────────────────────────

export default function BatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  function load() {
    setLoading(true);
    api.getBatch(id)
      .then(data => { setBatch(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-6 text-gray-500 text-sm">Loading…</div>;
  if (error || !batch) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error || 'Plant batch not found'}</div>
      </div>
    );
  }

  const nextStatus = NEXT_STATUS[batch.status];
  const currentStatusIdx = LIFECYCLE_ORDER.indexOf(batch.status);
  const location = LOCATION_LABEL[batch.status];

  async function handleTransition(toStatus, notes, subZoneId) {
    try {
      // Set sub_zone before field transition if provided
      if (subZoneId) {
        await api.updateBatch(batch.batch_id, { sub_zone_id: subZoneId });
      }
      const updated = await api.transitionBatch(id, { to_status: toStatus, notes });
      setBatch(b => ({ ...b, ...updated, sub_zone_id: subZoneId || b.sub_zone_id }));
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // ── METRC phase helpers ─────────────────────────────────────────────────
  const metrcPhase = batch.metrc_phase ?? 'Immature';
  const METRC_PHASE_CHIP = {
    'Immature':   'bg-lime-100 text-lime-800',
    'Vegetative': 'bg-green-100 text-green-800',
    'Flowering':  'bg-purple-100 text-purple-800',
    'Closed':     'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">

      {/* Back */}
      <button onClick={() => navigate('/batches')} className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
        ← Plant Batches
      </button>

      {/* ── METRC Identity Card ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">

        {/* Strain + type + internal status */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'Fraunces, serif' }}>
              {batch.strain_name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                batch.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {batch.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[batch.status] ?? batch.status}
              </span>
            </div>
          </div>
          {batch.sub_zone_id && (
            <button
              onClick={() => navigate(`/containers?sub_zone_id=${batch.sub_zone_id}`)}
              className="text-xs text-green-700 font-medium hover:text-green-900 underline flex-shrink-0"
            >
              View Containers
            </button>
          )}
        </div>

        {/* METRC batch name */}
        {batch.metrc_batch_name && (
          <button
            onClick={() => navigator.clipboard?.writeText(batch.metrc_batch_name)}
            className="w-full text-left bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 hover:bg-gray-100 transition-colors group"
            title="Tap to copy"
          >
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">METRC Plant Batch Name</div>
            <div className="font-mono text-sm font-bold text-gray-800">{batch.metrc_batch_name}</div>
            <div className="text-[10px] text-gray-400 mt-0.5 group-hover:text-green-600">tap to copy</div>
          </button>
        )}

        {/* Phase · Count · Location row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <span className={`text-xs font-bold px-2 py-1 rounded-full block mb-1 ${METRC_PHASE_CHIP[metrcPhase] ?? 'bg-gray-100 text-gray-600'}`}>
              {metrcPhase}
            </span>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">METRC phase</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {batch.plant_count_current ?? batch.plant_count_initial}
            </div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">plants</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            {batch.current_location_name ? (
              <>
                <div className="text-xs font-bold text-gray-800">📍 {batch.current_location_name}</div>
                {batch.sub_zone_id && (
                  <div className="text-xs text-gray-500 mt-0.5">{batch.sub_zone_id}</div>
                )}
              </>
            ) : (
              <div className="text-xs text-gray-400">No location</div>
            )}
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">location</div>
          </div>
        </div>

        {/* Day in stage + sow date */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span>Day <span className="font-semibold text-gray-700">{batch.days_in_stage ?? 0}</span> in stage</span>
          <span>Sow <span className="font-semibold text-gray-700 font-mono">{batch.sow_date}</span></span>
          {batch.plants_per_container > 1 && (
            <span><span className="font-semibold text-gray-700">{batch.plants_per_container}</span> per container</span>
          )}
        </div>
      </div>

      {/* METRC UID edit */}
      {batch.status !== 'closed' && isSupervisor && (
        <MetrcEditInline batch={batch} onSaved={updated => setBatch(b => ({ ...b, ...updated }))} />
      )}

      {/* Fertigation recipe */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Fertigation Recipe</h2>
          {isSupervisor && batch.status !== 'closed' && (
            <button onClick={() => setShowRecipeModal(true)} className="text-xs text-green-700 font-medium hover:text-green-900">
              {batch.active_recipe_id ? 'Change' : 'Assign'}
            </button>
          )}
        </div>
        {batch.active_recipe_id ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>
                {batch.active_recipe_name}
              </span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                v{batch.active_recipe_version}
              </span>
            </div>
            <div className="flex gap-4 text-sm text-gray-600">
              {batch.active_recipe_ec_low != null && <span>EC {batch.active_recipe_ec_low}–{batch.active_recipe_ec_high} mS/cm</span>}
              {batch.active_recipe_ph_low != null && <span>pH {batch.active_recipe_ph_low}–{batch.active_recipe_ph_high}</span>}
            </div>
          </div>
        ) : (
          <span className="text-sm text-amber-600 font-medium">No fertigation recipe assigned</span>
        )}
      </div>

      {/* ── Quick actions for this batch ──────────────────────────────── */}
      {batch.status !== 'closed' && (
        <div className="mb-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Log for this batch</h2>
          <div className="flex flex-col gap-2">
            {batch.status !== 'harvesting' && (
              <Link
                to={`/applications/fertigation/new?batch_id=${batch.batch_id}`}
                className="flex items-center justify-between w-full bg-green-800 text-white font-semibold rounded-2xl px-5 hover:bg-green-900 transition-colors shadow-sm"
                style={{ minHeight: '56px', textDecoration: 'none' }}
              >
                <span className="flex items-center gap-2"><span className="text-lg">💧</span>Log Fertigation</span>
                <span className="text-green-300">→</span>
              </Link>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link
                to={`/applications/foliar/new?batch_id=${batch.batch_id}`}
                className="flex items-center gap-2 px-4 py-3 bg-green-50 border-2 border-green-200 text-green-900 font-semibold text-sm rounded-2xl hover:border-green-400 transition-colors"
                style={{ minHeight: '56px', textDecoration: 'none' }}
              >
                <span className="text-lg">🌿</span>Foliar
              </Link>
              <Link
                to={`/applications/amendments/new`}
                className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-2 border-amber-200 text-amber-900 font-semibold text-sm rounded-2xl hover:border-amber-400 transition-colors"
                style={{ minHeight: '56px', textDecoration: 'none' }}
              >
                <span className="text-lg">🪱</span>Amendment
              </Link>
              <Link
                to={`/applications/pesticide/new?batch_id=${batch.batch_id}`}
                className="flex items-center gap-2 px-4 py-3 bg-red-50 border-2 border-red-200 text-red-900 font-semibold text-sm rounded-2xl hover:border-red-400 transition-colors"
                style={{ minHeight: '56px', textDecoration: 'none' }}
              >
                <span className="text-lg">⚗️</span>Pesticide
              </Link>
              <Link
                to={`/observations/new?batch_id=${batch.batch_id}`}
                className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-2 border-blue-200 text-blue-900 font-semibold text-sm rounded-2xl hover:border-blue-400 transition-colors"
                style={{ minHeight: '56px', textDecoration: 'none' }}
              >
                <span className="text-lg">🔍</span>Observe
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase & Location History ─────────────────────────────────────── */}
      <BatchHistory batch={batch} />

      {/* ── Advance Phase ────────────────────────────────────────────────── */}
      {nextStatus && isSupervisor && batch.status !== 'closed' && (
        <div className="mb-4">
          <button
            onClick={() => setShowTransitionModal(true)}
            className="w-full py-4 bg-green-800 text-white font-semibold rounded-2xl hover:bg-green-900 transition-colors text-sm shadow-sm"
            style={{ minHeight: '56px' }}
          >
            {TRANSITION_ACTION[nextStatus] ?? `Move to ${STATUS_LABELS[nextStatus]}`} →
          </button>
        </div>
      )}

      {/* Application counts */}
      {(batch.application_counts?.fertigation > 0 || batch.application_counts?.foliar > 0 || batch.application_counts?.pesticide > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Applications</h2>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            {[
              { count: batch.application_counts.fertigation, label: 'Fertigation' },
              { count: batch.application_counts.foliar,      label: 'Foliar' },
              { count: batch.application_counts.pesticide,   label: 'Pesticide' },
            ].map(({ count, label }) => (
              <div key={label}>
                <div className="text-lg font-bold text-green-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{count}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {batch.notes && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{batch.notes}</p>
        </div>
      )}

      {/* Modals */}
      {showRecipeModal && (
        <RecipeModal
          batch={batch}
          onClose={() => setShowRecipeModal(false)}
          onAssigned={updated => { setBatch(b => ({ ...b, ...updated })); setShowRecipeModal(false); load(); }}
        />
      )}

      {showTransitionModal && nextStatus && (
        <TransitionModal
          nextStatus={nextStatus}
          nextLabel={STATUS_LABELS[nextStatus]}
          actionLabel={TRANSITION_ACTION[nextStatus]}
          requiresSubZone={nextStatus === 'field-veg' && !batch.sub_zone_id}
          requiresNotes={nextStatus === 'harvesting'}
          onClose={() => setShowTransitionModal(false)}
          onConfirm={(notes, subZoneId) => {
            setShowTransitionModal(false);
            handleTransition(nextStatus, notes, subZoneId);
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function toMetrcPhase(status) {
  if (['germ', 'seedling', 'cult-hoop'].includes(status)) return 'Immature';
  if (status === 'field-veg') return 'Vegetative';
  if (['field-flower', 'flush', 'harvest_window', 'harvesting'].includes(status)) return 'Flowering';
  return 'Closed';
}

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ts.slice(0, 10); }
}

function MetrcSyncBadge({ status }) {
  if (status === 'not_required') return null;
  const map = {
    pending: 'bg-amber-100 text-amber-700',
    synced:  'bg-green-100 text-green-700',
    failed:  'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      METRC {status}
    </span>
  );
}

function BatchHistory({ batch }) {
  const phaseEvents = (batch.phase_history ?? []).map(p => ({
    type: 'phase',
    ts: p.transitioned_at,
    from_status: p.from_status,
    to_status: p.to_status,
    by: p.transitioned_by_name,
    notes: p.notes,
    metrc_sync_status: p.metrc_sync_status,
  }));

  const locationEvents = (batch.location_history ?? []).map(l => ({
    type: 'location',
    ts: l.moved_at,
    from_location: l.from_location_name,
    to_location: l.to_location_name,
    by: l.moved_by_name,
    trigger: l.trigger,
    metrc_sync_status: l.metrc_sync_status,
  }));

  const timeline = [...phaseEvents, ...locationEvents]
    .sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''));

  if (timeline.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
      <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-4">Phase & Location History</h2>
      <div className="flex flex-col gap-0">
        {timeline.map((evt, i) => {
          const isLast = i === timeline.length - 1;
          if (evt.type === 'phase') {
            const fromPhase = evt.from_status ? toMetrcPhase(evt.from_status) : null;
            const toPhase = toMetrcPhase(evt.to_status);
            const phaseChanged = fromPhase && fromPhase !== toPhase;
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                    isLast ? 'bg-green-700' : 'bg-gray-300'
                  }`} />
                  {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
                </div>
                <div className="pb-4 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">
                      {evt.from_status ? STATUS_LABELS[evt.from_status] ?? evt.from_status : 'Created'}
                      {evt.from_status ? ` → ${STATUS_LABELS[evt.to_status] ?? evt.to_status}` : `: ${STATUS_LABELS[evt.to_status] ?? evt.to_status}`}
                    </span>
                    {phaseChanged && (
                      <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.5 rounded">
                        {fromPhase} → {toPhase}
                      </span>
                    )}
                    {!phaseChanged && toPhase && (
                      <span className="text-xs text-gray-400">{toPhase}</span>
                    )}
                    <MetrcSyncBadge status={evt.metrc_sync_status} />
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    <span>{fmtTs(evt.ts)}</span>
                    {evt.by && <span>by {evt.by}</span>}
                  </div>
                  {evt.notes && (
                    <div className="text-xs text-gray-500 mt-1 italic">"{evt.notes}"</div>
                  )}
                </div>
              </div>
            );
          }

          // location event
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                  isLast ? 'bg-blue-500' : 'bg-gray-200'
                }`} />
                {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
              </div>
              <div className="pb-4 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">
                    📍 {evt.to_location}
                  </span>
                  {evt.from_location && (
                    <span className="text-xs text-gray-400">from {evt.from_location}</span>
                  )}
                  <MetrcSyncBadge status={evt.metrc_sync_status} />
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                  <span>{fmtTs(evt.ts)}</span>
                  {evt.by && <span>by {evt.by}</span>}
                  {evt.trigger && evt.trigger !== 'manual' && (
                    <span className="capitalize">({evt.trigger.replace(/_/g, ' ')})</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, sub, mono }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <div className={`text-lg font-bold text-gray-900 ${mono ? 'text-base' : ''}`}
        style={mono ? { fontFamily: 'JetBrains Mono, monospace' } : {}}>
        {label}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function MetrcEditInline({ batch, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(batch.metrc_plant_batch_uid ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isValid = value.length === 0 || /^[A-Za-z0-9]{24}$/.test(value.trim());

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className="w-full flex items-center justify-between mb-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 hover:border-green-400 transition-colors text-left"
      >
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">METRC Plant Batch UID</div>
          {batch.metrc_plant_batch_uid ? (
            <span className="font-mono text-sm text-gray-700 tracking-wide">{batch.metrc_plant_batch_uid}</span>
          ) : (
            <span className="text-sm text-amber-600 font-medium">Not set — required before harvest</span>
          )}
        </div>
        <span className="text-xs text-green-700 font-semibold ml-3 flex-shrink-0">Edit</span>
      </button>
    );
  }

  return (
    <div className="mb-4 bg-gray-50 border border-green-300 rounded-xl px-4 py-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">METRC Plant Batch UID</div>
      <input
        className={`w-full border rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-600 bg-white ${
          !isValid && value.length > 0 ? 'border-red-400' : value.length === 24 ? 'border-green-500' : 'border-gray-300'
        }`}
        placeholder="e.g. 1A4FF0300000222000001234"
        value={value}
        onChange={e => { setValue(e.target.value.trim()); setErr(''); }}
        maxLength={24}
        autoCapitalize="characters"
        spellCheck={false}
      />
      <div className="flex items-center justify-between mt-1 mb-3">
        {!isValid && value.length > 0 ? (
          <span className="text-red-600 text-xs">Must be exactly 24 alphanumeric characters</span>
        ) : value.length === 24 ? (
          <span className="text-green-700 text-xs font-medium">✓ Valid format</span>
        ) : (
          <span className="text-gray-400 text-xs">{24 - value.length} characters remaining</span>
        )}
        <span className="text-xs text-gray-400 font-mono">{value.length}/24</span>
      </div>
      {err && <p className="text-red-600 text-xs mb-2">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={async () => {
            if (value.length > 0 && !isValid) { setErr('Must be exactly 24 alphanumeric characters'); return; }
            setSaving(true);
            try {
              const updated = await api.updateBatch(batch.batch_id, { metrc_plant_batch_uid: value.trim() || null });
              onSaved(updated);
              setEditing(false);
            } catch (e) { setErr(e.message); }
            setSaving(false);
          }}
          disabled={saving || (value.length > 0 && !isValid)}
          className="flex-1 bg-green-800 text-white text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-green-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => { setEditing(false); setValue(batch.metrc_plant_batch_uid ?? ''); setErr(''); }} className="text-sm text-gray-500 hover:text-gray-700 px-3">
          Cancel
        </button>
      </div>
    </div>
  );
}

function TransitionModal({ nextStatus, nextLabel, actionLabel, requiresSubZone, requiresNotes, onClose, onConfirm }) {
  const [notes, setNotes] = useState('');
  const [subZoneId, setSubZoneId] = useState('');
  const [saving, setSaving] = useState(false);

  const canConfirm = (!requiresSubZone || subZoneId !== '') && (!requiresNotes || notes.trim() !== '');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>
            {actionLabel}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Moving this plant batch to <strong>{nextLabel}</strong>. This transition is logged and cannot be undone.
        </p>

        {/* Sub-zone picker — shown only for "Move to Field" */}
        {requiresSubZone && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Assign Sub-zone <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Sub-zone is set when the batch enters the field. This is its permanent location for this run.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {SUB_ZONES.map(sz => (
                <button
                  key={sz.id}
                  onClick={() => setSubZoneId(subZoneId === sz.id ? '' : sz.id)}
                  className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                    subZoneId === sz.id
                      ? 'bg-green-800 text-white border-green-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                  }`}
                  style={{ minHeight: '56px' }}
                >
                  <div className="font-semibold">{sz.id}</div>
                  <div className={`text-xs mt-0.5 ${subZoneId === sz.id ? 'text-green-200' : 'text-gray-400'}`}>
                    {sz.potSize}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Notes{requiresNotes ? <span className="text-red-500"> *</span> : ' (optional)'}
          </label>
          {requiresNotes && (
            <p className="text-xs text-gray-500 mb-2">
              Required: describe the observation evidence supporting this harvest decision (e.g. "R1–R3 showing 90%+ trichome maturity per May 21 obs log").
            </p>
          )}
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={requiresNotes ? 'Observation evidence for this decision…' : 'Optional notes about this transition…'}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={!canConfirm || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(notes || null, subZoneId || null);
              setSaving(false);
            }}
            className="flex-1 py-3 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 disabled:opacity-50"
            style={{ minHeight: '56px' }}
          >
            {saving ? 'Moving…' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeModal({ batch, onClose, onAssigned }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getFertigationRecipes()
      .then(data => { setRecipes(data.filter(r => r.recipe_id != null)); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-10 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            {batch.active_recipe_id ? 'Change Recipe' : 'Assign Recipe'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        {loading ? (
          <div className="text-gray-500 text-sm">Loading recipes…</div>
        ) : recipes.length === 0 ? (
          <div className="text-amber-600 text-sm">No active recipes found.</div>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {recipes.map(recipe => (
              <button key={recipe.recipe_id} onClick={() => setSelected(recipe)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  selected?.recipe_id === recipe.recipe_id ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-green-300'
                }`}
                style={{ minHeight: '56px' }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>{recipe.name}</span>
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">v{recipe.version}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {recipe.ec_target_low != null ? `EC ${recipe.ec_target_low}–${recipe.ec_target_high}` : ''}
                  {recipe.ph_target_low != null ? ` · pH ${recipe.ph_target_low}–${recipe.ph_target_high}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why this recipe is being assigned…"
            />
          </div>
        )}
        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
        <button
          disabled={!selected || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api.assignBatchRecipe(batch.batch_id, { recipe_id: selected.recipe_id, notes: notes || null });
              onAssigned({
                active_recipe_id: selected.recipe_id,
                active_recipe_name: selected.name,
                active_recipe_version: selected.version,
                active_recipe_ec_low: selected.ec_target_low,
                active_recipe_ec_high: selected.ec_target_high,
                active_recipe_ph_low: selected.ph_target_low,
                active_recipe_ph_high: selected.ph_target_high,
              });
            } catch (e) { setErr(e.message); }
            setSaving(false);
          }}
          className="w-full py-4 bg-green-800 text-white rounded-xl font-semibold text-sm hover:bg-green-900 disabled:opacity-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Assigning…' : 'Assign Recipe'}
        </button>
      </div>
    </div>
  );
}
