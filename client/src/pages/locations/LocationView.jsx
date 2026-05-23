import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ScanLine, FlaskConical, Users, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../../api';

// ─── Static config ─────────────────────────────────────────────────────────

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

function StateBar({ counts, total }) {
  if (!total) return <div className="h-1.5 bg-gray-100 rounded-full" />;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
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

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

function ObsBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute top-2 right-2 bg-amber-400 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function IndoorCard({ location, navigate }) {
  const { name, batches, open_observation_count } = location;
  return (
    <div
      className="relative bg-white rounded-2xl border border-gray-200 px-4 py-4 hover:border-green-300 transition-colors cursor-pointer"
      style={{ minHeight: '100px' }}
      onClick={() => navigate('/batches')}
    >
      <ObsBadge count={open_observation_count} />
      <h3 className="font-semibold text-gray-800 mb-2">{name}</h3>
      {batches.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Empty</p>
      ) : (
        <div className="space-y-1.5">
          {batches.map(b => (
            <div
              key={b.batch_id}
              className="flex items-center gap-2 min-w-0"
              onClick={e => { e.stopPropagation(); navigate(`/batches/${b.batch_id}`); }}
            >
              <span className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">
                {b.strain_name}
              </span>
              <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_CHIP[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[b.status] ?? b.status}
              </span>
              <span className="shrink-0 text-xs text-gray-500">
                {b.plant_count_current ?? b.plant_count_initial}p
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubZoneRow({ sz, navigate }) {
  const { sub_zone_id, pot_size_gal, container_count, container_counts, batch, rei_active, rei_expires_at, open_observation_count } = sz;
  return (
    <div
      className={`relative py-2 px-0 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors -mx-1 px-1`}
      onClick={() => navigate(`/containers/map/${sub_zone_id}`)}
    >
      {/* Sub-zone header */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold text-gray-800 text-sm">{sub_zone_id}</span>
        <span className="text-xs text-gray-400">{pot_size_gal}-gal</span>
        {rei_active && (
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px leading-tight">
            ⚠ REI{rei_expires_at ? ` until ${formatTime(rei_expires_at)}` : ''}
          </span>
        )}
        {open_observation_count > 0 && (
          <span className="ml-auto text-xs font-semibold text-amber-600">
            {open_observation_count} obs
          </span>
        )}
      </div>

      {/* State bar */}
      <StateBar counts={container_counts} total={container_count} />

      {/* Batch info */}
      {batch ? (
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
          <span className="text-xs text-gray-700 font-medium truncate flex-1 min-w-0">{batch.strain_name}</span>
          <span className={`shrink-0 text-xs font-medium px-1.5 py-px rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[batch.status] ?? batch.status}
          </span>
          {batch.days_in_stage != null && (
            <span className="shrink-0 text-xs text-gray-400">Day {batch.days_in_stage}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic mt-1">—</p>
      )}
    </div>
  );
}

function ZoneCard({ zone, navigate }) {
  const { zone: zoneNum, sub_zones } = zone;
  const hasAnyRei = sub_zones.some(sz => sz.rei_active);
  return (
    <div
      className={`bg-white rounded-2xl border px-4 py-4 transition-colors ${
        hasAnyRei ? 'border-amber-300' : 'border-gray-200 hover:border-green-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-gray-800">Zone {zoneNum}</h3>
        {hasAnyRei && (
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1">
            <AlertTriangle size={11} />
            REI
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {sub_zones.map(sz => (
          <SubZoneRow key={sz.sub_zone_id} sz={sz} navigate={navigate} />
        ))}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 animate-pulse" style={{ minHeight: '100px' }}>
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-full mb-1.5" />
      <div className="h-3 bg-gray-100 rounded w-4/5" />
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function LocationView() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    api.getLocationsSummary()
      .then(d => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const alerts = data?.global_alerts ?? {};
  const alertParts = [];
  if (alerts.losses_unsynced > 0) alertParts.push(`${alerts.losses_unsynced} unsynced ${alerts.losses_unsynced === 1 ? 'loss' : 'losses'}`);
  if (alerts.teardown_pending > 0) alertParts.push(`${alerts.teardown_pending} teardown pending`);
  if (alerts.startup_pending > 0) alertParts.push(`${alerts.startup_pending} startup pending`);
  if (alerts.lab_samples_awaiting > 0) alertParts.push(`${alerts.lab_samples_awaiting} awaiting lab`);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-36">

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-green-700" />
          <h1 className="text-xl font-bold text-gray-900">Locations</h1>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Global alerts bar */}
      {!loading && alertParts.length > 0 && (
        <button
          className="w-full mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-left text-sm text-amber-800 font-medium hover:bg-amber-100 transition-colors"
          onClick={() => navigate('/tasks')}
        >
          <AlertTriangle size={14} className="inline mr-1.5 align-middle" />
          {alertParts.join(' · ')}
        </button>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadData} className="ml-3 text-red-700 font-semibold underline">Retry</button>
        </div>
      )}

      {/* ── Pre-field ─────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Pre-Field</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {loading
            ? [0, 1, 2].map(i => <SkeletonCard key={i} />)
            : (data?.indoor ?? []).map(loc => (
                <IndoorCard key={loc.name} location={loc} navigate={navigate} />
              ))
          }
        </div>
      </section>

      {/* ── Field ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Field — Zones 1–4</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {loading
            ? [0, 1, 2, 3].map(i => <SkeletonCard key={i} />)
            : (data?.zones ?? []).map(zone => (
                <ZoneCard key={zone.zone} zone={zone} navigate={navigate} />
              ))
          }
        </div>
      </section>

      {/* ── Quick Actions bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-20 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 py-3">
        <div className="max-w-4xl mx-auto px-4 flex gap-3">
          <button
            onClick={() => navigate('/scan')}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-green-50 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-700 transition-colors"
            style={{ minHeight: '48px' }}
          >
            <ScanLine size={16} />
            Scan
          </button>
          <button
            onClick={() => navigate('/recipes/mix-calculator')}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-green-50 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-700 transition-colors"
            style={{ minHeight: '48px' }}
          >
            <FlaskConical size={16} />
            Mix Today
          </button>
          <button
            onClick={() => navigate('/batches')}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-green-50 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-700 transition-colors"
            style={{ minHeight: '48px' }}
          >
            <Users size={16} />
            My Groups
          </button>
        </div>
      </div>
    </div>
  );
}
