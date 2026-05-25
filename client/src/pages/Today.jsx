import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../api';
import CurrentConditionsCard from '../components/CurrentConditionsCard';
import { BatchSummaryCard } from '../components/BatchCard';

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return isoStr; }
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return isoStr; }
}

const STATUS_CHIP = {
  'germ':         'bg-gray-100 text-gray-700',
  'seedling':     'bg-lime-100 text-lime-700',
  'cult-hoop':    'bg-green-100 text-green-700',
  'field-veg':    'bg-green-100 text-green-800',
  'field-flower': 'bg-purple-100 text-purple-700',
  'flush':        'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700',
  'harvesting':   'bg-red-100 text-red-700',
};

const STATUS_LABELS = {
  'germ': 'Germ', 'seedling': 'Seedlings', 'cult-hoop': 'Cult-Hoop',
  'field-veg': 'Field — Veg', 'field-flower': 'Field — Flower',
  'flush': 'Flush', 'harvest_window': 'Harvest Window', 'harvesting': 'Harvesting',
};

export default function Today() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = formatDate(new Date());

  const [activeREIs, setActiveREIs] = useState([]);
  const [reiLoading, setReiLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [conditionsExpanded, setConditionsExpanded] = useState(true);
  const [pendingActions, setPendingActions] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [postponedCount, setPostponedCount] = useState(0);
  const [loadError, setLoadError] = useState('');

  function loadData() {
    setLoadError('');
    setReiLoading(true);
    setBatchesLoading(true);

    api.getPesticideApplications({ rei_active: '1', limit: '20' })
      .then(data => { setActiveREIs(data); setReiLoading(false); })
      .catch(e => { setLoadError(e.message || 'Unable to load'); setReiLoading(false); });

    api.getBatches({ status: 'active', limit: '10' })
      .then(data => { setBatches(data.filter(b => b.status !== 'closed')); setBatchesLoading(false); })
      .catch(e => { setLoadError(e.message || 'Unable to load'); setBatchesLoading(false); });

    api.getPendingActions()
      .then(data => setPendingActions(data))
      .catch(() => setPendingActions(null));

    api.getTodayTasks()
      .then(data => {
        // API returns { tasks, postponed_count }
        if (data && Array.isArray(data.tasks)) {
          setTasks(data.tasks);
          setPostponedCount(data.postponed_count ?? 0);
        } else {
          setTasks(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => setTasks([]));
  }

  useEffect(() => { loadData(); }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Today</h1>
        <p className="text-sm text-gray-500 mt-0.5">{today}</p>
      </div>

      {/* ── LOAD ERROR BANNER ────────────────────────────────────────────────── */}
      {loadError && (
        <button
          onClick={loadData}
          className="w-full mb-4 bg-amber-50 border-2 border-amber-400 text-amber-900 rounded-2xl px-4 py-3 flex items-center justify-between"
        >
          <span className="text-sm font-medium">Unable to load — tap to retry</span>
          <span className="text-amber-600 text-xs">{loadError}</span>
        </button>
      )}

      {/* ── ACTIVE REI BANNER (prominent, red) ─────────────────────────────── */}
      {!reiLoading && activeREIs.length > 0 && (
        <button
          onClick={() => navigate('/rei')}
          className="w-full mb-4 bg-red-600 text-white rounded-2xl px-4 py-4 flex items-center justify-between active:bg-red-700 transition-colors"
          style={{ minHeight: '64px' }}
        >
          <div className="text-left">
            <div className="font-bold text-base flex items-center gap-2">
              <span>⚠</span>
              <span>{activeREIs.length} Active REI{activeREIs.length > 1 ? 's' : ''}</span>
            </div>
            <div className="text-red-100 text-xs mt-0.5">
              {activeREIs.map(r => r.container_id ?? r.row_id ?? r.batch_sub_zone_id).filter(Boolean).slice(0, 3).join(', ')}
              {activeREIs.length > 3 ? ` +${activeREIs.length - 3} more` : ''}
            </div>
          </div>
          <div className="text-white text-lg flex-shrink-0">→</div>
        </button>
      )}

      {/* ── TASK QUEUE ───────────────────────────────────────────────────── */}
      <TaskQueueSection tasks={tasks} postponedCount={postponedCount} navigate={navigate} />

      {/* ── ACTIVE BATCHES ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Active Batches</h2>
          <button onClick={() => navigate('/batches')} className="text-xs text-green-700 font-semibold hover:text-green-900 flex items-center" style={{ minHeight: '44px', paddingInline: '8px' }}>
            View all →
          </button>
        </div>

        {batchesLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : batches.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-5 text-center">
            <div className="text-gray-400 text-sm">No active batches.</div>
            <button onClick={() => navigate('/batches/new')} className="text-green-700 text-sm font-semibold mt-2 hover:text-green-900 underline">
              Create your first batch →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {batches.map(batch => (
              <BatchCard key={batch.batch_id} batch={batch} onClick={() => navigate(`/batches/${batch.batch_id}`)} />
            ))}
          </div>
        )}
      </div>

      {/* ── CURRENT CONDITIONS ────────────────────────────────────────────── */}
      {!batchesLoading && batches.length > 0 && (
        <CurrentConditionsSection
          batches={batches}
          expanded={conditionsExpanded}
          onToggle={() => setConditionsExpanded(e => !e)}
          onViewAll={() => navigate('/admin/sensors')}
        />
      )}

      {/* ── RECENT APPLICATIONS (placeholder for Phase 1 #14 full Today screen) ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Recent Applications</h2>
          <button onClick={() => navigate('/applications/fertigation')} className="text-xs text-green-700 font-semibold hover:text-green-900">
            View log →
          </button>
        </div>
        <RecentApplications />
      </div>

      {/* ── PENDING ACTIONS (Feature 26 — lifecycle action items) ─────────── */}
      <PendingActionsSection actions={pendingActions} navigate={navigate} />
    </div>
  );
}

function BatchCard({ batch, onClick }) {
  const recipeLine = [
    batch.days_in_stage != null ? `Day ${batch.days_in_stage + 1} in stage` : null,
    batch.plant_age_days != null ? `Age ${batch.plant_age_days}d` : null,
    batch.active_recipe_name ? `Recipe: ${batch.active_recipe_name}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <BatchSummaryCard
      batch={batch}
      onClick={onClick}
      footer={recipeLine ? <span className="text-xs text-gray-400">{recipeLine}</span> : null}
    />
  );
}

function CurrentConditionsSection({ batches, expanded, onToggle, onViewAll }) {
  // Deduplicate by sub_zone_id — one card per sub-zone
  const subZones = [];
  const seen = new Set();
  for (const b of batches) {
    if (b.sub_zone_id && !seen.has(b.sub_zone_id)) {
      seen.add(b.sub_zone_id);
      subZones.push({ subZoneId: b.sub_zone_id, batchStage: b.status });
    }
  }
  if (subZones.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-bold text-gray-500 uppercase tracking-wide hover:text-gray-700"
          style={{ minHeight: '44px' }}
        >
          <span className={`transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}>▶</span>
          Current Conditions
        </button>
        <button onClick={onViewAll} className="text-xs text-green-700 font-semibold hover:text-green-900">
          View all sensors →
        </button>
      </div>
      <div className={`${expanded ? 'block' : 'hidden'} flex flex-col gap-2`}>
        {subZones.map(({ subZoneId, batchStage }) => (
          <CurrentConditionsCard
            key={subZoneId}
            subZoneId={subZoneId}
            batchStage={batchStage}
          />
        ))}
      </div>
    </div>
  );
}

function RecentApplications() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFertigationApplications({ date: 'today', limit: '5' })
      .then(data => { setApps(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-16 bg-gray-100 rounded-2xl animate-pulse" />;

  if (apps.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 px-4 py-4 text-sm text-gray-400 text-center">
        No fertigation logged today.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {apps.map(app => (
        <div key={app.application_id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800" style={{ fontFamily: 'Fraunces, serif' }}>
              {app.batch_strain_name}
            </div>
            <div className="text-xs text-gray-500">
              {app.recipe_name ? `${app.recipe_name} v${app.recipe_version}` : 'Fertigation'}
              {app.batch_sub_zone_id ? ` · ${app.batch_sub_zone_id}` : ''}
            </div>
          </div>
          <div className="text-xs text-gray-400 flex-shrink-0">{formatTime(app.applied_at)}</div>
        </div>
      ))}
    </div>
  );
}

const TASK_ICONS = {
  fertigation: '💧',
  observation: '🔍',
  foliar:      '🌿',
  amendment:   '🪱',
  record:      '📋',
};

function formatLastDone(lastPerformedAt, hoursSince) {
  if (!lastPerformedAt) return 'Never done in this stage';
  if (hoursSince < 1) return 'Just now';
  if (hoursSince < 24) return `${hoursSince}h ago`;
  const days = Math.floor(hoursSince / 24);
  return `${days}d ago`;
}

function TaskCard({ task, navigate }) {
  const isOverdue = task.urgency === 'overdue';
  const borderColor = isOverdue ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50';
  const badgeColor  = isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  const lastDone = formatLastDone(task.last_performed_at, task.hours_since);

  function handleClick() {
    navigate(
      `/tasks/detail?protocol_id=${task.protocol_id}&batch_id=${task.batch_id}`,
      { state: { task } },
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left border-2 rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors hover:opacity-90 active:scale-[0.99] ${borderColor}`}
      style={{ minHeight: '64px' }}
    >
      <span className="text-xl flex-shrink-0">{TASK_ICONS[task.task_type] ?? '📋'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-bold text-gray-900">{task.batch_name || task.strain_name}</span>
          {task.sub_zone_id && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
              {task.sub_zone_id}
            </span>
          )}
          {isOverdue && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>Overdue</span>
          )}
        </div>
        <div className="text-xs font-semibold text-gray-700">{task.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">{lastDone}</span>
          {task.has_sop && <span className="text-xs text-blue-500 font-medium">SOP</span>}
          {task.has_checklist && <span className="text-xs text-green-600 font-medium">Checklist</span>}
        </div>
      </div>
      <span className="text-gray-400 text-sm flex-shrink-0">→</span>
    </button>
  );
}

function TaskQueueSection({ tasks, postponedCount, navigate }) {
  if (tasks === null) return null; // still loading

  const overdue = tasks.filter(t => t.urgency === 'overdue');
  const total   = tasks.length;

  if (total === 0 && postponedCount === 0) return null; // nothing due — no clutter

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
          Tasks Due
          {total > 0 && (
            <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {total}
            </span>
          )}
          {overdue.length > 0 && (
            <span className="ml-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {overdue.length} overdue
            </span>
          )}
          {postponedCount > 0 && (
            <span className="ml-1 text-xs font-normal text-gray-400 normal-case">
              · {postponedCount} postponed
            </span>
          )}
        </h2>
      </div>
      {total > 0 ? (
        <div className="flex flex-col gap-2">
          {tasks.map(task => (
            <TaskCard key={task.task_key} task={task} navigate={navigate} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4 text-sm text-gray-400 text-center">
          All tasks postponed.
        </div>
      )}
    </div>
  );
}

function PendingActionsSection({ actions, navigate }) {
  if (!actions) return null;

  const items = [
    actions.teardown_pending > 0 && {
      label: `${actions.teardown_pending} teardown container${actions.teardown_pending > 1 ? 's' : ''} awaiting soil sample`,
      icon: '🪣',
      href: '/containers?state=teardown',
    },
    actions.startup_pending > 0 && {
      label: `${actions.startup_pending} container${actions.startup_pending > 1 ? 's' : ''} in startup`,
      icon: '🌱',
      href: '/containers?state=startup',
    },
    actions.lab_samples_awaiting > 0 && {
      label: `${actions.lab_samples_awaiting} soil sample${actions.lab_samples_awaiting > 1 ? 's' : ''} at lab awaiting results`,
      icon: '🧪',
      href: '/containers',
    },
    actions.losses_unsynced > 0 && {
      label: `${actions.losses_unsynced} plant loss${actions.losses_unsynced > 1 ? 'es' : ''} not yet synced to METRC`,
      icon: '⚠',
      href: '/compliance/metrc-reconciliation',
    },
    actions.metrc_todos_pending > 0 && {
      label: `${actions.metrc_todos_pending} METRC action${actions.metrc_todos_pending > 1 ? 's' : ''} pending manual entry`,
      icon: '📋',
      href: '/compliance/metrc-todos',
    },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className="mb-5">
      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Pending Actions</h2>
      <div className="flex flex-col gap-2">
        {items.map(item => (
          <button
            key={item.href + item.label}
            onClick={() => navigate(item.href)}
            className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-amber-400 transition-colors active:bg-amber-100"
            style={{ minHeight: '56px' }}
          >
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            <span className="text-sm font-medium text-amber-900 flex-1">{item.label}</span>
            <span className="text-amber-600 text-sm flex-shrink-0">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
