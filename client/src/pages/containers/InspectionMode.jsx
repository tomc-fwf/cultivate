import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';

// Parse "Z1-A-R3" → { subZoneId: "Z1A", rowNumber: 3 } or null
function parseRowId(rowId) {
  const m = rowId?.match(/^Z(\d+)-([A-Z])-R(\d+)$/i);
  if (!m) return null;
  return { subZoneId: `Z${m[1]}${m[2].toUpperCase()}`, rowNumber: parseInt(m[3], 10) };
}

function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

function timeAgo(ts) {
  if (!ts) return '—';
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATE_CHIP = {
  active:          'bg-green-100 text-green-800 border-green-200',
  empty:           'bg-yellow-100 text-yellow-800 border-yellow-200',
  teardown:        'bg-orange-100 text-orange-800 border-orange-200',
  startup:         'bg-blue-100 text-blue-800 border-blue-200',
  ready:           'bg-green-50 text-green-700 border-green-100',
  out_of_service:  'bg-gray-100 text-gray-600 border-gray-200',
};

const STATE_LABEL = {
  active: 'Active', empty: 'Empty', teardown: 'Teardown',
  startup: 'Startup', ready: 'Ready', out_of_service: 'Out of Service',
};

const BATCH_STATUS_LABEL = {
  'germ':           'Germination',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Field — Veg',
  'field-flower':   'Field — Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
  'closed':         'Closed',
};

const OBS_CHIP = {
  healthy:           'bg-green-100 text-green-700',
  pest:              'bg-red-100 text-red-700',
  deficiency:        'bg-yellow-100 text-yellow-700',
  disease:           'bg-purple-100 text-purple-700',
  damage:            'bg-orange-100 text-orange-700',
  harvest_readiness: 'bg-teal-100 text-teal-700',
  other:             'bg-gray-100 text-gray-700',
};

export default function InspectionMode() {
  const { rowId } = useParams();
  const navigate = useNavigate();

  const parsed = parseRowId(rowId);

  const [containers, setContainers] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Current container's recent observations
  const [currentObs, setCurrentObs] = useState(null); // null=loading, []=empty
  const [obsKey, setObsKey] = useState(0); // increment to force reload

  // Harvest readiness form
  const [maturityPct, setMaturityPct] = useState(50);
  const [readyToHarvest, setReadyToHarvest] = useState(false);
  const [harvestPriority, setHarvestPriority] = useState(null);
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [readinessSaved, setReadinessSaved] = useState(false);
  const [readinessError, setReadinessError] = useState('');

  // Touch swipe tracking
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isHSwipe = useRef(false);

  // ── Load containers for this row ────────────────────────────────────────
  useEffect(() => {
    if (!parsed) {
      setError('Invalid row ID format. Expected: Z1-A-R3');
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getContainers({ sub_zone_id: parsed.subZoneId })
      .then(data => {
        const rows = (data.containers ?? [])
          .filter(c => c.row_number === parsed.rowNumber)
          .sort((a, b) => a.position - b.position);
        if (rows.length === 0) {
          setError(`No containers found in row ${rowId}`);
          setLoading(false);
          return;
        }
        setContainers(rows);
        setIdx(0);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [rowId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load observations for current container ──────────────────────────────
  useEffect(() => {
    if (!containers.length || !containers[idx]) return;
    const cid = containers[idx].container_id;
    setCurrentObs(null);
    let cancelled = false;
    api.getObservations({ container_id: cid, date: '30d', limit: '2' })
      .then(obs => {
        if (!cancelled) setCurrentObs(Array.isArray(obs) ? obs.slice(0, 2) : []);
      })
      .catch(() => { if (!cancelled) setCurrentObs([]); });
    return () => { cancelled = true; };
  }, [idx, containers, obsKey]);

  // ── Reset readiness form when container changes ──────────────────────────
  useEffect(() => {
    if (!containers[idx]) return;
    const cid = containers[idx].container_id;
    const draft = (() => {
      try { return JSON.parse(localStorage.getItem(`cv_draft_readiness_${cid}`)); } catch { return null; }
    })();
    setMaturityPct(draft?.maturity_pct ?? 50);
    setReadyToHarvest(draft?.ready_to_harvest ?? false);
    setHarvestPriority(draft?.harvest_priority ?? null);
    setReadinessSaved(false);
    setReadinessError('');
  }, [idx, containers]);

  // ── Persist readiness draft on change ────────────────────────────────────
  useEffect(() => {
    const container = containers[idx];
    if (!container || container.batch_status !== 'harvest_window') return;
    localStorage.setItem(
      `cv_draft_readiness_${container.container_id}`,
      JSON.stringify({ maturity_pct: maturityPct, ready_to_harvest: readyToHarvest, harvest_priority: harvestPriority })
    );
  }, [maturityPct, readyToHarvest, harvestPriority, idx, containers]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const len = containers.length;
    function onKey(e) {
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, len - 1));
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [containers.length]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  function goNext() { setIdx(i => Math.min(i + 1, containers.length - 1)); }
  function goPrev() { setIdx(i => Math.max(i - 1, 0)); }

  // ── Touch swipe handlers ─────────────────────────────────────────────────
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHSwipe.current = false;
  }

  function handleTouchMove(e) {
    if (touchStartX.current === null) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dx > dy + 10) isHSwipe.current = true;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (!isHSwipe.current) return;
    isHSwipe.current = false;
    if (dx < -60) goNext();
    else if (dx > 60) goPrev();
  }

  // ── Save harvest readiness observation ───────────────────────────────────
  async function saveReadiness() {
    const container = containers[idx];
    if (!container?.current_batch_id) {
      setReadinessError('No active batch for this container');
      return;
    }
    setSavingReadiness(true);
    setReadinessError('');
    try {
      await api.createObservation({
        batch_id: container.current_batch_id,
        container_id: container.container_id,
        category: 'harvest_readiness',
        severity: 'low',
        maturity_pct: maturityPct,
        ready_to_harvest: readyToHarvest ? 1 : 0,
        harvest_priority: harvestPriority,
        note: `Readiness: ${maturityPct}% maturity${readyToHarvest ? ' — READY' : ' — not ready'}${harvestPriority != null ? ` — priority ${harvestPriority}` : ''}`,
      });
      setReadinessSaved(true);
      localStorage.removeItem(`cv_draft_readiness_${container.container_id}`);
      setObsKey(k => k + 1); // Reload observations to show new entry
    } catch (e) {
      setReadinessError(e.message);
    }
    setSavingReadiness(false);
  }

  // ── Error / loading states ───────────────────────────────────────────────

  if (!parsed) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-xl font-bold text-gray-800 mb-2">Invalid Row ID</div>
          <div className="text-sm text-gray-500 mb-4">Expected format: Z1-A-R3</div>
          <button onClick={() => navigate(-1)} className="text-green-700 font-semibold">← Back</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading containers…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
          <button onClick={() => navigate(-1)} className="text-green-700 font-semibold">← Back</button>
        </div>
      </div>
    );
  }

  const container = containers[idx];
  const hasRei = Boolean(container?.rei_active_until && new Date(container.rei_active_until) > new Date());
  const isHarvestWindow = container?.batch_status === 'harvest_window';
  const encodedId = encodeURIComponent(container?.container_id ?? '');
  const containerId = container?.container_id ?? '';
  const returnPath = encodeURIComponent(`/inspect/${rowId}`);
  const batchId = container?.current_batch_id ?? '';

  return (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm font-bold text-gray-800">{rowId}</span>
          <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
            {idx + 1} / {containers.length}
          </span>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-semibold text-green-700 hover:text-green-900 px-3 py-2 rounded-lg hover:bg-green-50 transition-colors flex-shrink-0"
          style={{ minHeight: '44px' }}
        >
          Exit
        </button>
      </div>

      {/* ── Scrollable main content ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* REI warning banner */}
        {hasRei && (
          <div className="bg-red-600 text-white rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl flex-shrink-0 mt-0.5">⚠️</span>
            <div>
              <div className="font-bold text-sm">REI Active — Restricted Entry</div>
              <div className="text-xs opacity-90 mt-0.5">
                Re-entry restricted until{' '}
                {new Date(container.rei_active_until).toLocaleString([], {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Main container card ───────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">

          {/* Header row: position + full detail link */}
          <div className="flex items-start justify-between mb-3">
            <div className="font-mono text-2xl font-bold text-gray-900">{container?.container_id}</div>
            <Link
              to={`/containers/${encodedId}`}
              className="text-xs text-green-700 font-semibold hover:text-green-900 flex-shrink-0 mt-1.5 px-2.5 py-1 bg-green-50 rounded-lg"
              style={{ textDecoration: 'none' }}
            >
              Full Detail
            </Link>
          </div>

          {/* State chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATE_CHIP[container?.current_state] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {STATE_LABEL[container?.current_state] ?? container?.current_state}
            </span>
            {hasRei && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                REI Active
              </span>
            )}
            {container?.has_open_observation ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                Open Obs
              </span>
            ) : null}
          </div>

          {/* Batch / strain */}
          {container?.strain_name ? (
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3">
              <div className="font-semibold text-gray-900 text-sm">{container.batch_name || container.strain_name}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{BATCH_STATUS_LABEL[container.batch_status] ?? container.batch_status}</span>
                {container.state_since && (
                  <span className="text-gray-400">· {daysSince(container.state_since) ?? 0}d in state</span>
                )}
                {container.strain_type && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${container.strain_type === 'auto' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                    {container.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic mb-3">No active batch</div>
          )}

          {/* METRC tag */}
          {container?.metrc_plant_tag ? (
            <div className="bg-gray-50 rounded-xl px-3 py-2 mb-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">METRC Tag</div>
              <div className="font-mono text-sm font-bold text-gray-800">
                …{container.metrc_plant_tag.slice(-4)}
                <span className="ml-2 text-[10px] text-gray-400 font-sans font-normal">(last 4)</span>
              </div>
            </div>
          ) : container?.current_state === 'active' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              <div className="text-xs text-amber-700 font-medium">No METRC tag assigned</div>
            </div>
          ) : null}

          {/* Recent observations */}
          <div className="border-t border-gray-100 pt-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Recent Observations
            </div>
            {currentObs === null ? (
              <div className="text-xs text-gray-400">Loading…</div>
            ) : currentObs.length === 0 ? (
              <div className="text-xs text-gray-400 italic">None in last 30 days</div>
            ) : (
              <div className="space-y-1.5">
                {currentObs.map(o => (
                  <div key={o.observation_id} className="flex items-start gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize flex-shrink-0 mt-0.5 ${OBS_CHIP[o.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {(o.category ?? '').replace('_', ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-700 line-clamp-1">{o.note || '—'}</div>
                      <div className="text-[10px] text-gray-400">{timeAgo(o.observed_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Harvest Readiness Panel ───────────────────────────────────── */}
        {isHarvestWindow && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <div className="font-semibold text-orange-900 text-sm mb-4">Harvest Readiness Assessment</div>

            {/* Maturity % slider */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">Trichome / Pistil Maturity</label>
                <span className="font-mono text-lg font-bold text-orange-800">{maturityPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={maturityPct}
                onChange={e => { setMaturityPct(Number(e.target.value)); setReadinessSaved(false); }}
                className="w-full accent-orange-600"
                style={{ height: '36px' }}
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>0% — Immature</span>
                <span>50% — Mid</span>
                <span>100% — Peak</span>
              </div>
            </div>

            {/* Ready to harvest toggle */}
            <div className="mb-5">
              <div className="text-xs font-semibold text-gray-700 mb-2">Ready to harvest?</div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setReadyToHarvest(true); setReadinessSaved(false); }}
                  className={`flex-1 py-3.5 rounded-xl font-bold text-sm border-2 transition-colors ${readyToHarvest ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-green-300'}`}
                  style={{ minHeight: '56px' }}
                >
                  ✓ Yes — Ready
                </button>
                <button
                  onClick={() => { setReadyToHarvest(false); setReadinessSaved(false); }}
                  className={`flex-1 py-3.5 rounded-xl font-bold text-sm border-2 transition-colors ${!readyToHarvest ? 'bg-gray-700 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}
                  style={{ minHeight: '56px' }}
                >
                  Not Ready
                </button>
              </div>
            </div>

            {/* Harvest priority */}
            <div className="mb-5">
              <div className="text-xs font-semibold text-gray-700 mb-1">
                Harvest priority <span className="text-gray-400 font-normal">(optional — 1 = harvest first)</span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(p => (
                  <button
                    key={p}
                    onClick={() => { setHarvestPriority(harvestPriority === p ? null : p); setReadinessSaved(false); }}
                    className={`flex-1 rounded-xl font-bold text-sm border-2 transition-colors ${harvestPriority === p ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'}`}
                    style={{ minHeight: '48px' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {readinessError && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{readinessError}</div>
            )}

            <button
              onClick={saveReadiness}
              disabled={savingReadiness || readinessSaved}
              className={`w-full py-4 rounded-xl font-bold text-sm transition-colors ${readinessSaved ? 'bg-green-600 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white'} disabled:opacity-60`}
              style={{ minHeight: '56px' }}
            >
              {savingReadiness ? 'Saving…' : readinessSaved ? '✓ Readiness Saved' : 'Save Readiness'}
            </button>
          </div>
        )}

        {/* ── Prev / Next arrows ────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={idx === 0}
            className="flex-1 py-3 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 bg-white disabled:opacity-30 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            style={{ minHeight: '56px' }}
          >
            ← {idx > 0 ? `C${containers[idx - 1]?.position}` : 'Start'}
          </button>
          <div className="text-xs text-gray-400 text-center flex-shrink-0" style={{ minWidth: 40 }}>
            {idx + 1}<br /><span className="text-gray-300">/</span><br />{containers.length}
          </div>
          <button
            onClick={goNext}
            disabled={idx === containers.length - 1}
            className="flex-1 py-3 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 bg-white disabled:opacity-30 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            style={{ minHeight: '56px' }}
          >
            {idx < containers.length - 1 ? `C${containers[idx + 1]?.position}` : 'End'} →
          </button>
        </div>

        {/* Spacer so last card clears the bottom action bar */}
        <div style={{ height: 8 }} />
      </div>

      {/* ── Bottom action bar ─────────────────────────────────────────────── */}
      <div
        className="border-t border-gray-200 bg-white flex-shrink-0 px-3 pt-2"
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-5 gap-1.5">
          <Link
            to={`/observations/new?container_id=${containerId}&batch_id=${batchId}&return_to=${returnPath}`}
            className="flex flex-col items-center justify-center py-2 rounded-xl bg-blue-50 text-blue-800 text-[10px] font-semibold gap-0.5 hover:bg-blue-100 active:bg-blue-200 transition-colors"
            style={{ minHeight: '60px', textDecoration: 'none' }}
          >
            <span className="text-xl leading-none">🔍</span>
            <span>Observe</span>
          </Link>

          <Link
            to={`/applications/foliar/new?container_id=${containerId}&batch_id=${batchId}&return_to=${returnPath}`}
            className="flex flex-col items-center justify-center py-2 rounded-xl bg-green-50 text-green-800 text-[10px] font-semibold gap-0.5 hover:bg-green-100 active:bg-green-200 transition-colors"
            style={{ minHeight: '60px', textDecoration: 'none' }}
          >
            <span className="text-xl leading-none">🌿</span>
            <span>Foliar</span>
          </Link>

          <Link
            to={`/applications/pesticide/new?container_id=${containerId}&batch_id=${batchId}&return_to=${returnPath}`}
            className="flex flex-col items-center justify-center py-2 rounded-xl bg-red-50 text-red-800 text-[10px] font-semibold gap-0.5 hover:bg-red-100 active:bg-red-200 transition-colors"
            style={{ minHeight: '60px', textDecoration: 'none' }}
          >
            <span className="text-xl leading-none">⚗️</span>
            <span>Pesticide</span>
          </Link>

          <Link
            to={`/containers/${encodedId}/loss?return_to=${returnPath}`}
            className="flex flex-col items-center justify-center py-2 rounded-xl bg-red-50 text-red-700 text-[10px] font-semibold gap-0.5 hover:bg-red-100 active:bg-red-200 transition-colors"
            style={{ minHeight: '60px', textDecoration: 'none' }}
          >
            <span className="text-xl leading-none">💀</span>
            <span>Loss</span>
          </Link>

          <Link
            to={`/containers/${encodedId}`}
            className="flex flex-col items-center justify-center py-2 rounded-xl bg-gray-50 text-gray-700 text-[10px] font-semibold gap-0.5 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            style={{ minHeight: '60px', textDecoration: 'none' }}
          >
            <span className="text-xl leading-none">📷</span>
            <span>Photo</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
