import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const DATE_FILTERS = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
];

const CATEGORY_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pest', value: 'pest' },
  { label: 'Deficiency', value: 'deficiency' },
  { label: 'Disease', value: 'disease' },
  { label: 'Damage', value: 'damage' },
  { label: 'Readiness', value: 'harvest_readiness' },
  { label: 'Healthy', value: 'healthy' },
];

const CATEGORY_CHIP = {
  healthy:           'bg-green-100 text-green-800',
  pest:              'bg-red-100 text-red-800',
  deficiency:        'bg-amber-100 text-amber-800',
  disease:           'bg-purple-100 text-purple-800',
  damage:            'bg-orange-100 text-orange-800',
  harvest_readiness: 'bg-orange-200 text-orange-900',
  other:             'bg-gray-100 text-gray-700',
};

const CATEGORY_LABELS = {
  healthy: 'Healthy', pest: 'Pest', deficiency: 'Deficiency',
  disease: 'Disease', damage: 'Damage', harvest_readiness: 'Readiness', other: 'Other',
};

const SEVERITY_CHIP = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  high:   'bg-red-50 text-red-700',
};

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return isoStr; }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try { return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return isoStr.slice(0, 10); }
}

export default function ObservationLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const batchFilter = searchParams.get('batch_id');

  const [dateFilter, setDateFilter] = useState('today');
  const [catFilter, setCatFilter] = useState('');
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = { date: dateFilter };
    if (catFilter) params.category = catFilter;
    if (batchFilter) params.batch_id = batchFilter;
    api.getObservations(params)
      .then(data => { setObservations(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFilter, catFilter, batchFilter]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Observations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        {observations.length > 0 && (
          <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full mt-1">
            {observations.length}
          </span>
        )}
      </div>

      {/* Date filter */}
      <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
        {DATE_FILTERS.map(f => (
          <button key={f.value} onClick={() => setDateFilter(f.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${dateFilter === f.value ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            style={{ minHeight: '40px' }}
          >{f.label}</button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {CATEGORY_FILTERS.map(f => (
          <button key={f.value} onClick={() => setCatFilter(f.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${catFilter === f.value ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'}`}
            style={{ minHeight: '36px' }}
          >{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Loading…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      ) : observations.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center mb-4">
          <div className="text-4xl mb-3">👁</div>
          <div className="text-gray-500 text-sm font-medium">No observations logged</div>
          <div className="text-gray-400 text-xs mt-1">
            {dateFilter === 'today' ? 'Nothing logged today.' : 'No entries in this period.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {observations.map(obs => (
            <ObservationCard
              key={obs.observation_id}
              obs={obs}
              showDate={dateFilter !== 'today'}
            />
          ))}
        </div>
      )}

      <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 pointer-events-none">
        <button
          onClick={() => navigate(batchFilter ? `/observations/new?batch_id=${batchFilter}` : '/observations/new')}
          className="pointer-events-auto w-full max-w-2xl bg-green-800 text-white font-semibold rounded-2xl shadow-lg hover:bg-green-900 active:bg-green-950 transition-colors flex items-center justify-center gap-2"
          style={{ minHeight: '64px', fontSize: '1rem' }}
        >
          <span className="text-xl leading-none">+</span>
          Log Observation
        </button>
      </div>
    </div>
  );
}

function ObservationCard({ obs, showDate }) {
  const target = obs.container_id ?? obs.row_id ?? (obs.batch_sub_zone_id ? `${obs.batch_sub_zone_id} (zone)` : 'Batch');
  const isReadiness = obs.category === 'harvest_readiness';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>
              {obs.batch_strain_name}
            </span>
            {obs.batch_sub_zone_id && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{obs.batch_sub_zone_id}</span>
            )}
          </div>

          {/* Category + severity + target */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className={`font-semibold px-2 py-0.5 rounded-full ${CATEGORY_CHIP[obs.category] ?? 'bg-gray-100 text-gray-700'}`}>
              {CATEGORY_LABELS[obs.category] ?? obs.category}
            </span>
            {obs.severity && (
              <span className={`px-2 py-0.5 rounded-full font-medium ${SEVERITY_CHIP[obs.severity] ?? 'bg-gray-50 text-gray-600'}`}>
                {obs.severity}
              </span>
            )}
            <span className="text-gray-400 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{target}</span>
          </div>

          {/* Harvest readiness specific */}
          {isReadiness && (obs.maturity_pct != null || obs.ready_to_harvest != null) && (
            <div className="flex items-center gap-3 mt-1.5 text-xs">
              {obs.maturity_pct != null && (
                <span className="text-orange-700 font-semibold">{obs.maturity_pct}% mature</span>
              )}
              {obs.ready_to_harvest != null && (
                <span className={`font-semibold ${obs.ready_to_harvest ? 'text-green-700' : 'text-gray-500'}`}>
                  {obs.ready_to_harvest ? '✓ Ready' : '✗ Not ready'}
                </span>
              )}
            </div>
          )}

          {/* Note */}
          {obs.note && (
            <div className="text-xs text-gray-500 italic mt-1 line-clamp-2">{obs.note}</div>
          )}
        </div>

        {/* Right: time + observer */}
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-400">
            {showDate ? formatDate(obs.observed_at) : formatTime(obs.observed_at)}
          </div>
          {obs.observer_name && (
            <div className="text-xs text-gray-400 mt-0.5">{obs.observer_name}</div>
          )}
        </div>
      </div>

      {/* Resolution flag */}
      {obs.resolved_at && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-green-600 font-medium">
          ✓ Resolved {obs.resolution_note ? `— ${obs.resolution_note}` : ''}
        </div>
      )}
    </div>
  );
}
