import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { api } from '../../api';

const METRC_TAG_RE = /^[A-Za-z0-9]{24}$/;
const CONTAINER_PATTERN = /^Z\d-[AB]-R\d{1,2}-C\d{1,2}$/;

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

function ReassignModal({ conflict, targetContainerId, targetAssignmentId, onReassigned, onCancel }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleReassign() {
    if (!reason.trim()) { setError('Reason is required'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await api.reassignTag({
        metrc_plant_tag: conflict.metrc_plant_tag,
        from_assignment_id: conflict.existing_assignment.assignment_id,
        to_container_id: targetContainerId,
        to_assignment_id: targetAssignmentId ?? undefined,
        reason: reason.trim(),
      });
      onReassigned(result.to_assignment);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">⚠️</span>
          <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Tag Already Assigned
          </h2>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Current assignment</div>
          <div className="font-mono text-sm text-amber-900 mb-1">
            …{conflict.metrc_plant_tag.slice(-8)}
          </div>
          <div className="text-sm text-amber-800">
            Container:{' '}
            <span className="font-bold font-mono">{conflict.existing_assignment.container_id}</span>
          </div>
          {conflict.existing_assignment.strain_name && (
            <div className="text-xs text-amber-700 mt-0.5">
              Batch: {conflict.existing_assignment.strain_name}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-700 mb-4">
          Moving this tag to{' '}
          <span className="font-bold font-mono">{targetContainerId}</span>{' '}
          will clear it from the current container.
        </p>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Reason for reassignment <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. Tag was scanned at wrong container, correcting mis-scan…"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleReassign}
            disabled={saving || !reason.trim()}
            className="flex-1 bg-amber-600 text-white font-bold py-4 rounded-2xl disabled:opacity-40 hover:bg-amber-700 active:bg-amber-800 transition-colors"
            style={{ minHeight: '56px' }}
          >
            {saving ? 'Reassigning…' : 'Reassign Tag'}
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-4 text-gray-600 font-semibold rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors"
            style={{ minHeight: '56px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PlacementRow({ placement, inputRefs, onAssigned }) {
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | done | conflict | error
  const [assignedTag, setAssignedTag] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isValid = METRC_TAG_RE.test(tagInput);

  async function doAssign(tag) {
    if (status === 'saving' || status === 'done') return;
    setStatus('saving');
    setErrorMsg('');
    const result = await api.assignTagRaw({
      container_id: placement.container_id,
      metrc_plant_tag: tag,
      assignment_id: placement.assignment_id,
    });
    if (result.ok) {
      setAssignedTag(tag);
      setStatus('done');
      setTagInput('');
      onAssigned(placement.assignment_id, tag);
    } else if (result.status === 409) {
      setConflict({
        metrc_plant_tag: tag,
        existing_assignment: result.data.existing_assignment,
        message: result.data.message,
      });
      setStatus('conflict');
    } else {
      setErrorMsg(result.data?.error || 'Assignment failed');
      setStatus('error');
    }
  }

  async function handleInputChange(e) {
    const val = e.target.value.replace(/\s/g, '').toUpperCase();
    setTagInput(val);
    if (METRC_TAG_RE.test(val)) {
      await doAssign(val);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && isValid) doAssign(tagInput);
  }

  function handleReassigned(toAssignment) {
    setAssignedTag(toAssignment.metrc_plant_tag);
    setStatus('done');
    setConflict(null);
    setTagInput('');
    onAssigned(placement.assignment_id, toAssignment.metrc_plant_tag);
  }

  return (
    <>
      {conflict && (
        <ReassignModal
          conflict={conflict}
          targetContainerId={placement.container_id}
          targetAssignmentId={placement.assignment_id}
          onReassigned={handleReassigned}
          onCancel={() => { setConflict(null); setStatus('idle'); setTagInput(''); }}
        />
      )}

      <div className={`border rounded-2xl p-4 mb-2 transition-colors ${
        status === 'done' ? 'bg-green-50 border-green-300' :
        status === 'conflict' || status === 'error' ? 'bg-red-50 border-red-200' :
        'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-sm font-bold text-gray-800 flex-1 min-w-0 truncate">
            {placement.container_id}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">Pos {placement.position}</span>
          {status === 'done' && (
            <span className="text-green-600 text-lg flex-shrink-0" aria-label="Tagged">✓</span>
          )}
        </div>

        {status === 'done' ? (
          <div className="text-sm text-green-800 font-mono">
            {assignedTag.slice(0, -4)}
            <span className="font-bold text-green-900">{assignedTag.slice(-4)}</span>
            <span className="text-xs text-green-600 font-sans ml-2">Tagged</span>
          </div>
        ) : (
          <>
            <input
              ref={el => { if (inputRefs) inputRefs.current[placement.assignment_id] = el; }}
              type="text"
              value={tagInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              maxLength={24}
              disabled={status === 'saving'}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="Scan or type 24-character METRC tag"
              className={`w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 transition-colors ${
                tagInput.length > 0 && tagInput.length < 24 ? 'border-amber-300 focus:ring-amber-300' :
                isValid ? 'border-green-400 focus:ring-green-300' :
                'border-gray-200 focus:ring-green-300'
              }`}
              style={{ minHeight: '52px' }}
            />
            <div className="flex items-center justify-between mt-1">
              {tagInput.length > 0 && !isValid ? (
                <span className="text-xs text-amber-600">
                  {tagInput.length}/24 — {24 - tagInput.length} more
                </span>
              ) : (
                <span />
              )}
              {status === 'saving' && (
                <span className="text-xs text-gray-400">Saving…</span>
              )}
              {errorMsg && (
                <span className="text-xs text-red-600">{errorMsg}</span>
              )}
              {status === 'conflict' && !conflict && (
                <button
                  onClick={() => setStatus('idle')}
                  className="text-xs text-amber-600 underline"
                >
                  Retry
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Bulk Scan Overlay ────────────────────────────────────────────────────────

function BulkScanOverlay({ rows, completedIds, onAssigned, onExit }) {
  const allPlacements = rows.flatMap(r => r.placements);
  const remainingPlacements = allPlacements.filter(p => !completedIds.has(p.assignment_id));
  const totalCount = allPlacements.length;
  const taggedCount = completedIds.size;

  const [step, setStep] = useState('scan-container'); // 'scan-container' | 'enter-tag' | 'success'
  const [foundPlacement, setFoundPlacement] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [scanError, setScanError] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualVal, setManualVal] = useState('');
  const [manualErr, setManualErr] = useState('');

  const [camStatus, setCamStatus] = useState('starting');
  const [camError, setCamError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const torchTrackRef = useRef(null);
  const tagInputRef = useRef(null);

  // Keep refs fresh for use inside stable tick callback
  const rowsRef = useRef(rows);
  const completedIdsRef = useRef(completedIds);
  useEffect(() => { rowsRef.current = rows; });
  useEffect(() => { completedIdsRef.current = completedIds; });

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function resumeScanning() {
    setScanError('');
    setShowManual(false);
    setManualVal('');
    if (streamRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  // Stable tick — uses only refs and setters, no stale closures
  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (!code) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    // QR detected — stop loop and process
    cancelAnimationFrame(rafRef.current);
    const val = code.data.trim();

    if (!CONTAINER_PATTERN.test(val)) {
      setScanError(`"${val}" — not a valid container ID`);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const allP = rowsRef.current.flatMap(r => r.placements);
    const remaining = allP.filter(p => !completedIdsRef.current.has(p.assignment_id));
    const placement = remaining.find(p => p.container_id === val);

    if (!placement) {
      const alreadyDone = allP.find(p => p.container_id === val && completedIdsRef.current.has(p.assignment_id));
      setScanError(alreadyDone
        ? `${val} — already tagged this session`
        : `${val} — no untagged placement found for this batch`);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    setScanError('');
    setFoundPlacement(placement);
    setTagInput('');
    setStep('enter-tag');
    setTimeout(() => tagInputRef.current?.focus(), 150);
  }, []); // no deps — all through refs

  // Start camera on mount
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const track = stream.getVideoTracks()[0];
        torchTrackRef.current = track;
        const caps = track.getCapabilities?.();
        if (caps?.torch) setTorchSupported(true);
        setCamStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCamStatus('denied');
        } else {
          setCamStatus('error');
          setCamError(err.message || 'Camera unavailable');
        }
      }
    }
    startCamera();
    return () => stopCamera();
  }, [tick]);

  async function toggleTorch() {
    if (!torchTrackRef.current) return;
    const next = !torchOn;
    try {
      await torchTrackRef.current.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {}
  }

  async function handleTagChange(e) {
    const val = e.target.value.replace(/\s/g, '').toUpperCase();
    setTagInput(val);
    if (METRC_TAG_RE.test(val)) {
      await doAssign(val);
    }
  }

  async function doAssign(tag) {
    if (saving || !foundPlacement) return;
    setSaving(true);
    const result = await api.assignTagRaw({
      container_id: foundPlacement.container_id,
      metrc_plant_tag: tag,
      assignment_id: foundPlacement.assignment_id,
    });
    if (result.ok) {
      onAssigned(foundPlacement.assignment_id, tag);
      setSaving(false);
      setTagInput('');
      setStep('success');
      setTimeout(() => {
        setStep('scan-container');
        setFoundPlacement(null);
        setScanError('');
        if (streamRef.current) rafRef.current = requestAnimationFrame(tick);
      }, 700);
    } else if (result.status === 409) {
      setConflict({
        metrc_plant_tag: tag,
        existing_assignment: result.data.existing_assignment,
        message: result.data.message,
      });
      setSaving(false);
    } else {
      setSaving(false);
      // Show error inline and allow retry
      setTagInput('');
      setTimeout(() => tagInputRef.current?.focus(), 50);
    }
  }

  function handleReassigned(toAssignment) {
    onAssigned(foundPlacement.assignment_id, toAssignment.metrc_plant_tag);
    setConflict(null);
    setTagInput('');
    setStep('success');
    setTimeout(() => {
      setStep('scan-container');
      setFoundPlacement(null);
      setScanError('');
      if (streamRef.current) rafRef.current = requestAnimationFrame(tick);
    }, 700);
  }

  function returnToScan() {
    setStep('scan-container');
    setFoundPlacement(null);
    setTagInput('');
    setScanError('');
    if (streamRef.current) rafRef.current = requestAnimationFrame(tick);
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    const val = manualVal.trim().toUpperCase();
    if (!CONTAINER_PATTERN.test(val)) {
      setManualErr(`"${val}" is not a valid container ID`);
      return;
    }
    // Process through the same lookup logic as a QR scan
    const allP = rowsRef.current.flatMap(r => r.placements);
    const remaining = allP.filter(p => !completedIdsRef.current.has(p.assignment_id));
    const placement = remaining.find(p => p.container_id === val);
    if (!placement) {
      const alreadyDone = allP.find(p => p.container_id === val && completedIdsRef.current.has(p.assignment_id));
      setManualErr(alreadyDone
        ? `${val} — already tagged this session`
        : `${val} — no untagged placement found for this batch`);
      return;
    }
    setShowManual(false);
    setManualVal('');
    setManualErr('');
    setScanError('');
    setFoundPlacement(placement);
    setTagInput('');
    setStep('enter-tag');
    setTimeout(() => tagInputRef.current?.focus(), 150);
  }

  const allDone = remainingPlacements.length === 0 && totalCount > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Camera video — always rendered to keep stream alive, hidden when not scanning */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
          step === 'scan-container' && camStatus === 'scanning' ? 'opacity-100' : 'opacity-0'
        }`}
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-20">
        <button
          onClick={() => { stopCamera(); onExit(); }}
          className="px-4 py-2 rounded-xl bg-black/60 text-white text-sm font-semibold"
          style={{ minHeight: '44px' }}
        >
          ✕ Exit Scan Mode
        </button>
        <span className="text-white font-semibold text-sm drop-shadow">
          {taggedCount} / {totalCount} tagged
        </span>
        {torchSupported && step === 'scan-container' ? (
          <button
            onClick={toggleTorch}
            className="w-11 h-11 rounded-full bg-black/60 flex items-center justify-center text-xl"
            aria-label={torchOn ? 'Turn flash off' : 'Turn flash on'}
          >
            {torchOn ? '⚡' : '🔦'}
          </button>
        ) : (
          <div className="w-11 h-11" />
        )}
      </div>

      {/* Progress bar */}
      <div className="absolute top-[68px] left-4 right-4 z-20">
        <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 bg-green-400 rounded-full transition-all duration-500"
            style={{ width: `${totalCount > 0 ? (taggedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* ── Step: scan-container ──────────────────────────────────────── */}
      {step === 'scan-container' && (
        <>
          {/* Targeting reticle */}
          {camStatus === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-72">
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-sm" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white/50 text-sm text-center px-4">
                    {allDone ? 'All containers tagged!' : 'Scan container QR'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {camStatus === 'starting' && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white text-lg">Starting camera…</p>
            </div>
          )}

          {camStatus === 'denied' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center pt-20">
              <div className="text-5xl">📷</div>
              <p className="text-white font-semibold">Camera access required for Scan Mode</p>
              <p className="text-gray-300 text-sm">Allow camera access or use manual entry below</p>
            </div>
          )}

          {camStatus === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center pt-20">
              <div className="text-5xl">⚠️</div>
              <p className="text-red-300 text-sm">{camError || 'Camera unavailable'}</p>
            </div>
          )}

          {/* All done overlay */}
          {allDone && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
              <div className="text-7xl">🎉</div>
              <div className="text-white text-2xl font-bold" style={{ fontFamily: 'Fraunces, serif' }}>
                All containers tagged!
              </div>
              <button
                onClick={() => { stopCamera(); onExit(); }}
                className="mt-2 px-8 py-4 bg-green-700 text-white rounded-2xl font-bold text-base"
                style={{ minHeight: '56px' }}
              >
                Done
              </button>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 flex flex-col items-center gap-3 z-20">
            {scanError && (
              <div className="w-full max-w-sm bg-red-900/80 text-red-100 text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                <span className="flex-1">{scanError}</span>
                <button
                  onClick={() => setScanError('')}
                  className="text-xs underline flex-shrink-0 text-red-200"
                >
                  Dismiss
                </button>
              </div>
            )}

            {!showManual ? (
              <button
                onClick={() => setShowManual(true)}
                className="text-white/50 text-xs underline"
              >
                Enter container ID manually
              </button>
            ) : (
              <form
                onSubmit={handleManualSubmit}
                className="w-full max-w-sm bg-black/80 rounded-2xl p-4 flex flex-col gap-3"
              >
                <label className="text-white text-sm font-semibold">Container ID</label>
                <input
                  type="text"
                  value={manualVal}
                  onChange={e => { setManualVal(e.target.value); setManualErr(''); }}
                  placeholder="Z1-A-R3-C12"
                  className="w-full px-4 py-3 rounded-xl bg-white text-gray-900 text-base font-mono uppercase"
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {manualErr && <p className="text-red-400 text-xs">{manualErr}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowManual(false); setManualVal(''); setManualErr(''); }}
                    className="flex-1 py-3 rounded-xl bg-gray-600 text-white font-semibold"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 py-3 rounded-xl bg-green-700 text-white font-semibold">
                    Go
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}

      {/* ── Step: enter-tag ──────────────────────────────────────────── */}
      {step === 'enter-tag' && foundPlacement && (
        <>
          {conflict && (
            <ReassignModal
              conflict={conflict}
              targetContainerId={foundPlacement.container_id}
              targetAssignmentId={foundPlacement.assignment_id}
              onReassigned={handleReassigned}
              onCancel={() => {
                setConflict(null);
                setTagInput('');
                setTimeout(() => tagInputRef.current?.focus(), 50);
              }}
            />
          )}

          <div className="absolute inset-0 flex flex-col justify-center px-6 pt-20 pb-8 gap-6 z-10">
            <div className="text-center">
              <div className="text-white/50 text-xs uppercase tracking-widest mb-3">
                Step 2 — Scan METRC tag for
              </div>
              <div
                className="text-4xl font-bold font-mono text-white tracking-wider mb-2"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {foundPlacement.container_id}
              </div>
              <div className="text-green-400 text-sm font-medium">Ready for tag assignment</div>
            </div>

            <div className="max-w-sm mx-auto w-full">
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={handleTagChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && METRC_TAG_RE.test(tagInput)) doAssign(tagInput);
                }}
                maxLength={24}
                disabled={saving}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="Scan or type METRC tag"
                className={`w-full border-2 rounded-2xl px-5 py-5 text-base font-mono text-center text-white placeholder:text-white/30 bg-white/10 backdrop-blur focus:outline-none transition-colors ${
                  METRC_TAG_RE.test(tagInput) ? 'border-green-400 bg-green-900/20' :
                  tagInput.length > 0 ? 'border-amber-400' :
                  'border-white/30 focus:border-white/60'
                }`}
                style={{ minHeight: '64px' }}
              />
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-white/40 text-xs">
                  {tagInput.length > 0 && tagInput.length < 24
                    ? `${tagInput.length}/24 — ${24 - tagInput.length} more`
                    : ''}
                </span>
                {saving && <span className="text-white/50 text-xs">Saving…</span>}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={returnToScan}
                className="text-white/50 text-sm underline"
              >
                ← Scan a different container
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Success flash ─────────────────────────────────────────────── */}
      {step === 'success' && (
        <div className="absolute inset-0 z-20 bg-green-700 flex flex-col items-center justify-center gap-4">
          <div className="text-8xl">✓</div>
          <div className="text-white text-2xl font-bold" style={{ fontFamily: 'Fraunces, serif' }}>
            Tagged!
          </div>
          {foundPlacement && (
            <div
              className="text-green-200 text-xl font-mono"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {foundPlacement.container_id}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TagAssignmentWalkthrough() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const batchIdParam = searchParams.get('batch_id') ?? '';

  const [rows, setRows] = useState([]);
  const [totalUntagged, setTotalUntagged] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(batchIdParam);

  const [completedCount, setCompletedCount] = useState(0);
  const [completedIds, setCompletedIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [scanMode, setScanMode] = useState(false);

  const inputRefs = useRef({});

  function load(batchId) {
    setLoading(true);
    setLoadError('');
    setCompletedCount(0);
    setCompletedIds(new Set());
    const params = {};
    if (batchId) params.batch_id = batchId;
    api.getUntaggedAssignments(params)
      .then(d => {
        setRows(d.rows ?? []);
        setTotalUntagged(d.total_untagged ?? 0);
        setLoading(false);
      })
      .catch(e => { setLoadError(e.message); setLoading(false); });
  }

  useEffect(() => { load(selectedBatchId || undefined); }, [selectedBatchId]);

  useEffect(() => {
    api.getBatches()
      .then(d => setBatches((d ?? []).filter(b => b.status !== 'closed')))
      .catch(() => {});
  }, []);

  function handleAssigned(assignmentId, tag) {
    setCompletedIds(ids => { const s = new Set(ids); s.add(assignmentId); return s; });
    setCompletedCount(c => c + 1);
    // Auto-advance: focus the next input that isn't done
    const allIds = rows.flatMap(r => r.placements.map(p => p.assignment_id));
    const idx = allIds.indexOf(assignmentId);
    for (let i = idx + 1; i < allIds.length; i++) {
      const el = inputRefs.current[allIds[i]];
      if (el && !el.disabled) { el.focus(); break; }
    }
  }

  function exitScanMode() {
    setScanMode(false);
    load(selectedBatchId || undefined); // reload so list reflects what was tagged
  }

  const totalPlacements = rows.reduce((sum, r) => sum + r.placements.length, 0);
  const allDone = totalPlacements > 0 && completedCount === totalPlacements;

  if (scanMode) {
    return (
      <BulkScanOverlay
        rows={rows}
        completedIds={completedIds}
        onAssigned={handleAssigned}
        onExit={exitScanMode}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <button
        onClick={() => navigate(-1)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← Back
      </button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          METRC Tag Assignment
        </h1>
        {!loading && totalPlacements > 0 && (
          <button
            onClick={() => setScanMode(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-800 text-white font-semibold text-sm rounded-xl hover:bg-green-900 transition-colors"
            style={{ minHeight: '44px' }}
          >
            <span>📷</span>
            <span>Scan Mode</span>
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Tags auto-submit when 24 characters are entered. Conflicts show a Reassign option.
      </p>

      {/* Batch selector */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Batch</label>
        <select
          value={selectedBatchId}
          onChange={e => setSelectedBatchId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300"
          style={{ minHeight: '52px' }}
        >
          <option value="">All batches</option>
          {batches.map(b => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.strain_name} — {b.sub_zone_id ?? '(no sub-zone)'} ({b.status?.replace(/-/g, ' ')})
            </option>
          ))}
        </select>
      </div>

      {/* Progress */}
      {!loading && totalPlacements > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Progress</span>
            <span className={`text-sm font-bold font-mono ${allDone ? 'text-green-700' : 'text-gray-800'}`}>
              {completedCount} / {totalPlacements} tagged
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-green-600'}`}
              style={{ width: `${(completedCount / totalPlacements) * 100}%` }}
            />
          </div>
          {allDone && (
            <div className="text-sm text-green-700 font-semibold mt-2 text-center">
              All placements tagged!
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="text-gray-500 text-sm py-4">Loading untagged placements…</div>
      )}

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {loadError}
          <button
            onClick={() => load(selectedBatchId || undefined)}
            className="ml-2 underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && totalPlacements === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-6 text-center">
          <div className="text-3xl mb-2">✓</div>
          <div className="text-sm font-semibold text-green-800">
            {selectedBatchId ? 'All placements in this batch are tagged.' : 'No untagged placements found.'}
          </div>
        </div>
      )}

      {/* Row groups */}
      {rows.map(row => (
        <div key={row.row_id} className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-xs font-bold bg-green-800 text-white px-3 py-1.5 rounded-full">
              {row.row_id}
            </span>
            <span className="text-xs text-gray-500">{row.placements.length} untagged</span>
          </div>
          {row.placements.map(p => (
            <PlacementRow
              key={p.assignment_id}
              placement={p}
              inputRefs={inputRefs}
              onAssigned={handleAssigned}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
