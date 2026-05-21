import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className="bg-green-700 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2">
        ✓ {message}
      </div>
    </div>
  );
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

export default function StartupReadyForm() {
  const { containerId, startupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [containerData, setContainerData] = useState(null);
  const [startupEvent, setStartupEvent] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  useEffect(() => {
    api.getContainer(containerId)
      .then(d => {
        setContainerData(d);
        const evt = d.startup_events?.find(s => String(s.startup_id) === String(startupId));
        setStartupEvent(evt ?? d.startup_events?.[0] ?? null);
        setLoadingCtx(false);
      })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId, startupId]);

  async function handleSignOff() {
    setSaving(true);
    setSaveError('');
    try {
      await api.signOffReady(containerId, startupId, { notes: notes.trim() || null });
      setToast('Container is ready for the next batch.');
      setTimeout(() => navigate(`/containers/${encodeURIComponent(containerId)}`), 1800);
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);
  }

  if (loadingCtx) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (ctxError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{ctxError}</div>
      </div>
    );
  }

  const { current_state } = containerData ?? {};
  const currentState = current_state?.current_state;

  if (currentState !== 'startup') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
          ← {containerId}
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          Container must be in 'startup' state to sign off. Currently: <strong>{currentState}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <button
        onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← {containerId}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Mark Container Ready
      </h1>
      <div className="text-sm text-gray-500 mb-5">
        <span className="font-mono text-xs">{containerId}</span> · Supervisor sign-off required
      </div>

      {/* Startup summary */}
      {startupEvent && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">Startup Summary</h2>
          <div className="flex flex-col gap-2 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Started</span>
              <span className="font-mono text-xs">{fmtDate(startupEvent.started_at)}</span>
            </div>
            {startupEvent.media_replaced_pct != null && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Media replaced</span>
                <span className="font-semibold">{startupEvent.media_replaced_pct}%
                  {startupEvent.media_brand ? ` · ${startupEvent.media_brand}` : ''}
                </span>
              </div>
            )}
            {startupEvent.amendments_applied_count > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Amendments applied</span>
                <span className="font-semibold">{startupEvent.amendments_applied_count}</span>
              </div>
            )}
            {startupEvent.performed_by_name && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Performed by</span>
                <span>{startupEvent.performed_by_name}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Supervisor check */}
      {!isSupervisor && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-4 mb-5">
          <div className="text-sm font-semibold text-amber-800 mb-1">Supervisor or Admin required</div>
          <div className="text-xs text-amber-700">
            Only supervisors and admins can sign off that a container is ready for planting.
          </div>
        </div>
      )}

      {/* Confirmation prompt */}
      {isSupervisor && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-5 text-sm text-green-800">
          Sign-off confirms that media has been replaced, amendments are applied, and this container
          is suitable for receiving a new plant batch.
        </div>
      )}

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Any final notes before marking ready…"
          disabled={!isSupervisor}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-50 disabled:bg-gray-50"
        />
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {saveError}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-10">
        <button
          onClick={handleSignOff}
          disabled={!isSupervisor || saving}
          className="w-full bg-green-700 text-white font-bold text-base py-4 rounded-2xl disabled:opacity-40 hover:bg-green-800 active:bg-green-900 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Signing off…' : 'Mark as Ready for Planting'}
        </button>
      </div>
    </div>
  );
}
