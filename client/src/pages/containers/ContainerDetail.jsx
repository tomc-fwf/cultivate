import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const STATE_CHIP = {
  ready:           'bg-green-100 text-green-800',
  active:          'bg-green-500 text-white',
  empty:           'bg-amber-300 text-amber-900',
  teardown:        'bg-orange-400 text-white',
  startup:         'bg-blue-400 text-white',
  out_of_service:  'bg-gray-300 text-gray-700',
};

const STATE_LABELS = {
  ready:           'Ready',
  active:          'Active',
  empty:           'Empty',
  teardown:        'Teardown',
  startup:         'Startup',
  out_of_service:  'Out of Service',
};

const TRIGGER_LABELS = {
  batch_assigned:    'Batch assigned',
  plant_loss:        'Plant loss',
  plant_replaced:    'Plant replaced',
  batch_closed:      'Batch closed',
  teardown_complete: 'Teardown complete',
  startup_complete:  'Startup complete',
  manual:            'Manual',
  other:             'Other',
};

const BATCH_STATUS_CHIP = {
  'germ':         'bg-gray-100 text-gray-700',
  'seedling':     'bg-lime-100 text-lime-700',
  'cult-hoop':    'bg-green-100 text-green-700',
  'field-veg':    'bg-green-100 text-green-800',
  'field-flower': 'bg-purple-100 text-purple-700',
  'flush':        'bg-amber-100 text-amber-700',
  'harvest':      'bg-orange-100 text-orange-700',
  'closed':       'bg-gray-100 text-gray-400',
};

const BATCH_STATUS_LABELS = {
  'germ':         'Germination',
  'seedling':     'Seedlings',
  'cult-hoop':    'Cult-Hoop',
  'field-veg':    'Field — Veg',
  'field-flower': 'Field — Flower',
  'flush':        'Flush',
  'harvest':      'Harvest',
  'closed':       'Closed',
};

