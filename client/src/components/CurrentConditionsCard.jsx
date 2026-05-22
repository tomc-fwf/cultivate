import { useCurrentConditions } from '../hooks/useCurrentConditions.jsx';

// VPD optimal ranges by batch stage (kPa)
const VPD_RANGES = {
  'germ':           { low: 0.4, high: 0.8 },
  'seedling':       { low: 0.4, high: 0.8 },
  'cult-hoop':      { low: 0.6, high: 1.0 },
  'field-veg':      { low: 0.8, high: 1.2 },
  'field-flower':   { low: 1.0, high: 1.5 },
  'flush':          { low: 1.0, high: 2.0 },
  'harvest_window': { low: 1.0, high: 2.0 },
  'harvesting':     { low: 1.0, high: 2.0 },
};

const STAGE_LABELS = {
  'germ':           'Germination',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Veg',
  'field-flower':   'Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
};

function vpdStatus(vpd, range) {
  if (vpd == null || !range) return 'unknown';
  const margin = (range.high - range.low) * 0.2;
  if (vpd >= range.low && vpd <= range.high) return 'optimal';
  if (vpd >= range.low - margin && vpd <= range.high + margin) return 'marginal';
  return 'outside';
}

const VPD_COLORS = {
  optimal:  { bar: 'bg-green-500', label: 'OPTIMAL',  text: 'text-green-700', bg: 'bg-green-100' },
  marginal: { bar: 'bg-amber-400', label: 'MARGINAL', text: 'text-amber-700', bg: 'bg-amber-100' },
  outside:  { bar: 'bg-red-500',   label: 'OUTSIDE',  text: 'text-red-700',   bg: 'bg-red-100'   },
  unknown:  { bar: 'bg-gray-300',  label: '',          text: 'text-gray-400',  bg: 'bg-gray-100'  },
};

function formatAge(seconds) {
  if (seconds == null) return 'unknown';
  const min = Math.round(seconds / 60);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export default function CurrentConditionsCard({ locationId, subZoneId, batchStage }) {
  const { conditions, loading } = useCurrentConditions(locationId, subZoneId);

  const label = subZoneId ?? locationId ?? 'Sensor';
  const range = VPD_RANGES[batchStage] ?? null;

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
        <div className="h-8 bg-gray-100 rounded" />
      </div>
    );
  }

  // No sensor assigned to this location
  if (!conditions) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs">📡</span>
          <span className="text-xs font-semibold text-gray-500 font-mono">{label}</span>
        </div>
        <div className="text-xs text-gray-400">No sensor assigned</div>
      </div>
    );
  }

  const ageSec = conditions.age_seconds;
  const isOffline = ageSec == null || ageSec > 1800; // > 30 min = offline
  const isStale = ageSec != null && ageSec > 600 && ageSec <= 1800;

  if (isOffline && conditions.temp_f == null) {
    return (
      <div className="bg-white border border-amber-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs">📡</span>
          <span className="text-xs font-semibold text-gray-700 font-mono">{label}</span>
          <span className="ml-auto text-xs text-amber-600 font-semibold">
            {ageSec != null ? `offline · last seen ${formatAge(ageSec)}` : 'never reported'}
          </span>
        </div>
        <div className="text-xs text-amber-600">Sensor not reporting</div>
      </div>
    );
  }

  const vpd = conditions.vpd_kpa;
  const status = vpdStatus(vpd, range);
  const colors = VPD_COLORS[status];
  const vpdBarPct = vpd != null ? Math.min(100, (vpd / 3.0) * 100) : 0;

  return (
    <div className={`bg-white border rounded-2xl px-4 py-3 ${isOffline || isStale ? 'border-amber-200' : 'border-gray-200'}`}>
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs">📡</span>
        <span className="text-xs font-bold text-gray-700 font-mono">{label}</span>
        {batchStage && (
          <span className="text-xs text-gray-400">{STAGE_LABELS[batchStage] ?? batchStage}</span>
        )}
        <span className={`ml-auto text-xs ${isOffline || isStale ? 'text-amber-500' : 'text-gray-400'}`}>
          {isStale ? '⚠ ' : ''}{formatAge(ageSec)}
        </span>
      </div>

      {/* Readings row */}
      <div className="flex items-center gap-4 mb-2 text-sm">
        {conditions.temp_f != null && (
          <div className="flex items-center gap-1">
            <span className="text-base">🌡</span>
            <span className="font-bold text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {conditions.temp_f.toFixed(1)}°F
            </span>
          </div>
        )}
        {conditions.humidity_rh != null && (
          <div className="flex items-center gap-1">
            <span className="text-base">💧</span>
            <span className="font-bold text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {Math.round(conditions.humidity_rh)}%
            </span>
          </div>
        )}
        {conditions.dew_point_f != null && (
          <div className="flex items-center gap-1">
            <span className="text-base">🌫</span>
            <span className="text-gray-600 text-xs font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {conditions.dew_point_f.toFixed(1)}°F DP
            </span>
          </div>
        )}
      </div>

      {/* VPD row */}
      {vpd != null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono w-16 flex-shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            VPD {vpd.toFixed(2)}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${colors.bar}`}
              style={{ width: `${vpdBarPct}%` }}
            />
          </div>
          {status !== 'unknown' && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.text} ${colors.bg}`}>
              {colors.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
