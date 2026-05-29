import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

function HowItWorksModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>
            How Planting Plans Work
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 pb-8 space-y-5 text-sm text-gray-700">

          <Step n={1} title="Start from a Batch">
            Planting Plans are created from the Batch detail page — not from here.
            Open a batch that is in <strong>Cult-Hoop</strong> (or later), then tap <em>"New Planting Plan."</em>
          </Step>

          <Step n={2} title="Choose a sub-zone and plant count">
            Pick which sub-zone the plants will go into (e.g. Z1A, Z2B). Each sub-zone shows how
            many containers are currently <strong>Ready</strong> (available). Set the plant count
            to how many containers you want to fill — it defaults to the batch's current plant count.
          </Step>

          <Step n={3} title="Stage containers in the grid">
            On the plan detail screen you'll see every container in the sub-zone as a colored cell:
            <div className="mt-2 space-y-1.5">
              <LegendRow color="bg-green-100 border border-green-300" label="Ready" desc="Tap to stage for planting" />
              <LegendRow color="bg-blue-500" label="Draft" desc="Staged — tap to select for partial commit" />
              <LegendRow color="bg-amber-400" label="Committed" desc="Locked in — plant is here" />
              <LegendRow color="bg-gray-100 border border-gray-200" label="N/A" desc="Not in Ready state (in use, startup, etc.)" />
            </div>
            Tap green containers to add them to the draft. They turn blue. Tap blue to select
            them for partial commit, or use the list below the grid to remove them.
          </Step>

          <Step n={4} title="Commit containers">
            When your draft looks right, tap <strong>Commit All</strong> or <strong>Commit Selected</strong>.
            For each committed container, the system:
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              <li>Changes the container state from <strong>Ready → Active</strong></li>
              <li>Creates a plant assignment linking the batch to that container</li>
              <li>If the batch is in Cult-Hoop, automatically advances it to <strong>Field-Veg</strong> and records the location move to Field</li>
            </ul>
          </Step>

          <Step n={5} title="Assign METRC tags (separate step)">
            Committing does <em>not</em> assign METRC tags. After committing, go to the
            <strong> Field Map</strong> for the sub-zone → tap a container → long-press → View Detail →
            Assign METRC Tag. Or use the <strong>Tag Assignment Walkthrough</strong> on the batch
            to tag all containers in one flow.
          </Step>

          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-600">
            <strong className="text-gray-800">Versioning:</strong> If you need to revise a committed plan,
            tap <em>"New Version"</em> on the plan detail screen. A new draft is created and the old version
            is preserved in the audit trail. Uncommitted containers on the old version are freed for re-use.
          </div>

        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-700 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div>
        <div className="font-semibold text-gray-900 mb-1">{title}</div>
        <div className="text-gray-600 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, desc }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-5 h-5 rounded flex-shrink-0 ${color}`} />
      <span className="font-semibold text-gray-800 w-20">{label}</span>
      <span className="text-gray-500">{desc}</span>
    </div>
  );
}

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
  const [showGuide, setShowGuide] = useState(false);

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
      {showGuide && <HowItWorksModal onClose={() => setShowGuide(false)} />}

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Planting Plans
          </h1>
          <button
            onClick={() => setShowGuide(true)}
            className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold hover:bg-gray-200 hover:text-gray-700 flex items-center justify-center flex-shrink-0"
            title="How it works"
          >
            ?
          </button>
        </div>
        {user?.role !== 'grower' && (
          <button
            onClick={() => navigate('/planting-plans/new')}
            className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 active:scale-95 transition-all"
            style={{ minHeight: '44px' }}
          >
            + New Plan
          </button>
        )}
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
        <div className="text-center py-16 text-gray-500">
          <div className="mb-3">No {filter || ''} planting plans found.</div>
          {user?.role !== 'grower' && (
            <button
              onClick={() => navigate('/planting-plans/new')}
              className="px-5 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800"
              style={{ minHeight: '44px' }}
            >
              + Create First Plan
            </button>
          )}
        </div>
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
