import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const FILTER_TABS = [
  { key: 'draft',      label: 'Draft' },
  { key: 'active',     label: 'Active' },
  { key: 'superseded', label: 'Superseded' },
  { key: '',           label: 'All' },
];

const STATUS_CHIP = {
  draft:      'bg-amber-100 text-amber-700',
  active:     'bg-green-100 text-green-800',
  superseded: 'bg-gray-100 text-gray-500',
  cancelled:  'bg-red-100 text-red-600',
};

export default function PlantingPlanList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = filter ? { status: filter } : {};
    api.getPlantingPlans(params)
      .then(data => { setPlans(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [filter]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Planting Plans
        </h1>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key || 'all'}
            onClick={() => setFilter(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === key ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading planting plans…</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No {filter || ''} planting plans found.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map(plan => (
            <div
              key={plan.plan_id}
              onClick={() => navigate(`/planting-plans/${plan.plan_id}`)}
              className="bg-white border border-gray-200 rounded-2xl px-5 py-4 hover:border-green-400 transition-colors cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                  {plan.strain_name}
                </span>
                <span className="text-xs font-mono font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                  {plan.sub_zone_id}
                </span>
                <span className="text-xs text-gray-400">v{plan.version}</span>
                <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_CHIP[plan.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {plan.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{plan.committed_count ?? 0} committed</span>
                <span>·</span>
                <span>{plan.draft_count ?? 0} draft</span>
                <span>·</span>
                <span>{plan.plants_to_place} to place</span>
                {plan.batch_status && (
                  <>
                    <span>·</span>
                    <span className="text-gray-400">Batch: {plan.batch_status}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
