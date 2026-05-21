import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { X, Zap, ZapOff, Keyboard } from 'lucide-react';

const CONTAINER_PATTERN = /^Z\d-[AB]-R\d{1,2}-C\d{1,2}$/;

export default function ContainerScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const torchTrackRef = useRef(null);

  const [status, setStatus] = useState('starting'); // starting | scanning | error | denied
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualError, setManualError] = useState('');

  const stopStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    torchTrackRef.current = null;
  }, []);

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
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    if (code) {
      const val = code.data.trim();
      if (CONTAINER_PATTERN.test(val)) {
        stopStream();
        navigate(`/containers/${encodeURIComponent(val)}`);
        return;
      } else {
        setErrorMsg(`Unrecognized QR code: ${val}. This does not match a container ID.`);
        setStatus('error');
        stopStream();
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [navigate, stopStream]);

  useEffect(() => {
    async function startCamera() {
      try {
        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // Check torch support
        const track = stream.getVideoTracks()[0];
        torchTrackRef.current = track;
        const caps = track.getCapabilities?.();
        if (caps?.torch) setTorchSupported(true);
        setStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setStatus('denied');
        } else {
          setStatus('error');
          setErrorMsg(err.message || 'Camera unavailable');
        }
      }
    }
    startCamera();
    return () => stopStream();
  }, [tick, stopStream]);

  async function toggleTorch() {
    if (!torchTrackRef.current) return;
    const next = !torchOn;
    try {
      await torchTrackRef.current.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // torch not available on this device
    }
  }

  function retryCamera() {
    setStatus('starting');
    setErrorMsg('');
    setTorchOn(false);
    // Re-mount the effect by forcing a re-render via a key change would be ideal,
    // but instead we call startCamera logic inline
    async function restart() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
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
        setStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setStatus('denied');
        } else {
          setStatus('error');
          setErrorMsg(err.message || 'Camera unavailable');
        }
      }
    }
    restart();
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    const val = manualId.trim().toUpperCase();
    if (!CONTAINER_PATTERN.test(val)) {
      setManualError(`"${val}" is not a valid container ID. Expected format: Z1-A-R3-C12`);
      return;
    }
    navigate(`/containers/${encodeURIComponent(val)}`);
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <button
          onClick={() => { stopStream(); navigate(-1); }}
          className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center text-white"
          aria-label="Close scanner"
        >
          <X size={24} />
        </button>
        <span className="text-white font-semibold text-base drop-shadow">Scan Container QR</span>
        {torchSupported ? (
          <button
            onClick={toggleTorch}
            className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center text-white"
            aria-label={torchOn ? 'Turn flash off' : 'Turn flash on'}
          >
            {torchOn ? <Zap size={24} className="text-yellow-300" /> : <ZapOff size={24} />}
          </button>
        ) : (
          <div className="w-12 h-12" />
        )}
      </div>

      {/* Video viewfinder */}
      {status === 'scanning' && (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />
          {/* Targeting reticle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-green-400 rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-green-400 rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-green-400 rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-green-400 rounded-br-sm" />
            </div>
          </div>
        </>
      )}

      {/* Starting state */}
      {status === 'starting' && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white text-lg">Starting camera…</p>
        </div>
      )}

      {/* Camera denied */}
      {status === 'denied' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
          <div className="text-6xl">📷</div>
          <h2 className="text-white text-xl font-bold">Camera Access Required</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Camera permission was denied. To enable it:
          </p>
          <ol className="text-gray-300 text-sm text-left leading-loose list-decimal list-inside">
            <li>Open your browser Settings</li>
            <li>Find Site Permissions → Camera</li>
            <li>Allow camera access for this site</li>
            <li>Reload the page</li>
          </ol>
          <button
            onClick={() => setShowManual(true)}
            className="mt-2 px-6 py-3 bg-green-700 text-white rounded-xl font-semibold"
          >
            Enter Container ID Manually
          </button>
        </div>
      )}

      {/* Error state — unrecognized QR or camera error */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
          <div className="text-6xl">⚠️</div>
          <h2 className="text-white text-xl font-bold">Scan Failed</h2>
          <p className="text-red-300 text-sm leading-relaxed break-all">{errorMsg}</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={retryCamera}
              className="px-6 py-3 bg-green-700 text-white rounded-xl font-semibold"
            >
              Try Again
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="px-6 py-3 bg-gray-700 text-white rounded-xl font-semibold"
            >
              Enter Container ID Manually
            </button>
          </div>
        </div>
      )}

      {/* Bottom status bar / manual entry */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 flex flex-col items-center gap-3 z-10">
        {status === 'scanning' && !showManual && (
          <>
            <p className="text-white/80 text-sm drop-shadow">Scanning…</p>
            <button
              onClick={() => setShowManual(true)}
              className="flex items-center gap-2 text-white/70 text-xs underline"
            >
              <Keyboard size={14} />
              Enter container ID manually
            </button>
          </>
        )}

        {showManual && (
          <form onSubmit={handleManualSubmit} className="w-full max-w-sm bg-black/70 rounded-2xl p-4 flex flex-col gap-3">
            <label className="text-white text-sm font-semibold">Enter Container ID</label>
            <input
              type="text"
              value={manualId}
              onChange={e => { setManualId(e.target.value); setManualError(''); }}
              placeholder="Z1-A-R3-C12"
              className="w-full px-4 py-3 rounded-xl bg-white text-gray-900 text-base font-mono uppercase"
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            {manualError && <p className="text-red-400 text-xs">{manualError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowManual(false); setManualId(''); setManualError(''); }}
                className="flex-1 py-3 rounded-xl bg-gray-600 text-white font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-green-700 text-white font-semibold"
              >
                Go
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
