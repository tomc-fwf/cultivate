import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import { useCurrentConditions, SensorBadge } from '../../hooks/useCurrentConditions.jsx';
import { useOfflineSubmit } from '../../lib/offlineQueue';
import { BatchPickerRow, BatchSummaryCard } from '../../components/BatchCard';

const DRAFT_KEY = 'cv_draft_pesticide';

// ─── Utilities ────────────────────────────────────────────────────────────

function toLocalDatetimeString(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return isoStr; }
}

// ─── Constants ────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  'germ': 'Germination', 'seedling': 'Seedlings', 'cult-hoop': 'Cult-Hoop',
  'field-veg': 'Field — Veg', 'field-flower': 'Field — Flower',
  'flush': 'Flush', 'harvest_window': 'Harvest Window',
};
const STATUS_CHIP = {
  'germ': 'bg-gray-100 text-gray-700', 'seedling': 'bg-lime-100 text-lime-700',
  'cult-hoop': 'bg-green-100 text-green-700', 'field-veg': 'bg-green-100 text-green-800',
  'field-flower': 'bg-purple-100 text-purple-700', 'flush': 'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700',
};

const APPLICATION_METHODS = [
  { value: 'foliar_spray', label: 'Foliar Spray' },
  { value: 'soil_drench', label: 'Soil Drench' },
  { value: 'granular', label: 'Granular' },
  { value: 'other', label: 'Other' },
];

const PEST_PRESSURE_OPTIONS = [
  { value: 'incidental', label: 'Incidental' },
  { value: 'threshold', label: 'At Threshold' },
  { value: 'outbreak', label: 'Outbreak' },
];

const RATE_UNITS = ['ml/gal', 'tsp/gal', 'oz/gal', 'fl oz/gal', 'drops/gal', 'oz/acre', 'lb/acre', 'g/L', 'ml/L'];
const VOLUME_UNITS = ['gal', 'L', 'qt', 'oz'];
const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'Variable'];

const COMMON_PESTS = [
  'Powdery mildew', 'Spider mites', 'Aphids', 'Fungus gnats',
  'Botrytis', 'Root rot', 'Broad mites', 'Thrips', 'Caterpillars',
];

const PESTICIDE_CATEGORIES = [
  { label: 'All EPA', code: '' },
  { label: 'Pesticides', code: 'PEST' },
  { label: 'Fungicides', code: 'FUNG' },
  { label: 'Biocontrols', code: 'BIOL' },
];

function getRowsForSubZone(subZoneId) {
  if (!subZoneId) return [];
  const match = subZoneId.match(/^Z(\d)([AB])$/);
  if (!match) return [];
  const [, zone, sub] = match;
  return Array.from({ length: 5 }, (_, i) => `Z${zone}-${sub}-R${i + 1}`);
}

// ─── Toast ────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : type === 'warning' ? 'bg-amber-600' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto`}>
        {type === 'success' ? '✓ ' : type === 'warning' ? '⚠ ' : '✗ '}{message}
      </div>
    </div>
  );
}

// ─── REI Confirmation Modal — full-screen, required dismissal ─────────────

function REIConfirmModal({ reiExpiresAt, targetArea, onDismiss }) {
  const expiresStr = formatDateTime(reiExpiresAt);
  return (
    <div className="fixed inset-0 z-[90] bg-red-700 flex flex-col items-center justify-center px-6 text-white">
      <div className="text-6xl mb-6">⚠</div>
      <div className="text-2xl font-bold mb-2" style={{ fontFamily: 'Fraunces, serif' }}>REI Active</div>
      {targetArea && (
        <div className="text-lg font-mono font-semibold mb-4 bg-red-800 px-4 py-1.5 rounded-xl">
          {targetArea}
        </div>
      )}
      <div className="text-center text-red-100 text-sm mb-2">Re-entry interval is active.</div>
      <div className="text-center text-red-100 text-sm mb-8">
        Do not enter this area without appropriate PPE until REI clears.
      </div>
      <div className="text-center text-white font-semibold text-base mb-6">
        Restricted until:
        <div className="text-xl font-bold mt-1">{expiresStr}</div>
      </div>
      <button
        onClick={onDismiss}
        className="w-full max-w-sm bg-white text-red-700 font-bold rounded-2xl py-4 text-base shadow-lg active:bg-red-50"
        style={{ minHeight: '64px' }}
      >
        I understand — REI active until {expiresStr}
      </button>
    </div>
  );
}

// ─── Product Picker Sheet (pesticide-only) ────────────────────────────────

