import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, Tag, FlaskConical, Microscope, Eye, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../App';

const STATE_CHIP = {
  ready:          'bg-green-100 text-green-800',
  active:         'bg-green-500 text-white',
  empty:          'bg-amber-200 text-amber-900',
  teardown:       'bg-orange-200 text-orange-900',
  startup:        'bg-blue-100 text-blue-800',
  out_of_service: 'bg-gray-200 text-gray-700',
};

const STATE_LABELS = {
  ready:          'Ready',
  active:         'Active',
  empty:          'Empty',
  teardown:       'Teardown',
  startup:        'Startup',
  out_of_service: 'Out of Service',
};

const MANUAL_STATES = ['ready', 'startup', 'teardown', 'out_of_service'];

function daysAgo(isoString) {
  if (!isoString) return null;
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000);
}

function fmt(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString();
}

export default function ContainerQuickSheet({ container, subZonePotSize, onClose, onStateChanged }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisorPlus = ['supervisor', 'admin'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [showStateChange, setShowStateChange] = useState(false);
  const [settingState, setSettingState] = useState(false);
  const [stateError, setStateError] = useState('');

  useEffect(() => {
    setLoadingDetail(true);
    api.getContainer(container.container_id)
      .then(d => { setDetail(d); setLoadingDetail(false); })
      .catch(() => setLoadingDetail(false));
  }, [container.container_id]);

  async function handleSetState(toState) {
    setSettingState(true);
    setStateError('');
    try {
      await api.updateContainerState(container.container_id, { to_state: toState });
      onStateChanged?.();
      onClose();
    } catch (e) {
      setStateError(e.message);
      setSettingState(false);
    }
  }

  const currentState = detail?.current_state?.current_state ?? container.current_state;
  const stateSince = detail?.current_state?.state_since ?? container.state_since;
  const daysInState = daysAgo(stateSince);
  const currentBatch = detail?.current_batch;
  const plantTag = detail?.current_plant_tag;
  const amendments = detail?.amendment_history ?? [];
  const stateHistory = detail?.state_history ?? [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Sticky header ── */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono font-bold text-xl text-gray-900 tracking-tight">
                {container.container_id}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATE_CHIP[currentState] ?? 'bg-gray-100 text-gray-700'}`}>
                  {STATE_LABELS[currentState] ?? currentState}
                </span>
                {subZonePotSize && (
                  <span className="text-xs text-gray-500">{subZonePotSize}-gal pot</span>
                )}
                {daysInState !== null && (
                  <span className="text-xs text-gray-500">
                    {daysInState === 0 ? 'Today' : `${daysInState}d in state`}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-3">×</button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto pb-8">

          {/* Plant / METRC tag */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Plant & METRC Tag</div>
            {loadingDetail ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" />Loading…
              </div>
            ) : plantTag?.metrc_plant_tag ? (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Tag size={15} className="text-green-700" />
                </div>
                <div>
                  <div className="font-mono text-sm text-gray-700 break-all">
                    {plantTag.metrc_plant_tag.slice(0, -4)}
                    <span className="font-bold text-green-700">{plantTag.metrc_plant_tag.slice(-4)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Assigned {fmt(plantTag.assigned_at)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Tag size={15} className="text-gray-400" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">No METRC tag assigned</div>
                  <div className="text-xs text-gray-400">Tag assignment coming in Phase 1</div>
                </div>
              </div>
            )}
          </div>

          {/* Batch / strain context */}
          {(currentBatch || container.strain_name) && (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Batch</div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                    <Sprout size={15} className="text-green-700" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {currentBatch?.strain_name ?? container.strain_name ?? '—'}
                    </div>
                    {(currentBatch?.strain_type ?? container.strain_type) && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                        (currentBatch?.strain_type ?? container.strain_type) === 'auto'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {(currentBatch?.strain_type ?? container.strain_type) === 'auto' ? 'AUTO' : 'PHOTO'}
                      </span>
                    )}
                    {currentBatch?.status && (
                      <div className="text-xs text-gray-500 mt-1">
                        Status: {currentBatch.status}
                        {currentBatch.sow_date && ` · Sow: ${fmt(currentBatch.sow_date)}`}
                      </div>
                    )}
                    {currentBatch?.active_recipe_name && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Recipe: {currentBatch.active_recipe_name} {currentBatch.active_recipe_version && `v${currentBatch.active_recipe_version}`}
                      </div>
                    )}
                  </div>
                </div>
                {currentBatch?.batch_id && (
                  <button
                    onClick={() => navigate(`/batches/${currentBatch.batch_id}`)}
                    className="text-xs text-green-700 font-semibold hover:text-green-900 flex-shrink-0"
                  >
                    View Batch →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Amendment & history summary */}
          {!loadingDetail && (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">History Summary</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="text-xs text-gray-500">Amendments</div>
                  <div className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {amendments.length}
                  </div>
                  {amendments.length > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Last: {fmt(amendments[0]?.applied_at)}
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="text-xs text-gray-500">State changes</div>
                  <div className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {stateHistory.length}
                  </div>
                  {stateHistory.length > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Since: {fmt(stateHistory[stateHistory.length - 1]?.transitioned_at)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Actions</div>

            {/* Available now */}
            <div className="flex flex-col gap-2 mb-4">
              <button
                onClick={() => { onClose(); navigate(`/containers/${encodeURIComponent(container.container_id)}`); }}
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl bg-green-800 text-white font-semibold text-sm hover:bg-green-900 active:scale-[0.98] transition-transform"
                style={{ minHeight: 56 }}
              >
                <span>View Full Detail</span>
                <ChevronRight size={18} />
              </button>

              {isSupervisorPlus && (
                <button
                  onClick={() => setShowStateChange(s => !s)}
                  className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl bg-white border border-gray-200 text-gray-800 font-semibold text-sm hover:border-gray-400 active:scale-[0.98] transition-transform"
                  style={{ minHeight: 56 }}
                >
                  <span>Change State</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATE_CHIP[currentState]}`}>
                    {STATE_LABELS[currentState]}
                  </span>
                </button>
              )}

              {/* Inline state picker */}
              {showStateChange && isSupervisorPlus && (
                <div className="rounded-xl border border-gray-200 p-3 grid grid-cols-2 gap-2">
                  {(isAdmin ? Object.keys(STATE_LABELS) : MANUAL_STATES).map(state => (
                    <button
                      key={state}
                      onClick={() => handleSetState(state)}
                      disabled={settingState || state === currentState}
                      className={`py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${
                        state === currentState
                          ? `${STATE_CHIP[state]} ring-2 ring-offset-1 ring-current`
                          : `${STATE_CHIP[state]} hover:opacity-80`
                      }`}
                    >
                      {STATE_LABELS[state]}
                      {state === currentState && ' ✓'}
                    </button>
                  ))}
                  {stateError && (
                    <div className="col-span-2 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5 mt-1">{stateError}</div>
                  )}
                </div>
              )}
            </div>

            {/* Coming soon actions */}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Coming Soon</div>
            <div className="flex flex-col gap-1.5">
              {[
                { icon: Eye, label: 'Record Observation', note: 'Phase 1 #10' },
                { icon: FlaskConical, label: 'Apply Foliar Spot Treatment', note: 'Phase 1 #6' },
                { icon: Microscope, label: 'Log Pesticide Application', note: 'Phase 1 #8' },
                { icon: Tag, label: 'Assign METRC Tag', note: 'Phase 1 #16' },
              ].map(({ icon: Icon, label, note }) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 text-gray-400"
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <span className="text-xs">{note}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
