import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import jsQR from 'jsqr';

const DRAFT_KEY = 'cv_draft_plant_move';
const CONTAINER_RE = /^Z\d-[AB]-R\d{1,2}-C\d{1,2}$/;

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className="bg-green-700 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto">
        ✓ {message}
      </div>
    </div>
  );
}

function ScanOverlay({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && CONTAINER_RE.test(code.data.trim())) {
      onScan(code.data.trim());
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onScan]);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {});
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [tick]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-black">
        <div className="text-white text-sm font-semibold">Scan Destination Container</div>
        <button
          onClick={onClose}
          className="text-white text-sm px-3 py-1.5 rounded-full bg-white/10"
          style={{ minHeight: '40px' }}
        >
          Cancel
        </button>
      </div>
      <div className="relative flex-1 flex items-center justify-center">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 border-4 border-white/60 rounded-2xl" />
        </div>
      </div>
      <div className="px-4 pb-8 pt-4 bg-black text-center text-white/60 text-xs">
        Point the camera at a container QR code
      </div>
    </div>
  );
}

export default function PlantMoveForm() {
  const { containerId } = useParams();
  const navigate = useNavigate();

  const [containerData, setContainerData] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);

  const [toContainerId, setToContainerId] = useState('');
  const [toContainerPreview, setToContainerPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  // Load source container and active assignments
  useEffect(() => {
    setLoadingCtx(true);
    Promise.all([
      api.getContainer(containerId),
      api.getContainerAssignments(containerId),
    ])
      .then(([cd, asgn]) => {
        setContainerData(cd);
        const active = (asgn.assignments ?? []).filter(a => !a.unassigned_at);
        setAssignments(active);
        if (active.length === 1) setSelectedAssignmentId(active[0].assignment_id);
        setLoadingCtx(false);
      })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId]);

  // Draft persistence — restore on mount
  useEffect(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(DRAFT_KEY + '_' + containerId)); }
      catch { return null; }
    })();
    if (saved) {
      if (saved.toContainerId) setToContainerId(saved.toContainerId);
      if (saved.reason) setReason(saved.reason);
      if (saved.notes) setNotes(saved.notes);
    }
  }, [containerId]);

  function scheduleDraftSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      localStorage.setItem(
        DRAFT_KEY + '_' + containerId,
        JSON.stringify({ toContainerId, reason, notes })
      );
    }, 3000);
  }

  function clearDraft() { localStorage.removeItem(DRAFT_KEY + '_' + containerId); }

  // Preview destination container when ID is valid
  useEffect(() => {
    if (!CONTAINER_RE.test(toContainerId)) {
      setToContainerPreview(null);
      setPreviewError('');
      return;
    }
    if (toContainerId === containerId) {
      setToContainerPreview(null);
      setPreviewError('Destination is the same as the source container');
      return;
    }
    setLoadingPreview(true);
    setPreviewError('');
    api.getContainer(toContainerId)
      .then(d => {
        setToContainerPreview(d);
        setLoadingPreview(false);
        const st = d.current_state?.current_state;
        if (st !== 'ready' && st !== 'empty') {
          setPreviewError(`Container is "${st}" — destination must be ready or empty`);
        }
      })
      .catch(e => { setPreviewError(e.message); setLoadingPreview(false); });
  }, [toContainerId, containerId]);

  function handleScan(scannedId) {
    setShowScanner(false);
    setToContainerId(scannedId);
  }

  const canSubmit = !!selectedAssignmentId
    && CONTAINER_RE.test(toContainerId)
    && toContainerId !== containerId
    && reason.trim().length > 0
    && !previewError
    && !loadingPreview;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.moveTagAssignment(selectedAssignmentId, {
        to_container_id: toContainerId,
        reason: reason.trim(),
        notes: notes.trim() || null,
      });
      clearDraft();
      setToast('Plant moved successfully');
      setTimeout(() => navigate(`/containers/${encodeURIComponent(toContainerId)}`), 2200);
    } catch (err) {
      setSaveError(err.message);
      setSaving(false);
    }
  }

  if (loadingCtx) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (ctxError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{ctxError}</div>
      </div>
    );
  }

  const { container, current_state, current_batch } = containerData ?? {};
  const state = current_state?.current_state;

  if (state !== 'active') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
        >
          ← {containerId}
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
          Container must be <strong>active</strong> to move a plant. Current state: {state ?? 'unknown'}
        </div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
        >
          ← {containerId}
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
          No active plant assignments found for this container.
        </div>
      </div>
    );
  }

  const selectedAssignment = assignments.find(a => a.assignment_id === selectedAssignmentId) ?? assignments[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {showScanner && <ScanOverlay onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <button
        onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← {containerId}
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Move Plant
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Transplant or relocate a plant to a different container. The METRC tag and batch association travel with the plant.
      </p>

      {/* Source plant summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Moving From</div>
        <div className="font-mono font-bold text-gray-900 text-base">{container?.container_id}</div>
        {current_batch && (
          <div className="text-sm text-gray-600 mt-1">
            <span className="font-semibold text-green-800">{current_batch.strain_name}</span>
            {selectedAssignment?.metrc_plant_tag && (
              <span className="ml-2 font-mono text-xs text-gray-500">
                Tag …{selectedAssignment.metrc_plant_tag.slice(-4)}
              </span>
            )}
            {!selectedAssignment?.metrc_plant_tag && (
              <span className="ml-2 text-xs text-amber-600 italic">untagged</span>
            )}
          </div>
        )}
      </div>

      {/* Multi-plant picker — only shown when container has more than one active plant */}
      {assignments.length > 1 && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Which plant to move? <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col gap-2">
            {assignments.map(a => (
              <button
                key={a.assignment_id}
                type="button"
                onClick={() => setSelectedAssignmentId(a.assignment_id)}
                className={`text-left px-4 py-3 rounded-xl border-2 text-sm transition-colors ${
                  selectedAssignmentId === a.assignment_id
                    ? 'border-green-500 bg-green-50 text-green-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
                style={{ minHeight: '56px' }}
              >
                {a.metrc_plant_tag
                  ? (
                    <span className="font-mono">
                      <span className="text-gray-400">{a.metrc_plant_tag.slice(0, -4)}</span>
                      <strong>{a.metrc_plant_tag.slice(-4)}</strong>
                    </span>
                  )
                  : <span className="text-amber-600 italic">Untagged plant (ID {a.assignment_id})</span>
                }
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Destination container */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Destination Container <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={toContainerId}
              onChange={e => {
                setToContainerId(e.target.value.trim().toUpperCase());
                scheduleDraftSave();
              }}
              placeholder="Z1-A-R3-C12"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-300"
              style={{ minHeight: '56px' }}
            />
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="px-4 py-3 bg-green-700 text-white rounded-xl font-semibold text-sm hover:bg-green-800 transition-colors whitespace-nowrap"
              style={{ minHeight: '56px' }}
            >
              Scan QR
            </button>
          </div>

          {loadingPreview && (
            <div className="mt-2 text-xs text-gray-400">Checking container…</div>
          )}
          {previewError && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              {previewError}
            </div>
          )}
          {toContainerPreview && !previewError && (
            <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-green-800 font-mono">
                {toContainerPreview.container?.container_id}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                toContainerPreview.current_state?.current_state === 'ready'
                  ? 'bg-green-200 text-green-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {toContainerPreview.current_state?.current_state}
              </span>
              <span className="text-xs text-green-600">
                {toContainerPreview.container?.pot_size_gal}-gal
              </span>
            </div>
          )}
        </div>

        {/* Reason */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Reason for Move <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={e => { setReason(e.target.value); scheduleDraftSave(); }}
            placeholder="e.g. Potting up to 30-gal, relocating sick plant to isolation"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
            style={{ minHeight: '56px' }}
          />
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); scheduleDraftSave(); }}
            rows={3}
            placeholder="Any additional context about this move"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>

        {saveError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="w-full bg-green-700 text-white font-bold rounded-2xl py-4 text-base hover:bg-green-800 disabled:opacity-40 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Moving Plant…' : 'Move Plant →'}
        </button>
      </form>
    </div>
  );
}
