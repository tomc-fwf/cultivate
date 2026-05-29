import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const METRC_TAG_RE = /^[A-Za-z0-9]{24}$/;

function InlineTagInput({ containerId, assignmentId, onTagged }) {
  const [tagValue, setTagValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [reason, setReason] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const isValid = METRC_TAG_RE.test(tagValue);

  async function doAssign(tag) {
    setSaving(true);
    setError('');
    const result = await api.assignTagRaw({
      container_id: containerId,
      metrc_plant_tag: tag,
      assignment_id: assignmentId ?? undefined,
    });
    if (result.ok) {
      onTagged(result.data);
    } else if (result.status === 409) {
      setConflict({ metrc_plant_tag: tag, existing_assignment: result.data.existing_assignment });
      setSaving(false);
    } else {
      setError(result.data?.error || 'Assignment failed');
      setSaving(false);
    }
  }

  async function handleChange(e) {
    const val = e.target.value.replace(/\s/g, '').toUpperCase();
    setTagValue(val);
    if (METRC_TAG_RE.test(val)) await doAssign(val);
  }

  async function handleReassign() {
    if (!reason.trim()) { setError('Reason is required'); return; }
    setReassigning(true);
    setError('');
    try {
      const result = await api.reassignTag({
        metrc_plant_tag: conflict.metrc_plant_tag,
        from_assignment_id: conflict.existing_assignment.assignment_id,
        to_container_id: containerId,
        to_assignment_id: assignmentId ?? undefined,
        reason: reason.trim(),
      });
      onTagged(result.to_assignment);
    } catch (e) {
      setError(e.message);
    }
    setReassigning(false);
  }

  if (conflict) {
    return (
      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="text-sm font-semibold text-amber-800 mb-1">Tag already assigned</div>
        <div className="text-xs text-amber-700 mb-3">
          …{conflict.metrc_plant_tag.slice(-8)} is assigned to{' '}
          <span className="font-mono font-bold">{conflict.existing_assignment.container_id}</span>
          {conflict.existing_assignment.strain_name && ` (${conflict.existing_assignment.strain_name})`}.
        </div>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Reason for reassignment <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. Correcting mis-scan at previous container"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
        {error && <div className="text-red-600 text-xs mb-2">{error}</div>}
        <div className="flex gap-2">
          <button
            onClick={handleReassign}
            disabled={reassigning || !reason.trim()}
            className="flex-1 bg-amber-600 text-white text-sm font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-amber-700 transition-colors"
            style={{ minHeight: '48px' }}
          >
            {reassigning ? 'Reassigning…' : 'Reassign to This Container'}
          </button>
          <button
            onClick={() => { setConflict(null); setTagValue(''); setSaving(false); }}
            className="px-4 py-3 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="text"
        value={tagValue}
        onChange={handleChange}
        maxLength={24}
        disabled={saving}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="Scan or type 24-character METRC tag"
        className={`w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 transition-colors ${
          tagValue.length > 0 && tagValue.length < 24 ? 'border-amber-300 focus:ring-amber-300' :
          isValid ? 'border-green-400 focus:ring-green-300' :
          'border-gray-200 focus:ring-green-300'
        }`}
        style={{ minHeight: '52px' }}
      />
      <div className="flex items-center justify-between mt-1">
        {tagValue.length > 0 && tagValue.length < 24 ? (
          <span className="text-xs text-amber-600">{tagValue.length}/24 — {24 - tagValue.length} more needed</span>
        ) : <span />}
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}

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
  const [soilSamples, setSoilSamples] = useState([]);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState('');

  // Inline tag assignment
  const [showTagInput, setShowTagInput] = useState(false);

  const [showOosConfirm, setShowOosConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [stateError, setStateError] = useState('');

  // Harvest context — loaded lazily when batch is 'harvesting'
  const [harvestCtx, setHarvestCtx] = useState(null);

  // REI pre-entry check — shown as full-screen modal before the record renders
  const [reiWarning, setReiWarning] = useState(null); // null | { rei_expires_at, ... }
  const [reiChecking, setReiChecking] = useState(false);
  const [reiAcknowledged, setReiAcknowledged] = useState(false);

  const isAdmin = user && user.role === 'admin';
  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  function load() {
    setLoading(true);
    api.getContainer(containerId)
      .then(d => { setData(d); setNotesValue(d.container?.container_notes ?? ''); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [containerId]);

  // Load soil samples separately
  useEffect(() => {
    setLoadingSamples(true);
    api.getSoilSamples(containerId)
      .then(s => { setSoilSamples(s); setLoadingSamples(false); })
      .catch(() => setLoadingSamples(false));
  }, [containerId]);

  // REI check — runs whenever container data loads for a batch
  useEffect(() => {
    if (!data?.current_state?.current_batch_id) return;
    if (reiAcknowledged) return; // don't re-check after acknowledgment
    const batchId = data.current_state.current_batch_id;
    setReiChecking(true);
    api.getPesticideApplications({ rei_active: '1', batch_id: String(batchId), limit: '5' })
      .then(apps => {
        if (apps && apps.length > 0) setReiWarning(apps[0]);
        setReiChecking(false);
      })
      .catch(() => { setReiChecking(false); });
  }, [data?.current_state?.current_batch_id]);

  // Load harvest status when batch is in harvesting status and container is active/empty
  useEffect(() => {
    if (!data) return;
    const { current_batch, current_state } = data;
    const st = current_state?.current_state;
    if (current_batch?.status !== 'harvesting') return;
    if (st !== 'active' && st !== 'empty') return;
    api.getHarvestStatus(current_batch.batch_id)
      .then(d => setHarvestCtx(d))
      .catch(() => setHarvestCtx(null));
  }, [data]);

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

  // Full-screen REI gate — must be acknowledged before the container record renders
  if (reiWarning && !reiAcknowledged) {
    const expiresStr = reiWarning.rei_expires_at
      ? new Date(reiWarning.rei_expires_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
      : 'unknown time';
    return (
      <div className="fixed inset-0 z-50 bg-red-700 flex flex-col items-center justify-center px-6 text-white">
        <div className="text-6xl mb-6">⚠</div>
        <div className="text-2xl font-bold mb-2" style={{ fontFamily: 'Fraunces, serif' }}>REI Active</div>
        <div className="text-lg font-mono font-semibold mb-4 bg-red-800 px-4 py-1.5 rounded-xl">
          {containerId}
        </div>
        <div className="text-center text-red-100 text-sm mb-2">Re-entry interval is active in this area.</div>
        <div className="text-center text-red-100 text-sm mb-8">
          Do not enter without appropriate PPE until REI clears.
        </div>
        <div className="text-center text-white font-semibold text-base mb-6">
          Restricted until:
          <div className="text-xl font-bold mt-1">{expiresStr}</div>
        </div>
        <button
          onClick={() => setReiAcknowledged(true)}
          className="w-full max-w-sm bg-white text-red-700 font-bold rounded-2xl py-4 text-base shadow-lg active:bg-red-50"
          style={{ minHeight: '64px' }}
        >
          I understand — REI active until {expiresStr}
        </button>
      </div>
    );
  }

  if (loading || reiChecking) {
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
        onClick={() => navigate(-1)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← Back
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

      {/* Lifecycle Actions */}
      {(state === 'active' || state === 'empty') && current_batch && (
        <div className="mb-4">
          <button
            onClick={() => navigate(`/containers/${encodeURIComponent(container.container_id)}/teardown?batch_id=${current_batch.batch_id}`)}
            className="flex items-center gap-2 w-full px-4 py-3 bg-orange-50 border-2 border-orange-200 text-orange-900 font-semibold text-sm rounded-2xl hover:border-orange-400 transition-colors"
            style={{ minHeight: '56px' }}
          >
            <span>🧹</span>Begin Teardown
          </button>
        </div>
      )}
      {state === 'teardown' && (
        <div className="mb-4 flex flex-col gap-2">
          <button
            onClick={() => navigate(`/containers/${encodeURIComponent(container.container_id)}/soil-sample/new?teardown_id=${teardown_events?.[0]?.teardown_id ?? 'new'}`)}
            className="flex items-center gap-2 w-full px-4 py-3 bg-blue-50 border-2 border-blue-200 text-blue-900 font-semibold text-sm rounded-2xl hover:border-blue-400 transition-colors"
            style={{ minHeight: '56px' }}
          >
            <span>🧪</span>Log Soil Sample
          </button>
          <button
            onClick={() => navigate(`/containers/${encodeURIComponent(container.container_id)}/startup`)}
            className="flex items-center gap-2 w-full px-4 py-3 bg-blue-50 border-2 border-blue-300 text-blue-900 font-semibold text-sm rounded-2xl hover:border-blue-500 transition-colors"
            style={{ minHeight: '56px' }}
          >
            <span>🌱</span>Begin Startup
          </button>
        </div>
      )}
      {state === 'startup' && isSupervisor && startup_events?.[0] && (
        <div className="mb-4">
          <button
            onClick={() => navigate(`/containers/${encodeURIComponent(container.container_id)}/startup/${startup_events[0].startup_id}/ready`)}
            className="flex items-center gap-2 w-full px-4 py-3 bg-green-50 border-2 border-green-400 text-green-900 font-semibold text-sm rounded-2xl hover:border-green-600 transition-colors"
            style={{ minHeight: '56px' }}
          >
            <span>✅</span>Mark as Ready for Planting
          </button>
        </div>
      )}
      {state === 'startup' && !isSupervisor && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-700">
          Supervisor sign-off required to mark this container as ready.
        </div>
      )}

      {/* Current occupancy card */}
      {current_batch && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Current Occupancy</h2>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-bold text-green-900 text-base" style={{ fontFamily: 'Fraunces, serif' }}>
              {current_batch.batch_name || current_batch.strain_name}
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
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">METRC tag:</span>
            {current_tag ? (
              <span className="font-mono text-sm text-gray-800">
                {current_tag.metrc_plant_tag.slice(0, -4)}
                <span className="font-bold text-green-800">{current_tag.metrc_plant_tag.slice(-4)}</span>
              </span>
            ) : (
              <>
                <span className="text-xs text-amber-600 italic">No tag assigned</span>
                {(state === 'active' || state === 'empty') && (
                  <button
                    onClick={() => setShowTagInput(v => !v)}
                    className="text-xs bg-green-700 text-white font-semibold px-2.5 py-1 rounded-full hover:bg-green-800 transition-colors"
                  >
                    {showTagInput ? 'Cancel' : 'Assign Tag'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Inline tag assignment — visible when no tag and user taps Assign Tag */}
          {!current_tag && showTagInput && (state === 'active' || state === 'empty') && (
            <InlineTagInput
              containerId={container.container_id}
              assignmentId={undefined}
              onTagged={() => { setShowTagInput(false); load(); }}
            />
          )}

          <button
            onClick={() => navigate(`/batches/${current_batch.batch_id}`)}
            className="mt-3 text-xs text-green-700 font-semibold hover:text-green-900"
          >
            View Batch →
          </button>

          {/* Waste Trim — available whenever container is active */}
          {state === 'active' && (
            <button
              onClick={() => navigate(`/harvest/waste-trim/new?batch_id=${current_batch.batch_id}&container_id=${encodeURIComponent(container.container_id)}`)}
              className="mt-3 flex items-center gap-2 w-full px-4 py-3 bg-amber-50 border-2 border-amber-200 text-amber-900 font-semibold text-sm rounded-2xl hover:border-amber-400 transition-colors"
              style={{ minHeight: '56px' }}
            >
              <span>✂️</span>Record Waste Trim
            </button>
          )}

          {/* Plant Loss — available when container is active */}
          {state === 'active' && (
            <button
              onClick={() => navigate(`/containers/${encodeURIComponent(container.container_id)}/loss?batch_id=${current_batch.batch_id}`)}
              className="mt-2 flex items-center gap-2 w-full px-4 py-3 bg-red-50 border-2 border-red-200 text-red-900 font-semibold text-sm rounded-2xl hover:border-red-400 transition-colors"
              style={{ minHeight: '56px' }}
            >
              <span>🌿</span>Record Plant Loss
            </button>
          )}

          {/* Move Plant — transplant or relocate to a different container */}
          {state === 'active' && (
            <button
              onClick={() => navigate(`/containers/${encodeURIComponent(container.container_id)}/move?batch_id=${current_batch.batch_id}`)}
              className="mt-2 flex items-center gap-2 w-full px-4 py-3 bg-blue-50 border-2 border-blue-200 text-blue-900 font-semibold text-sm rounded-2xl hover:border-blue-400 transition-colors"
              style={{ minHeight: '56px' }}
            >
              <span>🪴</span>Move Plant
            </button>
          )}

          {/* Assign Replacement Plant — available when container is empty within an active batch */}
          {state === 'empty' && (
            <button
              onClick={() => navigate(`/containers/${encodeURIComponent(container.container_id)}/replacement?batch_id=${current_batch.batch_id}`)}
              className="mt-2 flex items-center gap-2 w-full px-4 py-3 bg-green-50 border-2 border-green-200 text-green-900 font-semibold text-sm rounded-2xl hover:border-green-400 transition-colors"
              style={{ minHeight: '56px' }}
            >
              <span>🌱</span>Assign Replacement Plant
            </button>
          )}

          {/* Harvest actions — when batch is harvesting and container is active or empty */}
          {(state === 'active' || state === 'empty') && current_batch.status === 'harvesting' && (() => {
            const activeHB = harvestCtx?.harvest_batches?.find(hb => hb.status === 'in_progress' && hb.batch_type === 'harvest');
            const activeMB = harvestCtx?.harvest_batches?.find(hb => hb.status === 'in_progress' && hb.batch_type === 'manicure');
            const containerAssignments = harvestCtx?.plant_assignments?.filter(
              a => a.container_id === container.container_id && a.unassigned_at === null && !a.has_final_harvest
            ) ?? [];
            const containerAssignment = containerAssignments[0] ?? null;
            if (!harvestCtx) return (
              <div className="mt-3 text-xs text-gray-400">Loading harvest batches…</div>
            );
            return (
              <div className="mt-3 flex flex-col gap-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Harvest Actions</div>
                <div className="flex gap-2">
                  {activeMB && containerAssignment ? (
                    <button
                      onClick={() => navigate(`/harvest/${current_batch.batch_id}/partial?harvest_batch_id=${activeMB.harvest_batch_id}&assignment_id=${containerAssignment.assignment_id}`)}
                      className="flex-1 py-3 bg-purple-50 border-2 border-purple-300 text-purple-800 font-semibold text-sm rounded-2xl hover:bg-purple-100 transition-colors"
                      style={{ minHeight: '56px' }}
                    >
                      Partial Harvest
                    </button>
                  ) : (
                    <div className="flex-1 py-3 text-center text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center"
                      style={{ minHeight: '56px' }}>
                      {!activeMB ? 'No MB active' : 'No active plant'}
                    </div>
                  )}
                  {activeHB && containerAssignment ? (
                    <button
                      onClick={() => {
                        const base = `/harvest/${current_batch.batch_id}/final?harvest_batch_id=${activeHB.harvest_batch_id}&container_id=${encodeURIComponent(container.container_id)}`;
                        navigate(containerAssignments.length === 1
                          ? `${base}&assignment_id=${containerAssignment.assignment_id}`
                          : base);
                      }}
                      className="flex-1 py-3 bg-red-50 border-2 border-red-300 text-red-800 font-semibold text-sm rounded-2xl hover:bg-red-100 transition-colors"
                      style={{ minHeight: '56px' }}
                    >
                      Final Harvest
                    </button>
                  ) : (
                    <div className="flex-1 py-3 text-center text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center"
                      style={{ minHeight: '56px' }}>
                      {!activeHB ? 'No HB active' : 'No active plant'}
                    </div>
                  )}
                </div>
                {!containerAssignment && (
                  <div className="text-xs text-gray-400 text-center">No active unharvested plant in this container</div>
                )}
              </div>
            );
          })()}
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

      {/* Soil Sample History */}
      {(soilSamples.length > 0 || loadingSamples) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Soil Samples</h2>
          {loadingSamples ? (
            <p className="text-sm text-gray-400 italic">Loading…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {soilSamples.map(s => (
                <div key={s.sample_id} className="border border-gray-100 rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-gray-800">{s.sample_label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.results_received ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {s.results_received ? 'Results in' : 'Awaiting results'}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{(s.sample_type ?? '').replace(/_/g, ' ')}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Sampled: {fmtDate(s.sampled_at)}
                    {s.lab_name && ` · ${s.lab_name}`}
                  </div>
                  {s.results && s.results.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.results.map(r => (
                        <span key={r.result_id} className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                          r.interpretation === 'optimal' ? 'bg-green-100 text-green-700' :
                          r.interpretation === 'deficient' || r.interpretation === 'excessive' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {r.parameter}: {r.value}{r.unit ? ` ${r.unit}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.notes && <div className="text-xs text-gray-500 mt-1 italic">{s.notes}</div>}
                </div>
              ))}
            </div>
          )}
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
                  <span className="font-medium text-gray-800">{b.batch_name || b.strain_name}</span>
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
