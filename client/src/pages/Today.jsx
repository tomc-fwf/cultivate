import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../api';
import CurrentConditionsCard from '../components/CurrentConditionsCard';

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

      {/* ── QUICK ACTIONS ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            label="Fertigation"
            color="bg-blue-50 border-blue-200 text-blue-800 hover:border-blue-400"
            icon="💧"
            onClick={() => navigate('/applications/fertigation/new')}
          />
          <QuickAction
            label="Foliar"
            color="bg-green-50 border-green-200 text-green-800 hover:border-green-400"
            icon="🌿"
            onClick={() => navigate('/applications/foliar/new')}
          />
          <QuickAction
            label="Amendment"
            color="bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400"
            icon="🪱"
            onClick={() => navigate('/applications/amendments/new')}
          />
          <QuickAction
            label="Pesticide"
            color="bg-red-50 border-red-200 text-red-800 hover:border-red-400"
            icon="⚗️"
            onClick={() => navigate('/applications/pesticide/new')}
          />
        </div>
      </div>

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
  const hasREIWarning = false; // wired up in Phase 2 per-batch REI check
  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white rounded-2xl border border-gray-200 px-4 py-3 hover:border-green-300 transition-colors active:bg-green-50"
      style={{ minHeight: '72px' }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>
          {batch.strain_name}
        </span>
        {batch.sub_zone_id && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {batch.sub_zone_id}
          </span>
        )}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
      </div>
      <div className="text-xs text-gray-400 flex items-center gap-3">
        <span>Day {batch.days_in_stage ?? 0} in stage</span>
        <span>{batch.plant_count_current ?? batch.plant_count_initial} plants</span>
        {batch.active_recipe_name && <span>Recipe: {batch.active_recipe_name}</span>}
      </div>
    </button>
  );
}

function QuickAction({ label, color, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 font-semibold text-sm transition-colors active:scale-[0.97] ${color}`}
      style={{ minHeight: '56px' }}
    >
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </button>
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
