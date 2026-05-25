import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';

const STATUS_LABELS = {
  'germ':           'Germination',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop Hardening',
  'field-veg':      'Field — Veg',
  'field-flower':   'Field — Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
  'closed':         'Closed',
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
};

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return ts; }
}

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    const s = String(ts);
    const isDateOnly = s.length <= 10;
    const d = isDateOnly ? new Date(s + 'T12:00:00') : new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ts; }
}

// ── Section component — collapsible with count badge ─────────────────────────
function Section({ title, icon, count, accentClass, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen || count > 0);
  if (count === 0 && !defaultOpen) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl mb-3 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
        style={{ minHeight: '52px' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${count > 0 ? accentClass : 'bg-gray-100 text-gray-400'}`}>
            {count}
          </span>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Row renderers ─────────────────────────────────────────────────────────────
function FertigationRow({ app }) {
  const mono = { fontFamily: 'JetBrains Mono, monospace' };
  return (
    <div className="px-5 py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800">
            {app.recipe_name ? `${app.recipe_name} v${app.recipe_version}` : 'Fertigation'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {app.volume_gallons != null && <span style={mono}>{app.volume_gallons} gal</span>}
            {app.ec_measured != null && <span style={mono}>EC {app.ec_measured}</span>}
            {app.ph_measured != null && <span style={mono}>pH {app.ph_measured}</span>}
            {app.applicator_name && <span>{app.applicator_name}</span>}
          </div>
          {app.notes && <div className="text-xs text-gray-400 mt-1 italic">{app.notes}</div>}
        </div>
        <div className="text-xs text-gray-400 flex-shrink-0 text-right">
          {fmtTs(app.applied_at)}
        </div>
      </div>
    </div>
  );
}

function FoliarRow({ app }) {
  const productName = app.product_name_snapshot || app.input_name;
  const recipeName = app.recipe_name;
  return (
    <div className="px-5 py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800">
            {recipeName ?? productName ?? 'Foliar'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {app.purpose && <span>{app.purpose}</span>}
            {app.row_id && <span>{app.row_id}</span>}
            {app.container_id && <span>{app.container_id}</span>}
            {app.applicator_name && <span>{app.applicator_name}</span>}
          </div>
          {app.notes && <div className="text-xs text-gray-400 mt-1 italic">{app.notes}</div>}
        </div>
        <div className="text-xs text-gray-400 flex-shrink-0 text-right">
          {fmtTs(app.applied_at)}
        </div>
      </div>
    </div>
  );
}

function PesticideRow({ app }) {
  const productName = app.product_name_snapshot || app.input_name;
  return (
    <div className="px-5 py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800">{productName ?? 'Pesticide'}</div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {app.target_pest && <span>Target: {app.target_pest}</span>}
            {app.row_id && <span>{app.row_id}</span>}
            {app.container_id && <span>{app.container_id}</span>}
            {app.applicator_name && <span>{app.applicator_name}</span>}
          </div>
          {app.rei_expires_at && (
            <div className="text-xs text-amber-600 mt-0.5">REI until {fmtTs(app.rei_expires_at)}</div>
          )}
          {app.notes && <div className="text-xs text-gray-400 mt-1 italic">{app.notes}</div>}
        </div>
        <div className="text-xs text-gray-400 flex-shrink-0 text-right">
          {fmtTs(app.applied_at)}
        </div>
      </div>
    </div>
  );
}

function ObservationRow({ obs }) {
  const severityColor = { low: 'text-green-700', medium: 'text-amber-700', high: 'text-red-700' };
  return (
    <div className="px-5 py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 capitalize">{obs.category?.replace(/_/g, ' ')}</span>
            {obs.severity && (
              <span className={`text-xs font-semibold capitalize ${severityColor[obs.severity] ?? 'text-gray-500'}`}>
                {obs.severity}
              </span>
            )}
            {obs.row_id && <span className="text-xs text-gray-400">{obs.row_id}</span>}
            {obs.container_id && <span className="text-xs text-gray-400">{obs.container_id}</span>}
          </div>
          {obs.note && <div className="text-xs text-gray-600 mt-0.5">{obs.note}</div>}
          {obs.observer_name && <div className="text-xs text-gray-400 mt-0.5">{obs.observer_name}</div>}
        </div>
        <div className="text-xs text-gray-400 flex-shrink-0 text-right">
          {fmtTs(obs.observed_at)}
        </div>
      </div>
    </div>
  );
}

function AmendmentRow({ amendment }) {
  const productName = amendment.product_name_snapshot || amendment.input_name;
  return (
    <div className="px-5 py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800">
            {productName ?? amendment.amendment_type?.replace(/_/g, ' ') ?? 'Amendment'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {amendment.quantity != null && <span>{amendment.quantity} {amendment.quantity_unit ?? ''}</span>}
            {amendment.container_id && <span>{amendment.container_id}</span>}
            {amendment.purpose && <span>{amendment.purpose}</span>}
            {amendment.applicator_name && <span>{amendment.applicator_name}</span>}
          </div>
          {amendment.notes && <div className="text-xs text-gray-400 mt-1 italic">{amendment.notes}</div>}
        </div>
        <div className="text-xs text-gray-400 flex-shrink-0 text-right">
          {fmtTs(amendment.applied_at)}
        </div>
      </div>
    </div>
  );
}

function LossRow({ loss }) {
  return (
    <div className="px-5 py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-red-800">
              {loss.plant_count ?? 1} plant{(loss.plant_count ?? 1) !== 1 ? 's' : ''} lost
            </span>
            <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded capitalize">
              {loss.loss_type?.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {loss.container_id && <span>{loss.container_id}</span>}
            {loss.metrc_plant_tag && <span>Tag …{loss.metrc_plant_tag.slice(-4)}</span>}
            {loss.reporter_name && <span>{loss.reporter_name}</span>}
          </div>
          {loss.loss_cause && <div className="text-xs text-gray-400 mt-0.5">{loss.loss_cause}</div>}
        </div>
        <div className="text-xs text-gray-400 flex-shrink-0 text-right">
          {fmtTs(loss.occurred_at)}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BatchPhaseDetail() {
  const { id, status } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    api.getBatchPhase(id, status)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [id, status]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="h-6 bg-gray-100 rounded w-40 animate-pulse mb-4" />
        <div className="h-24 bg-gray-100 rounded-2xl animate-pulse mb-3" />
        <div className="h-16 bg-gray-100 rounded-2xl animate-pulse mb-3" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => navigate(`/batches/${id}`)} className="text-sm text-green-700 font-semibold mb-4 flex items-center gap-1">
          ← Back to batch
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-4 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-600 text-xs ml-3">Retry</button>
        </div>
      </div>
    );
  }

  const { batch, phase, fertigation, foliar, pesticide, observations, amendments, losses } = data;
  const phaseLabel = STATUS_LABELS[phase.status] ?? phase.status;
  const chipClass = STATUS_CHIP[phase.status] ?? 'bg-gray-100 text-gray-700';
  const mono = { fontFamily: 'JetBrains Mono, monospace' };
  const totalEvents = fertigation.length + foliar.length + pesticide.length +
    observations.length + amendments.length + losses.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">

      {/* Back nav */}
      <button
        onClick={() => navigate(`/batches/${id}`)}
        className="text-sm text-green-700 font-semibold mb-4 flex items-center gap-1 hover:text-green-900"
        style={{ minHeight: '44px' }}
      >
        ← {batch.name || batch.strain_name}
      </button>

      {/* Phase header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            {phaseLabel}
          </h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${chipClass}`}>
            {phase.is_current ? 'Current' : 'Completed'}
          </span>
        </div>

        {/* Date range + duration */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Started</div>
            <div className="text-sm font-semibold text-gray-800" style={mono}>{fmtDate(phase.started_at)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
              {phase.is_current ? 'Ongoing' : 'Ended'}
            </div>
            <div className="text-sm font-semibold text-gray-800" style={mono}>
              {phase.is_current ? '—' : fmtDate(phase.ended_at)}
            </div>
          </div>
          {phase.days != null && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Duration</div>
              <div className="text-sm font-semibold text-gray-800" style={mono}>{phase.days}d</div>
            </div>
          )}
        </div>

        {/* Plant count summary */}
        {phase.plant_count_entering != null && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
              <span className="text-xs text-green-700 font-medium">Entered</span>
              <span className="text-sm font-bold text-green-900" style={mono}>{phase.plant_count_entering}</span>
            </div>
            {phase.plant_count_lost != null && phase.plant_count_lost > 0 && (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                <span className="text-xs text-red-700 font-medium">Lost</span>
                <span className="text-sm font-bold text-red-900" style={mono}>{phase.plant_count_lost}</span>
              </div>
            )}
            {phase.plant_count_exiting != null && (
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                <span className="text-xs text-gray-600 font-medium">{phase.is_current ? 'Current' : 'Moved on'}</span>
                <span className="text-sm font-bold text-gray-800" style={mono}>{phase.plant_count_exiting}</span>
              </div>
            )}
          </div>
        )}

        {totalEvents === 0 && (
          <p className="text-sm text-gray-400 mt-4">No events recorded during this phase.</p>
        )}
      </div>

      {/* ── Event sections ── */}
      <Section
        title="Fertigation"
        icon="💧"
        count={fertigation.length}
        accentClass="bg-blue-100 text-blue-700"
        defaultOpen={fertigation.length > 0}
      >
        {fertigation.map(app => <FertigationRow key={app.application_id} app={app} />)}
      </Section>

      <Section
        title="Foliar"
        icon="🌿"
        count={foliar.length}
        accentClass="bg-green-100 text-green-700"
      >
        {foliar.map(app => <FoliarRow key={app.foliar_id} app={app} />)}
      </Section>

      <Section
        title="Pesticide"
        icon="⚗️"
        count={pesticide.length}
        accentClass="bg-red-100 text-red-700"
      >
        {pesticide.map(app => <PesticideRow key={app.pesticide_app_id} app={app} />)}
      </Section>

      <Section
        title="Observations"
        icon="🔍"
        count={observations.length}
        accentClass="bg-amber-100 text-amber-700"
      >
        {observations.map(obs => <ObservationRow key={obs.observation_id} obs={obs} />)}
      </Section>

      <Section
        title="Container Amendments"
        icon="🪱"
        count={amendments.length}
        accentClass="bg-lime-100 text-lime-700"
      >
        {amendments.map(a => <AmendmentRow key={a.amendment_id} amendment={a} />)}
      </Section>

      <Section
        title="Plant Losses"
        icon="⚠"
        count={losses.length}
        accentClass="bg-red-100 text-red-700"
      >
        {losses.map(l => <LossRow key={l.loss_id} loss={l} />)}
      </Section>

    </div>
  );
}
