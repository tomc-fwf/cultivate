import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../api';

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return isoStr; }
}

function SectionHeader({ label, count, variant = 'amber' }) {
  const colors = {
    amber: 'text-amber-800 bg-amber-50',
    red: 'text-red-800 bg-red-50',
    green: 'text-green-800 bg-green-50',
    gray: 'text-gray-600 bg-gray-50',
  };
  return (
    <div className={`flex items-center gap-2 mb-2 px-1`}>
      <span className={`text-xs font-bold uppercase tracking-wide ${colors[variant].split(' ')[0]}`}>{label}</span>
      {count != null && count > 0 && (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${colors[variant]}`}>{count}</span>
      )}
    </div>
  );
}

function ClearRow({ label }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-2xl text-green-800 text-sm">
      <CheckCircle2 size={16} className="flex-shrink-0 text-green-600" />
      <span>{label}</span>
    </div>
  );
}

function ActionCard({ children, onClick, variant = 'amber' }) {
  const colors = {
    amber: 'bg-amber-50 border-amber-200 hover:border-amber-400',
    red: 'bg-red-50 border-red-200 hover:border-red-400',
  };
  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors active:opacity-80 ${colors[variant]}`}
      style={{ minHeight: '56px' }}
    >
      {children}
    </button>
  );
}

export default function Tasks() {
  const navigate = useNavigate();
  const today = formatDate(new Date());

  const [activeREIs, setActiveREIs] = useState([]);
  const [pendingActions, setPendingActions] = useState(null);
  const [openObs, setOpenObs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadData() {
    setError('');
    setLoading(true);

    const reiP = api.getPesticideApplications({ rei_active: '1', limit: '50' });
    const actionsP = api.getPendingActions();
    const obsP = api.getObservations({ resolved: '0', limit: '20' });

    Promise.allSettled([reiP, actionsP, obsP]).then(([reiR, actR, obsR]) => {
      if (reiR.status === 'fulfilled') setActiveREIs(reiR.value);
      else setError(reiR.reason?.message || 'Failed to load REIs');

      if (actR.status === 'fulfilled') setPendingActions(actR.value);

      if (obsR.status === 'fulfilled') setOpenObs(obsR.value);
      // if observations don't support resolved filter, silently skip

      setLoading(false);
    });
  }

  useEffect(() => { loadData(); }, []);

  const now = new Date();

  const reiOverdue = activeREIs.filter(r => r.rei_expires_at && new Date(r.rei_expires_at) < now);
  const reiActive = activeREIs.filter(r => !r.rei_expires_at || new Date(r.rei_expires_at) >= now);

  const hasAnyPending = pendingActions && (
    pendingActions.teardown_pending > 0 ||
    pendingActions.startup_pending > 0 ||
    pendingActions.losses_unsynced > 0
  );

  const allClear = !loading && activeREIs.length === 0 && !hasAnyPending && (!openObs || openObs.length === 0);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Tasks</h1>
        <p className="text-sm text-gray-500 mt-0.5">{today}</p>
      </div>

      {error && (
        <button
          onClick={loadData}
          className="w-full mb-4 bg-amber-50 border-2 border-amber-400 text-amber-900 rounded-2xl px-4 py-3 flex items-center justify-between"
        >
          <span className="text-sm font-medium">Unable to load — tap to retry</span>
          <span className="text-amber-600 text-xs">{error}</span>
        </button>
      )}

      {allClear && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 size={48} className="text-green-500 mb-3" />
          <div className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Fraunces, serif' }}>All clear</div>
          <div className="text-sm text-gray-500 mt-1">No pending tasks.</div>
        </div>
      )}

      {/* ── ACTIVE REIs ─────────────────────────────────────────────────────── */}
      {!allClear && (
        <div className="mb-5">
          <SectionHeader
            label="Active REIs"
            count={activeREIs.length}
            variant={activeREIs.length > 0 ? 'red' : 'green'}
          />
          {activeREIs.length === 0 ? (
            <ClearRow label="No active REIs" />
          ) : (
            <div className="flex flex-col gap-2">
              {[...reiOverdue, ...reiActive].map(rei => {
                const isOverdue = rei.rei_expires_at && new Date(rei.rei_expires_at) < now;
                const location = rei.container_id ?? rei.row_id ?? rei.batch_sub_zone_id ?? '—';
                return (
                  <ActionCard
                    key={rei.pesticide_app_id}
                    onClick={() => navigate('/compliance/rei')}
                    variant={isOverdue ? 'red' : 'amber'}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {rei.product_name_snapshot ?? rei.input_name ?? 'Pesticide'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {location}
                        {rei.rei_expires_at && (
                          <span className={`ml-2 font-medium ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                            {isOverdue ? 'Overdue — ' : 'Expires '}
                            {formatTime(rei.rei_expires_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-sm flex-shrink-0 ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>→</span>
                  </ActionCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PENDING SYNC ────────────────────────────────────────────────────── */}
      {!allClear && (
        <div className="mb-5">
          <SectionHeader label="Pending Sync" count={pendingActions?.losses_unsynced ?? 0} variant="amber" />
          {!pendingActions || pendingActions.losses_unsynced === 0 ? (
            <ClearRow label="METRC sync up to date" />
          ) : (
            <div className="flex flex-col gap-2">
              {pendingActions.losses_unsynced > 0 && (
                <ActionCard onClick={() => navigate('/compliance/metrc-reconciliation')} variant="amber">
                  <span className="text-lg flex-shrink-0">⚠</span>
                  <span className="text-sm font-medium text-amber-900 flex-1">
                    {pendingActions.losses_unsynced} plant loss{pendingActions.losses_unsynced > 1 ? 'es' : ''} not yet synced to METRC
                  </span>
                  <span className="text-amber-600 text-sm flex-shrink-0">→</span>
                </ActionCard>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CONTAINER ACTIONS ───────────────────────────────────────────────── */}
      {!allClear && pendingActions && (pendingActions.teardown_pending > 0 || pendingActions.startup_pending > 0 || pendingActions.lab_samples_awaiting > 0) && (
        <div className="mb-5">
          <SectionHeader
            label="Container Actions"
            count={(pendingActions.teardown_pending ?? 0) + (pendingActions.startup_pending ?? 0)}
            variant="amber"
          />
          <div className="flex flex-col gap-2">
            {pendingActions.teardown_pending > 0 && (
              <ActionCard onClick={() => navigate('/containers?state=teardown')} variant="amber">
                <span className="text-lg flex-shrink-0">🪣</span>
                <span className="text-sm font-medium text-amber-900 flex-1">
                  {pendingActions.teardown_pending} teardown container{pendingActions.teardown_pending > 1 ? 's' : ''} awaiting soil sample
                </span>
                <span className="text-amber-600 text-sm flex-shrink-0">→</span>
              </ActionCard>
            )}
            {pendingActions.startup_pending > 0 && (
              <ActionCard onClick={() => navigate('/containers?state=startup')} variant="amber">
                <span className="text-lg flex-shrink-0">🌱</span>
                <span className="text-sm font-medium text-amber-900 flex-1">
                  {pendingActions.startup_pending} container{pendingActions.startup_pending > 1 ? 's' : ''} in startup
                </span>
                <span className="text-amber-600 text-sm flex-shrink-0">→</span>
              </ActionCard>
            )}
            {pendingActions.lab_samples_awaiting > 0 && (
              <ActionCard onClick={() => navigate('/containers')} variant="amber">
                <span className="text-lg flex-shrink-0">🧪</span>
                <span className="text-sm font-medium text-amber-900 flex-1">
                  {pendingActions.lab_samples_awaiting} soil sample{pendingActions.lab_samples_awaiting > 1 ? 's' : ''} at lab awaiting results
                </span>
                <span className="text-amber-600 text-sm flex-shrink-0">→</span>
              </ActionCard>
            )}
          </div>
        </div>
      )}

      {/* ── OPEN OBSERVATIONS ───────────────────────────────────────────────── */}
      {!allClear && openObs && openObs.length > 0 && (
        <div className="mb-5">
          <SectionHeader label="Open Observations" count={openObs.length} variant="amber" />
          <ActionCard onClick={() => navigate('/observations')} variant="amber">
            <span className="text-lg flex-shrink-0">👁</span>
            <span className="text-sm font-medium text-amber-900 flex-1">
              {openObs.length} unresolved observation{openObs.length > 1 ? 's' : ''}
            </span>
            <span className="text-amber-600 text-sm flex-shrink-0">View all →</span>
          </ActionCard>
        </div>
      )}
    </div>
  );
}
