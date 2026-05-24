import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

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
  // legacy
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
  'harvest':        'Field',
};

const FILTER_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
  { key: 'all',    label: 'All' },
];

export default function Batches() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialLocationId = searchParams.get('location_id');
  const initialLocationName = searchParams.get('location_name');

  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active');
  const [locationFilter, setLocationFilter] = useState(initialLocationId ? Number(initialLocationId) : null);
  const [locationName] = useState(initialLocationName ?? null);

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = { status: filter };
    if (locationFilter) params.location_id = locationFilter;
    api.getBatches(params)
      .then(data => { setBatches(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [filter, locationFilter]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Plant Batches
          </h1>
          {!loading && (
            <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-1 rounded-full">
              {batches.length}
            </span>
          )}
        </div>
        {isSupervisor && (
          <button
            onClick={() => navigate('/batches/new')}
            className="bg-green-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-green-900 transition-colors"
            style={{ minHeight: '56px' }}
          >
            + New Plant Batch
          </button>
        )}
      </div>

      {/* Location filter banner */}
      {locationFilter && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-800 flex items-center justify-between">
          <span>
            Showing batches for{' '}
            <span className="font-semibold">{locationName ?? `Location ${locationFilter}`}</span>
          </span>
          <button
            onClick={() => setLocationFilter(null)}
            className="ml-3 text-green-700 hover:text-green-900 font-bold text-base leading-none"
            aria-label="Clear location filter"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {FILTER_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${filter === key ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >{label}</button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading plant batches…</div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">No {filter !== 'all' ? filter + ' ' : ''}plant batches found.</p>
          {isSupervisor && filter === 'active' && !locationFilter && (
            <button
              onClick={() => navigate('/batches/new')}
              className="bg-green-800 text-white text-sm font-semibold px-5 py-3 rounded-xl hover:bg-green-900 transition-colors"
              style={{ minHeight: '56px' }}
            >
              Create First Plant Batch
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {batches.map(batch => (
            <BatchCard key={batch.batch_id} batch={batch} onClick={() => navigate(`/batches/${batch.batch_id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchCard({ batch, onClick }) {
  const ec = batch.active_recipe_ec_low != null || batch.active_recipe_ec_high != null
    ? `EC ${batch.active_recipe_ec_low ?? '?'}–${batch.active_recipe_ec_high ?? '?'}`
    : null;
  const location = LOCATION_LABEL[batch.status];

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-200 px-5 py-4 hover:border-green-400 transition-colors cursor-pointer active:scale-[0.99]"
      style={{ minHeight: '80px' }}
    >
      {/* Top row */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="font-semibold text-gray-900 text-base" style={{ fontFamily: 'Fraunces, serif' }}>
          {batch.strain_name}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          batch.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
        }`}>
          {batch.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
        </span>
        {/* Location badge */}
        {location && (
          <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
            📍 {location}{batch.sub_zone_id ? ` · ${batch.sub_zone_id}` : ''}
          </span>
        )}
      </div>

      {/* Phase + days + plants */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
        <span className="text-xs text-gray-500">Day {batch.days_in_stage ?? 0} in stage</span>
        {batch.plant_age_days != null && (
          <span className="text-xs text-gray-400">Age {batch.plant_age_days}d</span>
        )}
        <span className="text-xs text-gray-500">{batch.plant_count_current} plants</span>
      </div>

      {/* Recipe + sow date */}
      <div className="flex items-center gap-3 flex-wrap">
        {batch.active_recipe_name ? (
          <span className="text-xs text-gray-600">
            {batch.active_recipe_name}{ec ? ` · ${ec}` : ''}
          </span>
        ) : (
          <span className="text-xs text-amber-600 font-medium">No recipe assigned</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">Sow {batch.sow_date}</span>
      </div>

      {/* METRC UID */}
      <div className="mt-2 pt-2 border-t border-gray-100">
        {batch.metrc_plant_batch_uid ? (
          <span className="text-xs font-mono text-gray-500 tracking-wide">
            METRC <span className="text-gray-400">{batch.metrc_plant_batch_uid.slice(0, -4)}</span>
            <span className="font-bold text-gray-700">{batch.metrc_plant_batch_uid.slice(-4)}</span>
          </span>
        ) : (
          <span className="text-xs text-amber-600 font-medium">⚠ No METRC UID — required before harvest</span>
        )}
      </div>
    </div>
  );
}