function daysSince(isoTimestamp) {
  if (!isoTimestamp) return null;
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function ContainerDetail() {
  const { containerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState('');

  const [showOosConfirm, setShowOosConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [stateError, setStateError] = useState('');

  const isAdmin = user && user.role === 'admin';
  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  function load() {
    setLoading(true);
    api.getContainer(containerId)
      .then(d => { setData(d); setNotesValue(d.container?.container_notes ?? ''); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [containerId]);

  async function saveNotes() {
    setSavingNotes(true);
    setNotesError('');
    try {
      await api.updateContainerNotes(containerId, { notes: notesValue });
      setData(d => ({
        ...d,
        container: { ...d.container, container_notes: notesValue },
        current_state: { ...d.current_state, notes: notesValue },
      }));
      setEditingNotes(false);
    } catch (e) { setNotesError(e.message); }
    setSavingNotes(false);
  }

  async function markOos() {
    setSavingState(true);
    setStateError('');
    try {
      await api.updateContainerState(containerId, { to_state: 'out_of_service', notes: 'Manually marked out of service' });
      load();
      setShowOosConfirm(false);
    } catch (e) { setStateError(e.message); }
    setSavingState(false);
  }

  async function restoreReady() {
    setSavingState(true);
    setStateError('');
    try {
      await api.updateContainerState(containerId, { to_state: 'ready', notes: 'Restored to ready' });
      load();
      setShowRestoreConfirm(false);
    } catch (e) { setStateError(e.message); }
    setSavingState(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error || 'Container not found'}
        </div>
      </div>
    );
  }

  const { container, current_state, current_batch, current_tag, state_history, amendments, teardown_events, startup_events, past_batches } = data;
  const state = current_state?.current_state;
  const daysInState = daysSince(current_state?.state_since);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {/* Back button */}
      <button
        onClick={() => navigate('/containers')}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← Containers
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap mb-5">
        <div className="flex-1 min-w-0">
          <h1
            className="text-2xl font-bold text-gray-900 leading-tight"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            {container.container_id}
          </h1>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {container.pot_size_gal}-gal
            </span>
            {state && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATE_CHIP[state] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATE_LABELS[state] ?? state}
              </span>
            )}
            {daysInState != null && (
              <span className="text-xs text-gray-500">
                {daysInState === 0 ? 'since today' : `${daysInState}d in state`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* State-specific callouts */}
      {state === 'ready' && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-800 font-medium">
          Ready for next batch
        </div>
      )}
      {state === 'out_of_service' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <div className="text-sm text-amber-800 font-semibold mb-2">Container is out of service</div>
          {isAdmin && (
            <>
              {stateError && <div className="text-red-600 text-xs mb-2">{stateError}</div>}
              {!showRestoreConfirm ? (
                <button
                  onClick={() => setShowRestoreConfirm(true)}
                  className="text-sm text-amber-700 font-semibold underline hover:text-amber-900"
                >
                  Restore to Ready
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-amber-700">Restore this container to Ready?</span>
                  <button
                    disabled={savingState}
                    onClick={restoreReady}
                    className="bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                  >
                    {savingState ? 'Restoring…' : 'Confirm'}
                  </button>
                  <button onClick={() => setShowRestoreConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Out of service action for ready containers (admin only) */}
      {state === 'ready' && isAdmin && (
        <div className="mb-4">
          {stateError && <div className="text-red-600 text-xs mb-2">{stateError}</div>}
          {!showOosConfirm ? (
            <button
              onClick={() => setShowOosConfirm(true)}
              className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:text-gray-700 hover:border-gray-300"
            >
              Mark Out of Service
            </button>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex gap-2 items-center">
              <span className="text-xs text-gray-700">Mark this container out of service?</span>
              <button
                disabled={savingState}
                onClick={markOos}
                className="bg-gray-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {savingState ? 'Saving…' : 'Confirm'}
              </button>
              <button onClick={() => setShowOosConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Current occupancy card */}
      {current_batch && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Current Occupancy</h2>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-bold text-green-900 text-base" style={{ fontFamily: 'Fraunces, serif' }}>
              {current_batch.strain_name}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              current_batch.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
            }`}>
              {current_batch.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BATCH_STATUS_CHIP[current_batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {BATCH_STATUS_LABELS[current_batch.status] ?? current_batch.status}
            </span>
          </div>
          <div className="text-sm text-gray-600 mb-1">
            Sow date: <span className="font-mono">{fmtDate(current_batch.sow_date)}</span>
          </div>
          {current_batch.active_recipe_name && (
            <div className="text-sm text-gray-600 mb-1">
              Recipe: <span className="font-semibold text-green-800">{current_batch.active_recipe_name}</span>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">METRC tag:</span>
            {current_tag ? (
              <span className="font-mono text-sm text-gray-800">
                {current_tag.metrc_plant_tag.slice(0, -4)}
                <span className="font-bold text-green-800">{current_tag.metrc_plant_tag.slice(-4)}</span>
              </span>
            ) : (
              <span className="text-xs text-amber-600 italic">No tag assigned</span>
            )}
          </div>
          <button
            onClick={() => navigate(`/batches/${current_batch.batch_id}`)}
            className="mt-3 text-xs text-green-700 font-semibold hover:text-green-900"
          >
            View Batch →
          </button>
        </div>
      )}

      {/* Notes section */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Notes</h2>
          {isSupervisor && !editingNotes && (
            <button
              onClick={() => { setEditingNotes(true); setNotesValue(container.container_notes ?? ''); }}
              className="text-xs text-green-700 font-medium hover:text-green-900"
            >
              Edit
            </button>
          )}
        </div>

        {editingNotes ? (
          <div>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none mb-2"
              rows={3}
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              placeholder="Notes about this container (e.g. broken drip, damaged pot)…"
            />
            {notesError && <div className="text-red-600 text-xs mb-2">{notesError}</div>}
            <div className="flex gap-2">
              <button
                disabled={savingNotes}
                onClick={saveNotes}
                className="bg-green-800 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-green-900 disabled:opacity-50"
                style={{ minHeight: '40px' }}
              >
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingNotes(false); setNotesError(''); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 whitespace-pre-wrap">
            {container.container_notes || <span className="italic text-gray-400">No notes</span>}
          </p>
        )}
      </div>

      {/* State History */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">State History</h2>
        {state_history.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No state transitions recorded yet</p>
        ) : (
          <div className="flex flex-col gap-3">
            {state_history.map(t => (
              <div key={t.transition_id} className="flex items-start gap-3 text-sm">
                <div className="flex flex-col items-center pt-1">
                  <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.from_state && (
                      <>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_CHIP[t.from_state] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATE_LABELS[t.from_state] ?? t.from_state}
                        </span>
                        <span className="text-gray-400 text-xs">→</span>
                      </>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_CHIP[t.to_state] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATE_LABELS[t.to_state] ?? t.to_state}
                    </span>
                    <span className="text-xs text-gray-400">
                      {TRIGGER_LABELS[t.trigger_event] ?? t.trigger_event}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {fmtDateTime(t.transitioned_at)}
                    {t.transitioned_by_name && ` · ${t.transitioned_by_name}`}
                  </div>
                  {t.notes && <div className="text-xs text-gray-500 mt-0.5 italic">{t.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Amendment History */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Amendment History</h2>
        {amendments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No amendments recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Product</th>
                  <th className="pb-2 pr-3 font-medium">Qty</th>
                  <th className="pb-2 pr-3 font-medium">Method</th>
                  <th className="pb-2 pr-3 font-medium">Purpose</th>
                  <th className="pb-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {amendments.map(a => (
                  <tr key={a.amendment_id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-3 text-xs font-mono text-gray-600 whitespace-nowrap">{fmtDate(a.applied_at)}</td>
                    <td className="py-2 pr-3 text-xs text-gray-700 capitalize">{(a.amendment_type ?? '').replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-3 text-xs text-gray-800">{a.item_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                      {a.quantity != null ? `${a.quantity} ${a.quantity_unit ?? ''}` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-600 capitalize">{(a.application_method ?? '—').replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-3 text-xs text-gray-600 max-w-32 truncate" title={a.purpose ?? ''}>{a.purpose ?? '—'}</td>
                    <td className="py-2 text-xs text-gray-500">{a.applicator_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Teardown Events */}
      {teardown_events.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Teardown Events</h2>
          <div className="flex flex-col gap-3">
            {teardown_events.map(t => (
              <div key={t.teardown_id} className="border border-gray-100 rounded-xl p-3 text-sm">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-gray-800">{fmtDate(t.started_at)}</span>
                  {t.completed_at && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Complete</span>
                  )}
                  {!t.completed_at && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">In Progress</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  {Boolean(t.plant_removed) && <span>Plant removed</span>}
                  {Boolean(t.debris_disposed) && <span>Debris disposed</span>}
                  {Boolean(t.container_cleaned) && <span>Container cleaned</span>}
                  {Boolean(t.soil_sample_collected) ? (
                    <span className="text-green-700 font-medium">Soil sample collected</span>
                  ) : (
                    <span className="text-amber-600">No soil sample</span>
                  )}
                </div>
                {t.performed_by_name && (
                  <div className="text-xs text-gray-400 mt-1">By {t.performed_by_name}</div>
                )}
                {t.notes && <div className="text-xs text-gray-500 mt-1 italic">{t.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Startup Events */}
      {startup_events.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Startup Events</h2>
          <div className="flex flex-col gap-3">
            {startup_events.map(s => (
              <div key={s.startup_id} className="border border-gray-100 rounded-xl p-3 text-sm">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-gray-800">{fmtDate(s.started_at)}</span>
                  {s.ready_sign_off_at ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Signed Off</span>
                  ) : s.completed_at ? (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Complete</span>
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">In Progress</span>
                  )}
                </div>
                {s.media_replaced_pct != null && (
                  <div className="text-xs text-gray-600">
                    Media replaced: {s.media_replaced_pct}%{s.media_brand ? ` (${s.media_brand})` : ''}
                  </div>
                )}
                {s.amendments_applied_count > 0 && (
                  <div className="text-xs text-gray-600">{s.amendments_applied_count} amendment(s) applied</div>
                )}
                {s.performed_by_name && (
                  <div className="text-xs text-gray-400 mt-1">By {s.performed_by_name}</div>
                )}
                {s.notes && <div className="text-xs text-gray-500 mt-1 italic">{s.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Batches */}
      {past_batches.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Past Batches</h2>
          <div className="flex flex-col gap-2">
            {past_batches.map(b => (
              <div key={b.batch_id} className="flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800">{b.strain_name}</span>
                  <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    b.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {b.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
                  </span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BATCH_STATUS_CHIP[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {BATCH_STATUS_LABELS[b.status] ?? b.status}
                </span>
                <span className="text-xs text-gray-400 font-mono">{fmtDate(b.sow_date)}</span>
                <button
                  onClick={() => navigate(`/batches/${b.batch_id}`)}
                  className="text-xs text-green-700 hover:text-green-900 font-semibold flex-shrink-0"
                >
                  View →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
