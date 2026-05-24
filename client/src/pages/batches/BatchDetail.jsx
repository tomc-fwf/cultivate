import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import CurrentConditionsCard from '../../components/CurrentConditionsCard';

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

// ─── Stage Guide ─────────────────────────────────────────────────────────────
// Shown for germ / seedling / cult-hoop. Provides day-level context, METRC
// reminders, and surfaces the transition action when the plant group is ready.

const STAGE_GUIDE_CFG = {
  germ: {
    label: 'Germination',
    stageDays: 7,
    recipe: 'BASE',
    appNote: 'Tray-level',
    transitionAt: 7,
    colors: { bg: 'bg-gray-50', border: 'border-gray-200', bar: 'bg-gray-200', fill: 'bg-gray-500', title: 'text-gray-800', row: 'border-gray-200' },
  },
  seedling: {
    label: 'Seedlings',
    stageDays: 14,
    recipe: 'SEEDLING',
    appNote: 'Sub-location drip',
    transitionAt: 10,
    colors: { bg: 'bg-lime-50', border: 'border-lime-200', bar: 'bg-lime-200', fill: 'bg-lime-600', title: 'text-lime-900', row: 'border-lime-200' },
  },
  'cult-hoop': {
    label: 'Cult-Hoop Hardening',
    stageDays: 8,
    recipe: 'SEEDLING',
    appNote: 'Sub-location drip',
    transitionAt: 8,
    colors: { bg: 'bg-green-50', border: 'border-green-200', bar: 'bg-green-200', fill: 'bg-green-600', title: 'text-green-900', row: 'border-green-200' },
  },
};