function ProductPickerSheet({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (category) params.category = category;
    api.getInventory(params)
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, category]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 100); }, []);

  const SIGNAL_COLORS = { DANGER: 'text-red-700 bg-red-100', WARNING: 'text-amber-700 bg-amber-100', CAUTION: 'text-yellow-700 bg-yellow-100' };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex flex-col justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
        <div className="px-4 pb-3 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Select Pesticide</h2>
            <p className="text-xs text-red-600 font-medium mt-0.5">EPA-registered products only</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm font-medium" style={{ minHeight: '40px', minWidth: '44px' }}>Cancel</button>
        </div>
        <div className="px-4 pb-2">
          <div className="relative">
            <input ref={searchRef} type="text" placeholder="Search pesticides…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-2xl pl-4 pr-10 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>}
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {PESTICIDE_CATEGORIES.map(c => (
            <button key={c.code} onClick={() => setCategory(c.code)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${category === c.code ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-red-300'}`}
              style={{ minHeight: '44px' }}
            >{c.label}</button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-24">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">No products found</div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map(item => {
                const isPesticide = Boolean(item.epa_reg_number || item.epa_reg_no);
                const signalWord = item.signal_word;
                return (
                  <button key={item.id}
                    onClick={() => { if (isPesticide) onSelect(item); }}
                    className={`text-left w-full px-4 py-3 rounded-2xl border transition-colors flex items-center gap-3 ${
                      isPesticide
                        ? 'border-red-200 bg-red-50 hover:border-red-400 hover:bg-red-100 active:bg-red-200'
                        : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-40'
                    }`}
                    style={{ minHeight: '64px' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>{item.name}</span>
                        {isPesticide && (
                          <span className="text-xs bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full font-semibold">EPA</span>
                        )}
                        {signalWord && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${SIGNAL_COLORS[signalWord] ?? 'bg-gray-100 text-gray-700'}`}>
                            {signalWord}
                          </span>
                        )}
                        {item.omri_listed === 1 && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">OMRI</span>
                        )}
                        {!isPesticide && <span className="text-xs text-gray-400">Not EPA-registered</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {item.epa_reg_number || item.epa_reg_no ? `EPA # ${item.epa_reg_number || item.epa_reg_no}` : item.manufacturer ?? ''}
                      </div>
                      {item.target_organisms && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{item.target_organisms}</div>
                      )}
                    </div>
                    {item.total_stock != null && (
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono text-gray-600" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {Number(item.total_stock).toFixed(1)} {item.unit ?? ''}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skill Validation Panel ────────────────────────────────────────────────
// Displays real-time precondition check results from the pesticide-application
// skill schema. Each check shows as a badge: green=pass, amber=warn, red=block.

const SEVERITY_ICONS = { block: '✗', warn_override: '⚠', warn: '⚠', info: 'ℹ' };
const BADGE_PASS = 'bg-green-50 border border-green-200 text-green-800';
const BADGE_BLOCK = 'bg-red-50 border border-red-200 text-red-800';
const BADGE_WARN = 'bg-amber-50 border border-amber-200 text-amber-800';
const BADGE_INFO = 'bg-gray-50 border border-gray-200 text-gray-600';

function SkillValidationPanel({ validation, loading }) {
  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          Checking compliance…
        </div>
      </div>
    );
  }
  if (!validation?.validation) return null;

  const { checks, blocked } = validation.validation;

  return (
    <div className={`rounded-2xl px-4 py-3 border ${blocked ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          SOP Compliance — Skill v{validation.skill_version}
        </span>
        {blocked
          ? <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">BLOCKED</span>
          : <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Ready</span>
        }
      </div>
      <div className="flex flex-col gap-1.5">
        {checks.map(check => {
          let badgeCls = BADGE_PASS;
          let icon = '✓';
          if (!check.passed) {
            if (check.severity === 'block') { badgeCls = BADGE_BLOCK; icon = SEVERITY_ICONS['block']; }
            else if (check.severity === 'warn_override' || check.severity === 'warn') { badgeCls = BADGE_WARN; icon = SEVERITY_ICONS['warn']; }
            else { badgeCls = BADGE_INFO; icon = SEVERITY_ICONS['info']; }
          }
          return (
            <div key={check.check_id} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${badgeCls}`}>
              <span className="font-bold flex-shrink-0 mt-px">{icon}</span>
              <div className="flex-1 min-w-0">
                <span className="font-semibold capitalize">{check.check_id.replace(/_/g, ' ')}</span>
                {' — '}
                <span>{check.message}</span>
                {check.regulatory_ref && (
                  <span className="ml-1 opacity-60 font-mono text-xs">({check.regulatory_ref})</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {validation.auto_fill?.source && (
        <div className="mt-2 text-xs text-gray-400 font-medium">
          📡 Sensor data from: {validation.auto_fill.source}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function PesticideNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const batchIdParam = searchParams.get('batch_id');
  const prefilledInputId = searchParams.get('input_id'); // set when redirected from foliar/amendment form

  // Batch
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [lockedBatch, setLockedBatch] = useState(null);
  const [lockedBatchLoading, setLockedBatchLoading] = useState(false);

  // Product
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productDocs, setProductDocs] = useState({ label_url: null, sds_url: null });

  // Required fields
  const [inputLotId, setInputLotId] = useState('');
  const [targetLevel, setTargetLevel] = useState('row');
  const [targetRowId, setTargetRowId] = useState('');
  const [targetContainerId, setTargetContainerId] = useState('');
  const [targetPest, setTargetPest] = useState('');
  const [rateValue, setRateValue] = useState('');
  const [rateUnit, setRateUnit] = useState('oz/gal');
  const [volumeApplied, setVolumeApplied] = useState('');
  const [volumeUnit, setVolumeUnit] = useState('gal');
  const [applicationMethod, setApplicationMethod] = useState('foliar_spray');
  const [ambientTempF, setAmbientTempF] = useState('');
  const [windSpeedMph, setWindSpeedMph] = useState('');

  // Optional fields
  const [windDirection, setWindDirection] = useState('');
  const [ambientRh, setAmbientRh] = useState('');
  const [pestPressure, setPestPressure] = useState('');
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('');
  const [applicatorLicense, setApplicatorLicense] = useState('');
  const [appliedAt, setAppliedAt] = useState(toLocalDatetimeString());
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  // Sensor auto-fill
  const { conditions: sensorConditions } = useCurrentConditions(null, (lockedBatch || selectedBatch)?.sub_zone_id ?? null);
  const [sensorReadingUsed, setSensorReadingUsed] = useState(null);
  const [tempEdited, setTempEdited] = useState(false);
  const [rhEdited, setRhEdited] = useState(false);

  // Auto-fill ambient conditions from sensor when batch is selected and fields are empty
  useEffect(() => {
    if (!sensorConditions || !sensorConditions.temp_f) return;
    if (ambientTempF === '' && ambientRh === '') {
      setAmbientTempF(String(sensorConditions.temp_f.toFixed(1)));
      setAmbientRh(String(Math.round(sensorConditions.humidity_rh)));
      setSensorReadingUsed(sensorConditions);
      setTempEdited(false);
      setRhEdited(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorConditions]);

  // Skill validation (real-time precondition badges from UEM skill schema)
  const [skillValidation, setSkillValidation] = useState(null);
  const [skillValidationLoading, setSkillValidationLoading] = useState(false);

  // PHI override
  const [phiOverrideAcknowledged, setPhiOverrideAcknowledged] = useState(false);
  const [phiOverrideNotes, setPhiOverrideNotes] = useState('');

  // Computed state
  const [phiStatus, setPhiStatus] = useState(null); // null | 'ok' | 'violation' | 'unknown'
  const [phiDaysUntilHarvest, setPhiDaysUntilHarvest] = useState(null);
  const [reiPreview, setReiPreview] = useState(null); // ISO string of projected REI expiry

  // Save / post-save
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [toast, setToast] = useState(null);
  const [reiModal, setReiModal] = useState(null); // { rei_expires_at, target_area }
  const [stageBlock, setStageBlock] = useState(null); // { reason } when stage blocked

  const { submit, saving, pendingSync } = useOfflineSubmit({
    draftKey: DRAFT_KEY,
    onSuccess: (result, isOffline) => {
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      if (isOffline) {
        setToast({ message: 'Saved locally · Pending sync', type: 'warning' });
        // Don't navigate — show prominent persistent banner (pendingSync stays true)
      } else if (result?.rei_expires_at) {
        // REI active — show modal, then navigate
        setReiModal({ rei_expires_at: result.rei_expires_at, target_area: result.target_area });
      } else {
        setToast({ message: 'Saved · Synced', type: 'success' });
        setTimeout(() => navigate(batchIdParam ? `/batches/${batchIdParam}` : '/applications/pesticide'), 1400);
      }
    },
    onError: (e) => {
      if (e.message?.includes('stage_blocked') || e.message?.includes('not permitted during')) {
        setStageBlock({ reason: e.message });
      } else if (e.message?.includes('PHI violation')) {
        setPhiStatus('violation');
        setSaveError(e.message);
      } else if (e.message?.includes('restricted-use')) {
        setSaveError(e.message);
      } else {
        setSaveError(e.message || 'Failed to save. Please try again.');
      }
    },
  });

  const autoSaveTimer = useRef(null);
  const activeBatch = lockedBatch ?? selectedBatch;
  const rowsForBatch = getRowsForSubZone(activeBatch?.sub_zone_id);

  // ── Load batches / locked batch ──────────────────────────────────────────
  useEffect(() => {
    if (batchIdParam) return;
    setBatchesLoading(true);
    api.getBatches({ status: 'active' })
      .then(data => { setBatches(data.filter(b => b.status !== 'closed')); setBatchesLoading(false); })
      .catch(() => setBatchesLoading(false));
  }, [batchIdParam]);

  useEffect(() => {
    if (!batchIdParam) return;
    setLockedBatchLoading(true);
    api.getBatch(batchIdParam)
      .then(b => { setLockedBatch(b); setLockedBatchLoading(false); })
      .catch(() => setLockedBatchLoading(false));
  }, [batchIdParam]);

  // ── Compute PHI client-side whenever batch, product, or harvest date changes
  useEffect(() => {
    const phi = selectedProduct?.phi_days_operational ?? null;
    const harvestDate = expectedHarvestDate || activeBatch?.harvest_date;
    if (phi == null || !harvestDate) { setPhiStatus('unknown'); setPhiDaysUntilHarvest(null); return; }
    const harvestMs = new Date(harvestDate).getTime();
    const appliedMs = new Date(appliedAt).getTime();
    const daysUntil = (harvestMs - appliedMs) / 86400000;
    setPhiDaysUntilHarvest(Math.floor(daysUntil));
    setPhiStatus(daysUntil >= phi ? 'ok' : 'violation');
  }, [selectedProduct, activeBatch, expectedHarvestDate, appliedAt]);

  // ── Compute REI preview ──────────────────────────────────────────────────
  useEffect(() => {
    const rei = selectedProduct?.rei_hours ?? null;
    if (rei == null) { setReiPreview(null); return; }
    const appliedMs = new Date(appliedAt).getTime();
    setReiPreview(new Date(appliedMs + rei * 3600000).toISOString());
  }, [selectedProduct, appliedAt]);

  // ── Fetch label/SDS docs when product changes ────────────────────────────
  useEffect(() => {
    if (!selectedProduct?.name) { setProductDocs({ label_url: null, sds_url: null }); return; }
    api.getAdditiveTemplateDocs(selectedProduct.name)
      .then((docs) => setProductDocs(docs))
      .catch(() => setProductDocs({ label_url: null, sds_url: null }));
  }, [selectedProduct]);

  // ── Skill validation — real-time precondition badges ────────────────────
  // Calls GET /api/skills/pesticide-application/validate whenever batch or product changes.
  // Returns per-check results displayed as compliance badges in the form header.
  // Also returns sensor auto-fill data as a backup to useCurrentConditions.
  useEffect(() => {
    const batch = lockedBatch ?? selectedBatch;
    if (!batch?.batch_id) { setSkillValidation(null); return; }

    const params = { batch_id: String(batch.batch_id) };
    if (selectedProduct?.id) params.input_id = String(selectedProduct.id);

    setSkillValidationLoading(true);
    api.validateSkill('pesticide-application', params)
      .then(result => {
        setSkillValidation(result);
        // Auto-fill sensor data if fields are empty and sensor provided data
        if (result.auto_fill?.ambient_temp_f != null && ambientTempF === '') {
          setAmbientTempF(String(result.auto_fill.ambient_temp_f.toFixed(1)));
          setTempEdited(false);
        }
        if (result.auto_fill?.ambient_rh != null && ambientRh === '') {
          setAmbientRh(String(Math.round(result.auto_fill.ambient_rh)));
          setRhEdited(false);
        }
      })
      .catch(() => setSkillValidation(null))
      .finally(() => setSkillValidationLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedBatch?.batch_id, selectedBatch?.batch_id, selectedProduct?.id]);

  // ── Restore draft ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (!draft || draft.batchIdParam !== batchIdParam) return;
      if (draft.targetLevel) setTargetLevel(draft.targetLevel);
      if (draft.targetRowId) setTargetRowId(draft.targetRowId);
      if (draft.targetContainerId) setTargetContainerId(draft.targetContainerId);
      if (draft.targetPest) setTargetPest(draft.targetPest);
      if (draft.rateValue) setRateValue(draft.rateValue);
      if (draft.rateUnit) setRateUnit(draft.rateUnit);
      if (draft.volumeApplied) setVolumeApplied(draft.volumeApplied);
      if (draft.volumeUnit) setVolumeUnit(draft.volumeUnit);
      if (draft.applicationMethod) setApplicationMethod(draft.applicationMethod);
      if (draft.ambientTempF) setAmbientTempF(draft.ambientTempF);
      if (draft.windSpeedMph) setWindSpeedMph(draft.windSpeedMph);
      if (draft.windDirection) setWindDirection(draft.windDirection);
      if (draft.ambientRh) setAmbientRh(draft.ambientRh);
      if (draft.pestPressure) setPestPressure(draft.pestPressure);
      if (draft.notes) setNotes(draft.notes);
    } catch { /* ignore */ }
  }, [batchIdParam]);

  // ── Auto-save draft ──────────────────────────────────────────────────────
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        batchIdParam, targetLevel, targetRowId, targetContainerId, targetPest,
        rateValue, rateUnit, volumeApplied, volumeUnit, applicationMethod,
        ambientTempF, windSpeedMph, windDirection, ambientRh, pestPressure, notes,
        savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [batchIdParam, targetLevel, targetRowId, targetContainerId, targetPest,
      rateValue, rateUnit, volumeApplied, volumeUnit, applicationMethod,
      ambientTempF, windSpeedMph, windDirection, ambientRh, pestPressure, notes]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // ── Can save? ────────────────────────────────────────────────────────────
  const batchId = batchIdParam ? Number(batchIdParam) : activeBatch?.batch_id;
  const hasTarget = targetLevel === 'row' ? targetRowId !== '' : targetContainerId !== '';
  const phiNeedsOverride = phiStatus === 'violation' && (!phiOverrideAcknowledged || phiOverrideNotes.trim() === '');
  const isRUP = Boolean(selectedProduct?.restricted_use);
  const licenseNeeded = isRUP && applicatorLicense.trim() === '';

  const skillBlocked = skillValidation?.validation?.blocked === true;

  const canSave = Boolean(batchId)
    && Boolean(selectedProduct)
    && inputLotId.trim() !== ''
    && hasTarget
    && targetPest.trim() !== ''
    && rateValue !== ''
    && volumeApplied !== ''
    && ambientTempF !== ''
    && windSpeedMph !== ''
    && !phiNeedsOverride
    && !licenseNeeded
    && !stageBlock
    && !skillBlocked;

  // ── Save handler ─────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveError('');

    const payload = {
      batch_id: batchId,
      row_id: targetLevel === 'row' ? targetRowId : null,
      container_id: targetLevel === 'container' ? targetContainerId : null,
      applied_at: new Date(appliedAt).toISOString(),
      input_id: selectedProduct.id,
      input_lot_id: parseInt(inputLotId, 10),
      rate_value: parseFloat(rateValue),
      rate_unit: rateUnit,
      volume_applied: parseFloat(volumeApplied),
      volume_unit: volumeUnit,
      application_method: applicationMethod,
      target_pest: targetPest.trim(),
      pest_pressure: pestPressure || null,
      ambient_temp_f: parseFloat(ambientTempF),
      ambient_rh: ambientRh !== '' ? parseFloat(ambientRh) : null,
      wind_speed_mph: parseFloat(windSpeedMph),
      wind_direction: windDirection || null,
      expected_harvest_date: expectedHarvestDate || null,
      applicator_license: applicatorLicense.trim() || null,
      phi_override_notes: phiStatus === 'violation' ? phiOverrideNotes.trim() : null,
      notes: notes || null,
    };

    await submit(
      () => api.createPesticideApplication(payload),
      { endpoint: '/api/applications/pesticide', payload, entity_type: 'pesticide' }
    );
  }

  // ── REI modal dismiss — then navigate ────────────────────────────────────
  function handleREIDismiss() {
    setReiModal(null);
    navigate(batchIdParam ? `/batches/${batchIdParam}` : '/applications/pesticide');
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
      {/* REI full-screen modal — must be dismissed before leaving */}
      {reiModal && (
        <REIConfirmModal
          reiExpiresAt={reiModal.rei_expires_at}
          targetArea={reiModal.target_area}
          onDismiss={handleREIDismiss}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {showProductPicker && (
        <ProductPickerSheet
          onSelect={item => { setSelectedProduct(item); setShowProductPicker(false); setStageBlock(null); }}
          onClose={() => setShowProductPicker(false)}
        />
      )}

      {/* Header — red-accented to signal this is a serious form */}
      <div className="bg-white border-b-2 border-red-200 px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-red-700 font-medium text-sm hover:text-red-900" style={{ minHeight: '44px', minWidth: '44px' }}>
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Log Pesticide Application
          </h1>
          <p className="text-xs text-red-600 font-medium">MN MDA-compliant record</p>
        </div>
      </div>

      {/* Stage block banner — hard stop */}
      {stageBlock && (
        <div className="bg-red-600 text-white px-4 py-4 text-sm">
          <div className="font-bold mb-1">⛔ Application blocked — stage restriction</div>
          <div className="text-red-100">{stageBlock.reason}</div>
        </div>
      )}

      {/* PHI violation banner */}
      {phiStatus === 'violation' && selectedProduct && (
        <div className="bg-red-50 border-b-2 border-red-300 px-4 py-4">
          <div className="flex items-start gap-2 mb-3">
            <span className="text-red-600 font-bold text-lg">⚠</span>
            <div>
              <div className="text-sm font-bold text-red-700">PHI Violation</div>
              <div className="text-xs text-red-600 mt-0.5">
                {selectedProduct.name} requires {selectedProduct.phi_days_operational} days before harvest.
                Harvest is in {phiDaysUntilHarvest} day{phiDaysUntilHarvest !== 1 ? 's' : ''}.
                Operational PHI may be stricter than the label.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 mb-2">
            <input
              type="checkbox"
              id="phi-ack"
              checked={phiOverrideAcknowledged}
              onChange={e => setPhiOverrideAcknowledged(e.target.checked)}
              className="mt-0.5 accent-red-600"
              style={{ minWidth: '20px', minHeight: '20px' }}
            />
            <label htmlFor="phi-ack" className="text-xs text-red-700 font-semibold">
              I acknowledge this application is within the PHI. Required override reason:
            </label>
          </div>
          {phiOverrideAcknowledged && (
            <textarea
              placeholder="Reason for applying within PHI window…"
              value={phiOverrideNotes}
              onChange={e => setPhiOverrideNotes(e.target.value)}
              className="w-full border-2 border-red-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={2}
            />
          )}
        </div>
      )}

      {/* REI preview banner */}
      {reiPreview && !reiModal && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-xs text-amber-800">
          <span className="font-bold">⏱ REI</span>
          <span>Area will be restricted until <span className="font-semibold">{formatDateTime(reiPreview)}</span></span>
        </div>
      )}

      {/* Skill validation panel — shown once batch (and optionally product) is selected */}
      {(skillValidation || skillValidationLoading) && (lockedBatch || selectedBatch) && (
        <div className="px-4 pt-3 pb-0">
          <SkillValidationPanel
            validation={skillValidation}
            loading={skillValidationLoading}
          />
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-36 flex flex-col gap-4">

        {/* ── BATCH ── */}
        {batchIdParam ? (
          lockedBatchLoading ? (
            <div className="h-20 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ) : lockedBatch ? (
            <BatchCard batch={lockedBatch} />
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">Batch not found</div>
          )
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Batch <span className="text-red-400">*</span></label>
            {batchesLoading ? (
              <div className="h-24 bg-white rounded-2xl border animate-pulse" />
            ) : batches.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">No active batches.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {batches.map(batch => (
                  <BatchPickerRow
                    key={batch.batch_id}
                    batch={batch}
                    selected={selectedBatch?.batch_id === batch.batch_id}
                    onSelect={() => setSelectedBatch(batch)}
                    accent="red"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PRODUCT ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Pesticide Product <span className="text-red-400">*</span>
          </label>
          <button
            onClick={() => setShowProductPicker(true)}
            className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${selectedProduct ? 'border-red-400 bg-red-50' : 'border-dashed border-gray-300 bg-white hover:border-red-300'}`}
            style={{ minHeight: '64px' }}
          >
            {selectedProduct ? (
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{selectedProduct.name}</span>
                    <span className="text-xs bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full font-semibold">EPA</span>
                    {selectedProduct.restricted_use && (
                      <span className="text-xs bg-red-700 text-white px-1.5 py-0.5 rounded-full font-semibold">RUP</span>
                    )}
                    {selectedProduct.signal_word && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">{selectedProduct.signal_word}</span>
                    )}
                  </div>
                  {(selectedProduct.epa_reg_number || selectedProduct.epa_reg_no) && (
                    <div className="text-xs text-gray-500 font-mono mt-0.5">
                      EPA # {selectedProduct.epa_reg_number || selectedProduct.epa_reg_no}
                    </div>
                  )}
                </div>
                <button onClick={e => { e.stopPropagation(); setSelectedProduct(null); setStageBlock(null); }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0" style={{ minHeight: '40px', minWidth: '40px' }}>×</button>
              </div>
            ) : (
              <span className="text-gray-400 font-medium text-sm">Tap to select pesticide →</span>
            )}
          </button>
          {selectedProduct && (productDocs.label_url || productDocs.sds_url) && (
            <div className="flex gap-2 mt-2">
              {productDocs.label_url && (
                <a
                  href={productDocs.label_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
                  style={{ minHeight: '36px' }}
                  aria-label="Product label"
                >
                  Product Label ↗
                </a>
              )}
              {productDocs.sds_url && (
                <a
                  href={productDocs.sds_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200"
                  style={{ minHeight: '36px' }}
                  aria-label="Safety data sheet"
                >
                  Safety Data Sheet ↗
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── LOT ID (required) ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Stock / Lot # <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-400 mb-2">Enter the lot or stock ID from farmstock inventory (required for all pesticide applications)</p>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 42"
            value={inputLotId}
            onChange={e => setInputLotId(e.target.value)}
            className="w-full border-2 border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
          />
        </div>

        {/* ── RUP license (shown when restricted use) ── */}
        {isRUP && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl px-4 py-3">
            <label className="block text-xs font-bold text-red-700 uppercase tracking-wide mb-2">
              Applicator License # <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-red-600 mb-2">Restricted-use pesticide — applicator certification required.</p>
            <input
              type="text"
              placeholder="MN applicator license number"
              value={applicatorLicense}
              onChange={e => setApplicatorLicense(e.target.value)}
              className="w-full border border-red-300 rounded-xl px-4 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              style={{ minHeight: '56px' }}
            />
          </div>
        )}

        {/* ── TARGET (row or container — no full-batch for pesticides) ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Target <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2 mb-2">
            {[{ value: 'row', label: 'Row' }, { value: 'container', label: 'Container' }].map(opt => (
              <button key={opt.value} onClick={() => setTargetLevel(opt.value)}
                className={`flex-1 py-2.5 rounded-2xl border-2 text-sm font-semibold transition-colors ${targetLevel === opt.value ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-600 hover:border-red-200'}`}
                style={{ minHeight: '48px' }}
              >{opt.label}</button>
            ))}
          </div>
          {targetLevel === 'row' && (
            rowsForBatch.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {rowsForBatch.map(rowId => (
                  <button key={rowId} onClick={() => setTargetRowId(rowId)}
                    className={`px-3 py-2 rounded-xl border-2 text-sm font-mono font-semibold transition-colors ${targetRowId === rowId ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-600 hover:border-red-200'}`}
                    style={{ minHeight: '44px' }}
                  >{rowId}</button>
                ))}
              </div>
            ) : (
              <input type="text" placeholder="e.g. Z1-A-R3" value={targetRowId}
                onChange={e => setTargetRowId(e.target.value.toUpperCase())}
                className="w-full border border-gray-300 rounded-2xl px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
            )
          )}
          {targetLevel === 'container' && (
            <input type="text" placeholder="e.g. Z1-A-R3-C12" value={targetContainerId}
              onChange={e => setTargetContainerId(e.target.value.toUpperCase())}
              className="mt-2 w-full border border-gray-300 rounded-2xl px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
          )}
        </div>

        {/* ── TARGET PEST (required) ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Target Pest <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2 flex-wrap mb-2">
            {COMMON_PESTS.map(pest => (
              <button key={pest} onClick={() => setTargetPest(pest)}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors flex-shrink-0 ${targetPest === pest ? 'bg-red-700 text-white border-red-700' : 'bg-white text-gray-600 border-gray-300 hover:border-red-300'}`}
                style={{ minHeight: '44px' }}
              >{pest}</button>
            ))}
          </div>
          <input type="text" placeholder="Target organism or pest…" value={targetPest}
            onChange={e => setTargetPest(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            style={{ minHeight: '56px' }}
          />
        </div>

        {/* ── RATE ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Rate <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2">
            <input type="number" inputMode="decimal" step="0.001" min="0" placeholder="0.000"
              value={rateValue} onChange={e => setRateValue(e.target.value)}
              className="flex-1 border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            <select value={rateUnit} onChange={e => setRateUnit(e.target.value)}
              className="border border-gray-300 rounded-2xl px-3 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              style={{ minHeight: '56px' }}
            >
              {RATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* ── VOLUME APPLIED + METHOD ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Volume Applied <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2">
            <input type="number" inputMode="decimal" step="0.1" min="0" placeholder="0.0"
              value={volumeApplied} onChange={e => setVolumeApplied(e.target.value)}
              className="flex-1 border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            <select value={volumeUnit} onChange={e => setVolumeUnit(e.target.value)}
              className="border border-gray-300 rounded-2xl px-3 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              style={{ minHeight: '56px' }}
            >
              {VOLUME_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* ── APPLICATION METHOD ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Application Method <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {APPLICATION_METHODS.map(opt => (
              <button key={opt.value} onClick={() => setApplicationMethod(opt.value)}
                className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition-colors ${applicationMethod === opt.value ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-600 hover:border-red-200'}`}
                style={{ minHeight: '56px' }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* ── ENVIRONMENTAL (required: temp + wind) ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Environmental Conditions <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Ambient temp (°F) *</label>
              <input type="number" inputMode="decimal" step="0.1" placeholder="—"
                value={ambientTempF} onChange={e => { setAmbientTempF(e.target.value); setTempEdited(true); }}
                className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
              {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={tempEdited} />}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Wind speed (mph) *</label>
              <input type="number" inputMode="decimal" step="0.1" min="0" placeholder="—"
                value={windSpeedMph} onChange={e => setWindSpeedMph(e.target.value)}
                className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          </div>
        </div>

        {/* ── OPTIONAL FIELDS ── */}
        <div>
          <button onClick={() => setShowOptional(s => !s)}
            className="flex items-center gap-2 text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors"
            style={{ minHeight: '44px' }}
          >
            <span className={`transition-transform ${showOptional ? 'rotate-90' : ''}`}>▶</span>
            {showOptional ? 'Hide optional fields' : 'Show optional fields'}
          </button>

          {showOptional && (
            <div className="mt-3 flex flex-col gap-3">
              {/* Wind direction */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Wind direction</label>
                <div className="flex gap-2 flex-wrap">
                  {WIND_DIRECTIONS.map(d => (
                    <button key={d} onClick={() => setWindDirection(windDirection === d ? '' : d)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${windDirection === d ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                      style={{ minHeight: '44px' }}
                    >{d}</button>
                  ))}
                </div>
              </div>

              {/* RH */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">RH (%)</label>
                <input type="number" inputMode="decimal" step="1" min="0" max="100" placeholder="—"
                  value={ambientRh} onChange={e => { setAmbientRh(e.target.value); setRhEdited(true); }}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
                />
                {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={rhEdited} />}
              </div>

              {/* Pest pressure */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Pest pressure</label>
                <div className="flex gap-2">
                  {PEST_PRESSURE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPestPressure(pestPressure === opt.value ? '' : opt.value)}
                      className={`flex-1 py-2.5 rounded-2xl border-2 text-xs font-semibold transition-colors ${pestPressure === opt.value ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-600 hover:border-red-200'}`}
                      style={{ minHeight: '48px' }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Expected harvest date (for PHI calculation) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Expected harvest date (for PHI)</label>
                <input type="date" value={expectedHarvestDate} onChange={e => setExpectedHarvestDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  style={{ minHeight: '56px' }}
                />
              </div>

              {/* Applicator license (optional unless RUP) */}
              {!isRUP && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Applicator license #</label>
                  <input type="text" placeholder="MN applicator license (optional)"
                    value={applicatorLicense} onChange={e => setApplicatorLicense(e.target.value)}
                    className="w-full border border-gray-300 rounded-2xl px-4 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                    style={{ minHeight: '56px' }}
                  />
                </div>
              )}

              {/* Applied at */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Applied at</label>
                <input type="datetime-local" value={appliedAt} onChange={e => setAppliedAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  style={{ minHeight: '56px' }}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Notes</label>
                <textarea placeholder="Additional observations, application details…"
                  value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        {/* Applicator */}
        {user && (
          <div className="text-xs text-gray-400">
            Applicator: <span className="font-medium text-gray-600">{user.name}</span>
          </div>
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        {pendingSync && (
          <div className="bg-amber-100 border-2 border-amber-400 rounded-xl px-4 py-3 text-sm text-amber-900 font-semibold">
            ⚠ Pesticide application saved locally — PENDING SYNC. Do not re-enter. This record will sync automatically when connection is restored. Verify it appears in the Pesticide Log before re-submitting.
          </div>
        )}
      </div>

      {/* ── FIXED SAVE BUTTON ── */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={`w-full font-bold rounded-2xl text-white shadow-lg transition-all active:scale-[0.98] ${
              saveFlash ? 'bg-red-400 scale-[0.99]'
                : canSave && !saving ? 'bg-red-700 hover:bg-red-800 active:bg-red-900'
                : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ minHeight: '64px', fontSize: '1.05rem' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Saving…
              </span>
            ) : stageBlock || skillBlocked ? 'Application Blocked' : 'Save Pesticide Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchCard({ batch }) {
  const harvestLine = batch.harvest_date
    ? <span className="text-xs text-gray-500">Harvest: {new Date(batch.harvest_date).toLocaleDateString()}</span>
    : null;
  return <BatchSummaryCard batch={batch} accent="red" footer={harvestLine} />;
}