function StageGuide({ batch, onOpenFertiPanel, onOpenTransitionModal, isSupervisor }) {
  const cfg = STAGE_GUIDE_CFG[batch.status];
  if (!cfg) return null;

  const day = batch.days_in_stage ?? 0;
  const isTransitionReady = day >= cfg.transitionAt;
  const pct = Math.min(100, Math.round((day / cfg.stageDays) * 100));
  const c = cfg.colors;
  const nextStatus = NEXT_STATUS[batch.status];

  return (
    <div className={`${c.bg} ${c.border} border rounded-2xl p-5 mb-4`}>
      {/* Header + day count */}
      <div className="flex items-center justify-between mb-1">
        <h2 className={`font-semibold ${c.title} text-sm uppercase tracking-wide`}>{cfg.label}</h2>
        {isTransitionReady && (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-800">Move Ready</span>
        )}
      </div>
      <div className="text-xs text-gray-500 mb-3">
        Day {day + 1} of ~{cfg.stageDays}
        {isTransitionReady
          ? ' — plants ready for next location'
          : ` — ${Math.max(0, cfg.stageDays - day)} days until typical transition`
        }
      </div>

      {/* Progress bar */}
      <div className={`w-full ${c.bar} rounded-full h-1.5 mb-4`}>
        <div className={`${c.fill} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>

      {/* Transition block — shown when day threshold reached */}
      {isTransitionReady && isSupervisor && nextStatus && (
        <div className="mb-4">
          <button
            onClick={onOpenTransitionModal}
            className="w-full py-3.5 bg-green-800 text-white font-semibold rounded-xl hover:bg-green-900 transition-colors text-sm"
            style={{ minHeight: '56px' }}
          >
            {TRANSITION_ACTION[nextStatus] ?? `Move to next stage`} →
          </button>
        </div>
      )}

      {/* Today's daily tasks */}
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Today</div>
      <div className="flex flex-col gap-2">
        <button
          onClick={onOpenFertiPanel}
          className={`flex items-center gap-3 text-sm text-left w-full px-4 py-3 bg-white ${c.row} border rounded-xl font-medium text-gray-800 hover:bg-gray-50 transition-colors`}
          style={{ minHeight: '48px' }}
        >
          <span className="text-base flex-shrink-0">💧</span>
          <div>
            <div className="font-semibold">Log {cfg.recipe} recipe</div>
            <div className="text-xs text-gray-500 font-normal">{cfg.appNote} · opens panel below</div>
          </div>
        </button>
        <Link
          to={`/observations/new?batch_id=${batch.batch_id}`}
          className={`flex items-center gap-3 text-sm w-full px-4 py-3 bg-white ${c.row} border rounded-xl font-medium text-gray-800 hover:bg-gray-50 transition-colors`}
          style={{ minHeight: '48px', textDecoration: 'none' }}
        >
          <span className="text-base flex-shrink-0">🔍</span>
          <div>
            <div className="font-semibold">Record observations</div>
            <div className="text-xs text-gray-500 font-normal">Plant condition · germination rate · concerns</div>
          </div>
        </Link>
      </div>
    </div>
  );
}

// Inline stage-date correction — shows "Day X in stage" with a pencil for supervisors.
// Clicking pencil replaces the line with a date picker to set current_stage_since.
function StageDateField({ batch, isSupervisor, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function startEdit() {
    // Pre-fill with the date current_stage_since represents, or today
    const raw = batch.current_stage_since ?? batch.sow_date;
    setDateVal(raw ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setErr('');
    setEditing(true);
  }

  async function save() {
    if (!dateVal) return;
    setSaving(true);
    setErr('');
    try {
      const updated = await api.updateBatch(batch.batch_id, { current_stage_since: dateVal });
      onUpdated(updated);
      setEditing(false);
    } catch (e) {
      setErr(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="flex items-center gap-2 flex-wrap">
        <span>Stage started</span>
        <input
          type="date"
          value={dateVal}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => setDateVal(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-0.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          style={{ minHeight: '28px' }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-xs font-semibold text-green-700 hover:text-green-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span>Day <span className="font-semibold text-gray-700">{(batch.days_in_stage ?? 0) + 1}</span> in stage</span>
      {isSupervisor && batch.status !== 'closed' && (
        <button
          onClick={startEdit}
          title="Correct stage date"
          className="text-gray-300 hover:text-green-600 transition-colors ml-0.5"
          style={{ lineHeight: 1 }}
        >
          ✏
        </button>
      )}
    </span>
  );
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : type === 'warning' ? 'bg-amber-600' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-auto`}>
        {type === 'success' ? '✓ ' : '⚠ '}{message}
      </div>
    </div>
  );
}

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
  const [showBulkTeardownModal, setShowBulkTeardownModal] = useState(false);
  const [bulkTeardownLoading, setBulkTeardownLoading] = useState(false);
  const [readinessSummary, setReadinessSummary] = useState(null);
  const [batchPlan, setBatchPlan] = useState(null);
  const [toast, setToast] = useState(null);

  // Inline fertigation quick-log panel
  const fertiRef = useRef(null);
  const [fertiPanelOpen, setFertiPanelOpen] = useState(false);
  const [fertiVolume, setFertiVolume] = useState(() => localStorage.getItem('cv_last_fertigation_volume') || '');
  const [fertiEC, setFertiEC] = useState('');
  const [fertiPH, setFertiPH] = useState('');
  const [fertiSaving, setFertiSaving] = useState(false);
  const [fertiError, setFertiError] = useState('');

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  function load() {
    setLoading(true);
    api.getBatch(id)
      .then(data => { setBatch(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [id]);

  // Load readiness summary when batch is in harvest_window status
  useEffect(() => {
    if (batch?.status !== 'harvest_window') return;
    api.getReadinessSummary(batch.batch_id)
      .then(data => setReadinessSummary(data))
      .catch(() => setReadinessSummary(null));
  }, [batch?.status, batch?.batch_id]);

  // Load planting plan for eligible batch statuses
  useEffect(() => {
    const eligible = ['germ', 'seedling', 'cult-hoop', 'field-veg'];
    if (!batch || !eligible.includes(batch.status)) { setBatchPlan(null); return; }
    api.getPlantingPlans({ batch_id: batch.batch_id })
      .then(plans => setBatchPlan(plans[0] ?? null))
      .catch(() => setBatchPlan(null));
  }, [batch?.batch_id, batch?.status]);

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

  async function handleTransition(toStatus, notes, subZoneId, plantsMoved, lossReason, lossNotes, moveDate) {
    try {
      // Set sub_zone before field transition if provided
      if (subZoneId) {
        await api.updateBatch(batch.batch_id, { sub_zone_id: subZoneId });
      }
      const body = { to_status: toStatus, notes };
      if (plantsMoved != null) body.plants_moved      = plantsMoved;
      if (lossReason)          body.loss_reason        = lossReason;
      if (lossNotes)           body.loss_notes         = lossNotes;
      if (moveDate)            body.transitioned_at    = moveDate;
      const updated = await api.transitionBatch(id, body);
      setBatch(b => ({ ...b, ...updated, sub_zone_id: subZoneId || b.sub_zone_id }));
      setToast({ message: `Moved to ${STATUS_LABELS[toStatus] ?? toStatus} ✓`, type: 'success' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleBulkTeardown() {
    setBulkTeardownLoading(true);
    try {
      const result = await api.bulkTeardown(batch.batch_id);
      setShowBulkTeardownModal(false);
      setToast({ message: `Teardown started for ${result.transitioned_count} container${result.transitioned_count !== 1 ? 's' : ''} ✓`, type: 'success' });
      load();
    } catch (e) {
      setShowBulkTeardownModal(false);
      setToast({ message: e.message, type: 'error' });
    } finally {
      setBulkTeardownLoading(false);
    }
  }

  async function handleFertigationQuickLog() {
    setFertiSaving(true);
    setFertiError('');
    try {
      await api.createFertigationApplication({
        batch_ids: [batch.batch_id],
        recipe_id: batch.active_recipe_id,
        applied_at: new Date().toISOString(),
        volume_gallons: parseFloat(fertiVolume),
        ec_measured: parseFloat(fertiEC),
        ph_measured: parseFloat(fertiPH),
      });
      if (fertiVolume) localStorage.setItem('cv_last_fertigation_volume', fertiVolume);
      setFertiPanelOpen(false);
      setFertiEC('');
      setFertiPH('');
      setToast({ message: 'Fertigation logged', type: 'success' });
      load();
    } catch (e) {
      setFertiError(e.message);
    } finally {
      setFertiSaving(false);
    }
  }

  // Inline fertigation panel — range indicators for EC and pH
  const fertiEcStatus = (() => {
    const n = parseFloat(fertiEC);
    if (isNaN(n) || batch.active_recipe_ec_low == null) return null;
    return n >= batch.active_recipe_ec_low && n <= batch.active_recipe_ec_high ? 'in' : 'out';
  })();
  const fertiPhStatus = (() => {
    const n = parseFloat(fertiPH);
    if (isNaN(n) || batch.active_recipe_ph_low == null) return null;
    return n >= batch.active_recipe_ph_low && n <= batch.active_recipe_ph_high ? 'in' : 'out';
  })();

  const growthPhase = batch.metrc_phase ?? 'Immature';
  const GROWTH_PHASE_CHIP = {
    'Immature':   'bg-lime-100 text-lime-800',
    'Vegetative': 'bg-green-100 text-green-800',
    'Flowering':  'bg-purple-100 text-purple-800',
    'Closed':     'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Back */}
      <button onClick={() => navigate('/batches')} className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
        ← Plant Batches
      </button>

      {/* ── Identity Card ────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">

        {/* Batch name (primary) + status badges */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <BatchNameInline batch={batch} onSaved={updated => setBatch(b => ({ ...b, ...updated }))} />
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[batch.status] ?? batch.status}
              </span>
              {batch.strain_type && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  batch.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {batch.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
                </span>
              )}
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

        {/* Phase · Count · Location row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <span className={`text-xs font-bold px-2 py-1 rounded-full block mb-1 ${GROWTH_PHASE_CHIP[growthPhase] ?? 'bg-gray-100 text-gray-600'}`}>
              {growthPhase}
            </span>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Growth Phase</div>
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

        {/* Day in stage + plant age + sow date */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 border-t border-gray-100 pt-3 flex-wrap">
          <StageDateField batch={batch} isSupervisor={isSupervisor} onUpdated={updated => setBatch(b => ({ ...b, ...updated }))} />
          {batch.plant_age_days != null && (
            <span>Plant age <span className="font-semibold text-gray-700">{batch.plant_age_days}d</span></span>
          )}
          <span>Sow <span className="font-semibold text-gray-700 font-mono">{batch.sow_date}</span></span>
          {batch.plants_per_container > 1 && (
            <span><span className="font-semibold text-gray-700">{batch.plants_per_container}</span> per container</span>
          )}
        </div>
      </div>

      {/* Stage Guide — germ / seedling / cult-hoop day context */}
      <StageGuide
        batch={batch}
        onOpenFertiPanel={() => {
          setFertiPanelOpen(true);
          setTimeout(() => fertiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }}
        onOpenTransitionModal={() => setShowTransitionModal(true)}
        isSupervisor={isSupervisor}
      />

      {/* Current Environmental Conditions — shown when batch is in the field */}
      {batch.sub_zone_id && (
        <div className="mb-4">
          <CurrentConditionsCard subZoneId={batch.sub_zone_id} batchStage={batch.status} />
        </div>
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

      {/* ── Planting Plan — shown for pre-field and field-veg batches ── */}
      {['germ', 'seedling', 'cult-hoop', 'field-veg'].includes(batch.status) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Planting Plan</h2>
            {isSupervisor && !batchPlan && (
              <Link
                to={`/planting-plans/new?batch_id=${batch.batch_id}`}
                className="text-xs text-green-700 font-medium hover:text-green-900"
                style={{ textDecoration: 'none' }}
              >
                + Create
              </Link>
            )}
          </div>
          {batchPlan ? (
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  batchPlan.status === 'active' ? 'bg-green-100 text-green-800'
                  : batchPlan.status === 'draft' ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-500'
                }`}>{batchPlan.status}</span>
                <span className="text-xs text-gray-500">v{batchPlan.version} · {batchPlan.sub_zone_id}</span>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {batchPlan.committed_count ?? 0} committed · {batchPlan.draft_count ?? 0} draft · {batchPlan.plants_to_place} to place
              </div>
              {isSupervisor && (
                <Link
                  to={`/planting-plans/${batchPlan.plan_id}`}
                  className="text-sm font-semibold text-green-800 hover:text-green-900"
                  style={{ textDecoration: 'none' }}
                >
                  Open Plan Builder →
                </Link>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No planting plan yet.
              {isSupervisor && batch.status === 'cult-hoop' && (
                <span className="text-amber-600 font-medium ml-1">Create one to commit plants to field.</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Harvest Readiness Summary — shown during harvest_window ── */}
      {batch.status === 'harvest_window' && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-orange-900 text-sm uppercase tracking-wide mb-3">Harvest Window — Readiness</h2>
          {readinessSummary ? (
            <div>
              <div className="text-sm text-orange-800 font-semibold mb-2">
                {readinessSummary.containers_assessed ?? 0} / {readinessSummary.total_containers ?? '?'} containers assessed
              </div>
              {readinessSummary.rows && readinessSummary.rows.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {readinessSummary.rows.map(r => (
                    <div key={r.row_id} className="flex items-center gap-3 text-xs">
                      <span className="font-mono font-semibold text-gray-700 w-16 flex-shrink-0">{r.row_id}</span>
                      <div className="flex-1 bg-orange-200 rounded-full h-2">
                        <div
                          className="bg-orange-600 h-2 rounded-full"
                          style={{ width: `${r.pct_ready ?? 0}%` }}
                        />
                      </div>
                      <span className="text-orange-700 font-semibold w-12 text-right">{r.ready_count ?? 0}/{r.total_count ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-orange-600">No readiness observations recorded yet.</div>
          )}
          <Link
            to={`/observations/new?batch_id=${batch.batch_id}&category=harvest_readiness`}
            className="mt-3 flex items-center gap-2 text-sm font-semibold text-orange-800 hover:text-orange-900"
            style={{ textDecoration: 'none' }}
          >
            + Log Readiness Observation →
          </Link>
        </div>
      )}

      {/* ── Inspect Rows — for field-stage batches ─────────────────────── */}
      {batch.sub_zone_id && ['field-veg', 'field-flower', 'flush', 'harvest_window', 'harvesting'].includes(batch.status) && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-teal-900 text-sm mb-3">Inspect Rows</h2>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map(rn => {
              const zone = batch.sub_zone_id.charAt(1);
              const desig = batch.sub_zone_id.charAt(2);
              const rowId = `Z${zone}-${desig}-R${rn}`;
              return (
                <Link
                  key={rn}
                  to={`/inspect/${rowId}`}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-teal-300 text-teal-800 font-semibold text-sm rounded-xl hover:bg-teal-100 transition-colors shadow-sm"
                  style={{ minHeight: '44px', textDecoration: 'none' }}
                >
                  <span>Row {rn}</span>
                  <span className="text-teal-400 text-xs">→</span>
                </Link>
              );
            })}
          </div>
          <p className="text-xs text-teal-600 mt-3">Swipe through containers one at a time · log observations, foliar, pesticide, or plant loss from each card</p>
        </div>
      )}

      {/* ── Quick actions for this batch ──────────────────────────────── */}
      {batch.status !== 'closed' && (
        <div className="mb-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Log for this batch</h2>
          <div className="flex flex-col gap-2">
            {/* Bulk METRC tag scan mode — shown when batch has untagged placements */}
            {(batch.untagged_count ?? 0) > 0 && (
              <Link
                to={`/tag-assignments?batch_id=${batch.batch_id}`}
                className="flex items-center justify-between w-full bg-blue-700 text-white font-semibold rounded-2xl px-5 hover:bg-blue-800 transition-colors shadow-sm"
                style={{ minHeight: '56px', textDecoration: 'none' }}
              >
                <span className="flex items-center gap-2">
                  <span>🏷️</span>
                  <span>Bulk Scan Mode</span>
                  <span className="text-blue-200 text-xs font-normal">
                    {batch.untagged_count} untagged
                  </span>
                </span>
                <span className="text-blue-300 text-lg">→</span>
              </Link>
            )}
            {/* Harvest Dashboard — shown when harvesting */}
            {batch.status === 'harvesting' && (
              <Link
                to={`/harvest/${batch.batch_id}`}
                className="flex items-center justify-between w-full bg-green-800 text-white font-semibold rounded-2xl px-5 hover:bg-green-900 transition-colors shadow-sm"
                style={{ minHeight: '64px', textDecoration: 'none' }}
              >
                <span className="flex items-center gap-2 text-base"><span>🌾</span>Harvest Dashboard</span>
                <span className="text-green-300 text-lg">→</span>
              </Link>
            )}
            {/* Fertigation — inline quick-log panel, hidden during harvesting */}
            {batch.status !== 'harvesting' && (
              <div ref={fertiRef} className="rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setFertiPanelOpen(p => !p)}
                  className="flex items-center justify-between w-full bg-green-800 text-white font-semibold px-5 hover:bg-green-900 transition-colors"
                  style={{ minHeight: '56px' }}
                >
                  <span className="flex items-center gap-2"><span className="text-lg">💧</span>Log Fertigation</span>
                  <span className="text-green-300 text-sm">{fertiPanelOpen ? '▲' : '▼'}</span>
                </button>
                {fertiPanelOpen && (
                  <div className="bg-green-50 border border-green-200 border-t-0 rounded-b-2xl px-4 pt-3 pb-4">
                    {batch.active_recipe_id ? (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipe</span>
                        <span className="bg-green-100 text-green-800 text-sm font-bold px-3 py-1 rounded-full" style={{ fontFamily: 'Fraunces, serif' }}>
                          {batch.active_recipe_name}
                          {batch.active_recipe_version && (
                            <span className="ml-1 text-xs font-normal text-green-600">v{batch.active_recipe_version}</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-amber-700 font-medium mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        ⚠ No recipe assigned — assign one first.
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Volume (gal)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                          placeholder="50"
                          value={fertiVolume}
                          onChange={e => setFertiVolume(e.target.value)}
                          style={{ minHeight: '44px' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">EC (mS/cm)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white ${
                            fertiEcStatus === 'in' ? 'border-green-400' : fertiEcStatus === 'out' ? 'border-amber-400' : 'border-gray-300'
                          }`}
                          placeholder={batch.active_recipe_ec_low != null ? `${batch.active_recipe_ec_low}–${batch.active_recipe_ec_high}` : 'e.g. 0.8'}
                          value={fertiEC}
                          onChange={e => setFertiEC(e.target.value)}
                          style={{ minHeight: '44px' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">pH</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white ${
                            fertiPhStatus === 'in' ? 'border-green-400' : fertiPhStatus === 'out' ? 'border-amber-400' : 'border-gray-300'
                          }`}
                          placeholder={batch.active_recipe_ph_low != null ? `${batch.active_recipe_ph_low}–${batch.active_recipe_ph_high}` : 'e.g. 6.2'}
                          value={fertiPH}
                          onChange={e => setFertiPH(e.target.value)}
                          style={{ minHeight: '44px' }}
                        />
                      </div>
                    </div>
                    {fertiError && <p className="text-red-600 text-xs mb-2">{fertiError}</p>}
                    <button
                      onClick={handleFertigationQuickLog}
                      disabled={fertiSaving || !fertiVolume || !fertiEC || !fertiPH || !batch.active_recipe_id}
                      className="w-full py-3.5 bg-green-800 text-white font-semibold rounded-xl hover:bg-green-900 disabled:opacity-50 transition-colors"
                      style={{ minHeight: '56px' }}
                    >
                      {fertiSaving ? 'Saving…' : 'Save Fertigation'}
                    </button>
                  </div>
                )}
              </div>
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
                to={`/applications/amendments/new?batch_id=${batch.batch_id}`}
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
              <Link
                to={`/harvest/waste-trim/new?batch_id=${batch.batch_id}`}
                className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-2 border-amber-300 text-amber-900 font-semibold text-sm rounded-2xl hover:border-amber-500 transition-colors col-span-2"
                style={{ minHeight: '56px', textDecoration: 'none' }}
              >
                <span>✂️</span>Waste Trim
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── EC/pH Trends — shown for field-stage batches with fertigation data ── */}
      {batch.sub_zone_id && ['field-veg', 'field-flower', 'flush', 'harvest_window', 'harvesting'].includes(batch.status) && (
        <div className="mb-4">
          <Link
            to={`/analytics/batch/${batch.batch_id}/trends`}
            className="flex items-center justify-between w-full bg-blue-50 border border-blue-200 text-blue-900 font-semibold rounded-2xl px-5 hover:bg-blue-100 transition-colors"
            style={{ minHeight: '56px', textDecoration: 'none' }}
          >
            <span className="flex items-center gap-2 text-sm"><span>📈</span>EC / pH Trends</span>
            <span className="text-blue-400">→</span>
          </Link>
        </div>
      )}

      {/* ── Stage Timeline ───────────────────────────────────────────────── */}
      <StageTimeline batch={batch} />

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

      {/* Bulk teardown — shown for closed batches with eligible containers */}
      {batch.status === 'closed' && isSupervisor && (batch.teardown_eligible_count ?? 0) > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowBulkTeardownModal(true)}
            className="w-full py-4 bg-amber-700 text-white font-semibold rounded-2xl hover:bg-amber-800 transition-colors text-sm shadow-sm"
            style={{ minHeight: '56px' }}
          >
            Start Teardown for All Containers ({batch.teardown_eligible_count})
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
          currentStatus={batch.status}
          nextStatus={nextStatus}
          nextLabel={STATUS_LABELS[nextStatus]}
          actionLabel={TRANSITION_ACTION[nextStatus]}
          plantCount={batch.plant_count_current ?? batch.plant_count_initial}
          requiresSubZone={nextStatus === 'field-veg' && !batch.sub_zone_id}
          requiresNotes={nextStatus === 'harvesting'}
          onClose={() => setShowTransitionModal(false)}
          onConfirm={(notes, subZoneId, plantsMoved, lossReason, lossNotes, moveDate) => {
            setShowTransitionModal(false);
            handleTransition(nextStatus, notes, subZoneId, plantsMoved, lossReason, lossNotes, moveDate);
          }}
        />
      )}

      {showBulkTeardownModal && (
        <BulkTeardownModal
          containerCount={batch.teardown_eligible_count ?? 0}
          loading={bulkTeardownLoading}
          onClose={() => setShowBulkTeardownModal(false)}
          onConfirm={handleBulkTeardown}
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
    days_in_stage: p.days_in_stage,
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
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{fmtTs(evt.ts)}</span>
                    {evt.by && <span>by {evt.by}</span>}
                    {evt.days_in_stage != null && (
                      <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                        {evt.days_in_stage}d in prev stage
                      </span>
                    )}
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

function StageTimeline({ batch }) {
  const history = batch.phase_history ?? [];
  if (history.length === 0 && !batch.current_stage_days) return null;

  const stages = history.map(ph => ({
    status: ph.from_status,
    days: ph.days_in_stage,
  })).filter(s => s.status && s.days != null);

  const isActive = batch.status !== 'closed';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Stage Timeline</h2>
        {batch.plant_age_days != null && (
          <span className="text-xs text-gray-500">
            Total age: <span className="font-semibold text-gray-700">{batch.plant_age_days}d</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {stages.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="text-center">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide leading-none mb-0.5">
                {STATUS_LABELS[s.status] ?? s.status}
              </div>
              <div className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-lg font-mono">
                {s.days}d
              </div>
            </div>
            <span className="text-gray-300 text-sm">→</span>
          </div>
        ))}
        {isActive && (
          <div className="text-center">
            <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide leading-none mb-0.5">
              {STATUS_LABELS[batch.status] ?? batch.status}
            </div>
            <div className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-lg font-mono flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {batch.current_stage_days ?? 0}d
            </div>
          </div>
        )}
        {!isActive && (
          <div className="text-center">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">
              {STATUS_LABELS[batch.status] ?? batch.status}
            </div>
            <div className="bg-gray-50 text-gray-400 text-xs font-bold px-2.5 py-1 rounded-lg">—</div>
          </div>
        )}
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

function BatchNameInline({ batch, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(batch.name ?? '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <button
        onClick={() => { setValue(batch.name ?? ''); setEditing(true); setErr(''); }}
        className="group flex items-baseline gap-2 text-left w-full"
      >
        <h1 className="text-2xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'Fraunces, serif' }}>
          {batch.name || <span className="text-gray-400 italic">Unnamed batch</span>}
        </h1>
        <span className="text-xs text-green-700 font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Edit</span>
      </button>
    );
  }

  async function save() {
    if (!value.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    try {
      const updated = await api.updateBatch(batch.batch_id, { name: value.trim() });
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-1">
      <input
        ref={inputRef}
        value={value}
        onChange={e => { setValue(e.target.value); setErr(''); }}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="w-full text-2xl font-bold text-gray-900 border-b-2 border-green-600 bg-transparent outline-none pb-0.5 leading-tight"
        style={{ fontFamily: 'Fraunces, serif' }}
        placeholder="Batch name…"
        maxLength={120}
      />
      {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={save}
          disabled={saving}
          className="text-sm font-semibold text-white bg-green-700 hover:bg-green-800 px-4 py-1.5 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}

const PRE_FIELD_FROM = new Set(['germ', 'seedling', 'cult-hoop']);
const LOSS_REASONS = [
  { value: 'never_sprouted', label: 'Never sprouted' },
  { value: 'died',           label: 'Died' },
  { value: 'damaged',        label: 'Damaged' },
  { value: 'missing',        label: 'Missing / unknown' },
  { value: 'other',          label: 'Other' },
];

function localDatetimeValue() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

function TransitionModal({ currentStatus, nextStatus, nextLabel, actionLabel, plantCount, requiresSubZone, requiresNotes, onClose, onConfirm }) {
  const [notes, setNotes] = useState('');
  const [subZoneId, setSubZoneId] = useState('');
  const [plantsMovedStr, setPlantsMovedStr] = useState(String(plantCount ?? ''));
  const [lossReason, setLossReason] = useState('');
  const [lossNotes, setLossNotes] = useState('');
  const [moveDate, setMoveDate] = useState(localDatetimeValue);
  const [saving, setSaving] = useState(false);

  const showPlantsMoved = PRE_FIELD_FROM.has(currentStatus);
  const plantsMovedNum = parseInt(plantsMovedStr, 10);
  const lostCount = showPlantsMoved && !isNaN(plantsMovedNum) ? (plantCount ?? 0) - plantsMovedNum : 0;
  const hasLoss = lostCount > 0;

  const canConfirm =
    (!requiresSubZone || subZoneId !== '') &&
    (!requiresNotes || notes.trim() !== '') &&
    (!showPlantsMoved || (!isNaN(plantsMovedNum) && plantsMovedNum > 0 && plantsMovedNum <= (plantCount ?? Infinity))) &&
    (!hasLoss || lossReason !== '');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-20 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>
            {actionLabel}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          This will move the batch to <strong>{nextLabel}</strong> and log the transaction.
        </p>

        {/* Move date — defaults to now, editable for back-dating */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Move date</label>
          <input
            type="datetime-local"
            value={moveDate}
            max={localDatetimeValue()}
            onChange={e => setMoveDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            style={{ minHeight: '56px' }}
          />
        </div>

        {/* Plants moved — shown for all pre-field transitions */}
        {showPlantsMoved && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Plants moving to {nextLabel} <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Started with <strong>{plantCount}</strong>. Enter how many actually transfer — any difference will create a METRC destroy action.
            </p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={plantCount}
              value={plantsMovedStr}
              onChange={e => { setPlantsMovedStr(e.target.value); setLossReason(''); setLossNotes(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-lg font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-green-600 text-center"
              style={{ minHeight: '56px' }}
            />
            {hasLoss && (
              <p className="text-xs text-amber-700 mt-1.5">
                {lostCount} plant{lostCount !== 1 ? 's' : ''} will be logged as lost — METRC destroy action will be created.
              </p>
            )}
          </div>
        )}

        {/* Loss reason — shown when plants_moved < plant_count */}
        {showPlantsMoved && hasLoss && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Reason for loss <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {LOSS_REASONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setLossReason(r.value)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-colors text-left ${
                    lossReason === r.value
                      ? 'bg-amber-700 text-white border-amber-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400'
                  }`}
                  style={{ minHeight: '48px' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={lossNotes}
              onChange={e => setLossNotes(e.target.value)}
              placeholder="Additional notes (optional)…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        )}

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
              await onConfirm(
                notes || null,
                subZoneId || null,
                showPlantsMoved ? plantsMovedNum : null,
                hasLoss ? lossReason : null,
                hasLoss && lossNotes.trim() ? lossNotes.trim() : null,
                moveDate ? new Date(moveDate).toISOString() : null,
              );
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

function BulkTeardownModal({ containerCount, loading, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>
            Start Bulk Teardown
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <p className="text-sm text-gray-600 mb-2">
          This will create a teardown record for{' '}
          <strong>{containerCount} container{containerCount !== 1 ? 's' : ''}</strong> currently
          in <em>active</em> or <em>empty</em> state for this batch.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-5">
          Each container's teardown checklist (plant removal, cleaning, soil sample) will still need to be
          completed individually via the container record. This action starts the teardown workflow for all of them at once.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 bg-amber-700 text-white rounded-xl text-sm font-semibold hover:bg-amber-800 disabled:opacity-50"
            style={{ minHeight: '56px' }}
          >
            {loading ? 'Starting…' : `Start Teardown for ${containerCount} Container${containerCount !== 1 ? 's' : ''}`}
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
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-20 max-h-[80vh] overflow-y-auto">
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
