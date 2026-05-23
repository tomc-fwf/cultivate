import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import { useOfflineSubmit } from '../../lib/offlineQueue';
import { useCurrentConditions, SensorBadge } from '../../hooks/useCurrentConditions.jsx';

const DRAFT_KEY = 'cv_draft_foliar';

// ─── Shared with FertigationNew ────────────────────────────────────────────

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : type === 'warning' ? 'bg-amber-600' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto`}>
        {type === 'success' ? '✓ ' : type === 'warning' ? '⚠ ' : '✗ '}{message}
      </div>
    </div>
  );
}

function toLocalDatetimeString(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

// ─── Derive fixed row IDs from sub_zone_id ─────────────────────────────────

function getRowsForSubZone(subZoneId) {
  if (!subZoneId) return [];
  const match = subZoneId.match(/^Z(\d)([AB])$/);
  if (!match) return [];
  const [, zone, sub] = match;
  return Array.from({ length: 5 }, (_, i) => `Z${zone}-${sub}-R${i + 1}`);
}

// ─── Common purpose chips ──────────────────────────────────────────────────

const PURPOSE_CHIPS = [
  'Weekly preventive',
  'Mg deficiency',
  'Ca deficiency',
  'K deficiency',
  'Growth stimulant',
  'IPM — preventive',
];

// ─── Non-pesticide category codes ─────────────────────────────────────────

const FOLIAR_CATEGORIES = [
  { label: 'All', code: '' },
  { label: 'Fertilizers', code: 'FERT' },
  { label: 'Foliar', code: 'FOLIAR' },
  { label: 'Biologicals', code: 'BIOL' },
  { label: 'Amendments', code: 'AMEND' },
  { label: 'Additives', code: 'ADDITIVE' },
];

const RATE_UNITS = ['ml/gal', 'tsp/gal', 'oz/gal', 'fl oz/gal', 'drops/gal', 'g/L', 'ml/L'];
const VOLUME_UNITS = ['gal', 'L', 'qt', 'oz'];

// ─── Product Picker Sheet ──────────────────────────────────────────────────

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
      .then(data => {
        // Filter out pesticide-category items by EPA number presence
        // (backend will also enforce this, but we give early feedback here)
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, category]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-40 bg-black/40 flex flex-col justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet */}
      <div className="bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 flex-1" style={{ fontFamily: 'Fraunces, serif' }}>
            Select Product
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-sm font-medium"
            style={{ minHeight: '40px', minWidth: '44px' }}
          >
            Cancel
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-2xl pl-4 pr-10 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {FOLIAR_CATEGORIES.map(c => (
            <button
              key={c.code}
              onClick={() => setCategory(c.code)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                category === c.code
                  ? 'bg-green-800 text-white'
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-green-300'
              }`}
              style={{ minHeight: '44px' }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Product list */}
        <div className="overflow-y-auto flex-1 px-4 pb-6">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">No products found</div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map(item => {
                const isPesticide = Boolean(item.epa_reg_number || item.epa_reg_no);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isPesticide) return; // show visual feedback but don't select
                      onSelect(item);
                    }}
                    className={`text-left w-full px-4 py-3 rounded-2xl border transition-colors flex items-center gap-3 ${
                      isPesticide
                        ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-60'
                        : 'border-gray-200 bg-white hover:border-green-400 hover:bg-green-50 active:bg-green-100'
                    }`}
                    style={{ minHeight: '64px' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>
                          {item.name}
                        </span>
                        {isPesticide && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">
                            EPA — use Pesticide form
                          </span>
                        )}
                        {item.omri_listed === 1 && !isPesticide && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">OMRI</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {item.manufacturer ?? item.category_name ?? ''}
                      </div>
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

// ─── Recipe Picker Sheet ───────────────────────────────────────────────────

function RecipePickerSheet({ onSelect, onClose }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFoliarRecipes()
      .then(data => { setRecipes(data.filter(r => r.active)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex flex-col justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[70vh]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="px-4 pb-3 flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 flex-1" style={{ fontFamily: 'Fraunces, serif' }}>
            Select Foliar Recipe
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm font-medium" style={{ minHeight: '40px', minWidth: '44px' }}>
            Cancel
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-6">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
          ) : recipes.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              No active foliar recipes. Create one in the Recipes section, or use Single Product mode.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recipes.map(r => (
                <button
                  key={r.foliar_recipe_id}
                  onClick={() => onSelect(r)}
                  className="text-left w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white hover:border-green-400 hover:bg-green-50 transition-colors"
                  style={{ minHeight: '64px' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{r.name}</span>
                    <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full font-semibold">v{r.version}</span>
                  </div>
                  {r.purpose && <div className="text-xs text-gray-500 mt-0.5">{r.purpose}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function FoliarNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const batchIdParam = searchParams.get('batch_id');

  // Batch state
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [lockedBatch, setLockedBatch] = useState(null);
  const [lockedBatchLoading, setLockedBatchLoading] = useState(false);

  // Mode: recipe or single product
  const [mode, setMode] = useState('product'); // 'recipe' | 'product'
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Pickers visibility
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  // Target granularity
  const [targetLevel, setTargetLevel] = useState('batch'); // 'batch' | 'row' | 'container'
  const [targetRowId, setTargetRowId] = useState('');
  const [targetContainerId, setTargetContainerId] = useState('');

  // Form fields
  const [purpose, setPurpose] = useState('');
  const [rateValue, setRateValue] = useState('');
  const [rateUnit, setRateUnit] = useState('ml/gal');
  const [volumeApplied, setVolumeApplied] = useState('');
  const [volumeUnit, setVolumeUnit] = useState('gal');
  const [appliedAt, setAppliedAt] = useState(toLocalDatetimeString());
  const [ambientTempF, setAmbientTempF] = useState('');
  const [ambientRh, setAmbientRh] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  // Sensor auto-fill
  const { conditions: sensorConditions } = useCurrentConditions(null, (lockedBatch ?? selectedBatch)?.sub_zone_id ?? null);
  const [sensorReadingUsed, setSensorReadingUsed] = useState(null);
  const [tempEdited, setTempEdited] = useState(false);
  const [rhEdited, setRhEdited] = useState(false);

  // Stage-block check
  const [stageBlock, setStageBlock] = useState(null); // { blocked: true, reason } | null
  const stageCheckTimerRef = useRef(null);

  // Save state
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [toast, setToast] = useState(null);

  const { submit, saving, pendingSync } = useOfflineSubmit({
    draftKey: DRAFT_KEY,
    onSuccess: (result, isOffline) => {
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      if (isOffline) {
        setToast({ message: 'Saved locally · Pending sync', type: 'warning' });
      } else if (result?.warning) {
        setToast({ message: result.warning, type: 'warning' });
      } else {
        setToast({ message: 'Saved · Synced', type: 'success' });
      }
      if (!isOffline) {
        setTimeout(() => navigate(batchIdParam ? `/batches/${batchIdParam}` : '/applications/foliar'), 1400);
      }
    },
    onError: (e) => {
      if (e.message?.includes('EPA') || e.message?.includes('Pesticide')) {
        setSaveError(e.message + ' Use the Pesticide Application form instead.');
      } else {
        setSaveError(e.message || 'Failed to save. Please try again.');
      }
    },
  });

  const autoSaveTimer = useRef(null);

  const activeBatch = lockedBatch ?? selectedBatch;
  const rowsForBatch = getRowsForSubZone(activeBatch?.sub_zone_id);

  // Load batch list
  useEffect(() => {
    if (batchIdParam) return;
    setBatchesLoading(true);
    api.getBatches({ status: 'active' })
      .then(data => {
        setBatches(data.filter(b => b.status !== 'closed' && b.status !== 'harvesting'));
        setBatchesLoading(false);
      })
      .catch(() => setBatchesLoading(false));
  }, [batchIdParam]);

  // Load locked batch
  useEffect(() => {
    if (!batchIdParam) return;
    setLockedBatchLoading(true);
    api.getBatch(batchIdParam)
      .then(b => { setLockedBatch(b); setLockedBatchLoading(false); })
      .catch(() => setLockedBatchLoading(false));
  }, [batchIdParam]);

  // Restore draft
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (!draft || draft.batchIdParam !== batchIdParam) return;
      if (draft.purpose) setPurpose(draft.purpose);
      if (draft.rateValue) setRateValue(draft.rateValue);
      if (draft.rateUnit) setRateUnit(draft.rateUnit);
      if (draft.volumeApplied) setVolumeApplied(draft.volumeApplied);
      if (draft.volumeUnit) setVolumeUnit(draft.volumeUnit);
      if (draft.appliedAt) setAppliedAt(draft.appliedAt);
      if (draft.ambientTempF) setAmbientTempF(draft.ambientTempF);
      if (draft.ambientRh) setAmbientRh(draft.ambientRh);
      if (draft.notes) setNotes(draft.notes);
      if (draft.targetLevel) setTargetLevel(draft.targetLevel);
      if (draft.targetRowId) setTargetRowId(draft.targetRowId);
      if (draft.targetContainerId) setTargetContainerId(draft.targetContainerId);
      if (draft.mode) setMode(draft.mode);
    } catch { /* ignore */ }
  }, [batchIdParam]);

  // Auto-save draft
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        batchIdParam, purpose, rateValue, rateUnit, volumeApplied, volumeUnit,
        appliedAt, ambientTempF, ambientRh, notes, targetLevel, targetRowId,
        targetContainerId, mode, savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [batchIdParam, purpose, rateValue, rateUnit, volumeApplied, volumeUnit,
      appliedAt, ambientTempF, ambientRh, notes, targetLevel, targetRowId,
      targetContainerId, mode]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Auto-fill ambient conditions from sensor when fields are empty
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

  // Can save?
  const batchId = batchIdParam ? Number(batchIdParam) : activeBatch?.batch_id;

  // Debounced stage-block pre-flight check (single-product mode only)
  const inputIdForCheck = mode === 'product' ? selectedProduct?.id : null;
  useEffect(() => {
    if (stageCheckTimerRef.current) clearTimeout(stageCheckTimerRef.current);
    if (!inputIdForCheck || !batchId) {
      setStageBlock(null);
      return;
    }
    stageCheckTimerRef.current = setTimeout(() => {
      api.foliarStageCheck(inputIdForCheck, batchId)
        .then(result => setStageBlock(result.blocked ? result : null))
        .catch(() => { /* silently skip on network error */ });
    }, 300);
    return () => { if (stageCheckTimerRef.current) clearTimeout(stageCheckTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputIdForCheck, batchId]);
  const hasProduct = mode === 'recipe' ? Boolean(selectedRecipe) : Boolean(selectedProduct);
  const hasRate = mode === 'recipe' || (rateValue !== '' && rateUnit !== '');
  const hasTarget = targetLevel === 'batch'
    || (targetLevel === 'row' && targetRowId !== '')
    || (targetLevel === 'container' && targetContainerId !== '');

  const canSave = Boolean(batchId) && hasProduct && hasRate && purpose.trim() !== '' && hasTarget && !stageBlock?.blocked;

  // Save handler
  async function handleSave() {
    setSaveError('');

    const payload = {
      batch_id: batchId,
      row_id: targetLevel === 'row' ? targetRowId : null,
      container_id: targetLevel === 'container' ? targetContainerId : null,
      applied_at: new Date(appliedAt).toISOString(),
      foliar_recipe_id: mode === 'recipe' && selectedRecipe ? selectedRecipe.foliar_recipe_id : null,
      input_id: mode === 'product' && selectedProduct ? selectedProduct.id : null,
      rate_value: mode === 'product' && rateValue !== '' ? parseFloat(rateValue) : null,
      rate_unit: mode === 'product' ? rateUnit : null,
      volume_applied: volumeApplied !== '' ? parseFloat(volumeApplied) : null,
      volume_unit: volumeApplied !== '' ? volumeUnit : null,
      purpose: purpose.trim(),
      ambient_temp_f: ambientTempF !== '' ? parseFloat(ambientTempF) : null,
      ambient_rh: ambientRh !== '' ? parseFloat(ambientRh) : null,
      notes: notes || null,
    };

    await submit(
      () => api.createFoliarApplication(payload),
      { endpoint: '/api/applications/foliar', payload, entity_type: 'foliar' }
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {showProductPicker && (
        <ProductPickerSheet
          onSelect={item => { setSelectedProduct(item); setShowProductPicker(false); }}
          onClose={() => setShowProductPicker(false)}
        />
      )}
      {showRecipePicker && (
        <RecipePickerSheet
          onSelect={r => { setSelectedRecipe(r); setShowRecipePicker(false); }}
          onClose={() => setShowRecipePicker(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-green-700 font-medium text-sm hover:text-green-900"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1" style={{ fontFamily: 'Fraunces, serif' }}>
          Log Foliar
        </h1>
      </div>

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
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Select Batch</label>
            {batchesLoading ? (
              <div className="h-24 bg-white rounded-2xl border animate-pulse" />
            ) : batches.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                No active batches.{' '}
                <button onClick={() => navigate('/batches/new')} className="underline font-medium">Create one →</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {batches.map(batch => (
                  <button
                    key={batch.batch_id}
                    onClick={() => setSelectedBatch(batch)}
                    className={`text-left w-full px-4 py-3 rounded-2xl border-2 transition-colors ${
                      selectedBatch?.batch_id === batch.batch_id
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-green-300'
                    }`}
                    style={{ minHeight: '64px' }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>{batch.strain_name}</span>
                      {batch.sub_zone_id && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{batch.sub_zone_id}</span>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[batch.status] ?? batch.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── APPLICATION MODE ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Application Type</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'product', label: 'Single Product' },
              { value: 'recipe', label: 'Foliar Recipe' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  setMode(opt.value);
                  setSelectedProduct(null);
                  setSelectedRecipe(null);
                }}
                className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                  mode === opt.value
                    ? 'border-green-600 bg-green-50 text-green-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'
                }`}
                style={{ minHeight: '56px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── PRODUCT / RECIPE SELECTOR ── */}
        {mode === 'product' ? (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product</label>
            <button
              onClick={() => setShowProductPicker(true)}
              className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${
                selectedProduct
                  ? 'border-green-400 bg-green-50'
                  : 'border-dashed border-gray-300 bg-white hover:border-green-300'
              }`}
              style={{ minHeight: '64px' }}
            >
              {selectedProduct ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                      {selectedProduct.name}
                    </span>
                    {selectedProduct.omri_listed === 1 && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">OMRI</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{selectedProduct.manufacturer ?? ''}</div>
                </div>
              ) : (
                <span className="text-gray-400 font-medium text-sm">Tap to select product →</span>
              )}
            </button>
            {stageBlock?.blocked && (
              <div className="mt-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
                <span className="text-amber-500 text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Stage restriction — application blocked</p>
                  {stageBlock.reason && (
                    <p className="text-xs text-amber-700 mt-0.5">{stageBlock.reason}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Foliar Recipe</label>
            <button
              onClick={() => setShowRecipePicker(true)}
              className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${
                selectedRecipe
                  ? 'border-green-400 bg-green-50'
                  : 'border-dashed border-gray-300 bg-white hover:border-green-300'
              }`}
              style={{ minHeight: '64px' }}
            >
              {selectedRecipe ? (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                    {selectedRecipe.name}
                  </span>
                  <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full font-semibold">
                    v{selectedRecipe.version}
                  </span>
                </div>
              ) : (
                <span className="text-gray-400 font-medium text-sm">Tap to select recipe →</span>
              )}
            </button>
          </div>
        )}

        {/* ── RATE (single product only) ── */}
        {mode === 'product' && selectedProduct && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Rate</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={rateValue}
                onChange={e => setRateValue(e.target.value)}
                className="flex-1 border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
              />
              <select
                value={rateUnit}
                onChange={e => setRateUnit(e.target.value)}
                className="border border-gray-300 rounded-2xl px-3 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                style={{ minHeight: '56px' }}
              >
                {RATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── TARGET ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Target</label>
          <div className="flex gap-2">
            {[
              { value: 'batch', label: activeBatch ? `${activeBatch.sub_zone_id ?? 'Full batch'}` : 'Full batch' },
              { value: 'row', label: 'Row' },
              { value: 'container', label: 'Container' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setTargetLevel(opt.value)}
                className={`flex-1 py-2.5 rounded-2xl border-2 text-xs font-semibold transition-colors ${
                  targetLevel === opt.value
                    ? 'border-green-600 bg-green-50 text-green-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'
                }`}
                style={{ minHeight: '48px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {targetLevel === 'row' && (
            <div className="mt-2">
              {rowsForBatch.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {rowsForBatch.map(rowId => (
                    <button
                      key={rowId}
                      onClick={() => setTargetRowId(rowId)}
                      className={`px-3 py-2 rounded-xl border-2 text-sm font-mono font-semibold transition-colors ${
                        targetRowId === rowId
                          ? 'border-green-600 bg-green-50 text-green-900'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'
                      }`}
                      style={{ minHeight: '44px' }}
                    >
                      {rowId}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. Z1-A-R3"
                  value={targetRowId}
                  onChange={e => setTargetRowId(e.target.value.toUpperCase())}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
                />
              )}
            </div>
          )}

          {targetLevel === 'container' && (
            <input
              type="text"
              placeholder="e.g. Z1-A-R3-C12"
              value={targetContainerId}
              onChange={e => setTargetContainerId(e.target.value.toUpperCase())}
              className="mt-2 w-full border border-gray-300 rounded-2xl px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
          )}
        </div>

        {/* ── PURPOSE ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Purpose <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2 flex-wrap mb-2">
            {PURPOSE_CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => setPurpose(chip)}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors flex-shrink-0 ${
                  purpose === chip
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                }`}
                style={{ minHeight: '44px' }}
              >
                {chip}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Describe why you're applying this foliar…"
            value={purpose}
            onChange={e => setPurpose(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            style={{ minHeight: '56px' }}
          />
        </div>

        {/* ── OPTIONAL FIELDS ── */}
        <div>
          <button
            onClick={() => setShowOptional(s => !s)}
            className="flex items-center gap-2 text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors"
            style={{ minHeight: '44px' }}
          >
            <span className={`transition-transform ${showOptional ? 'rotate-90' : ''}`}>▶</span>
            {showOptional ? 'Hide optional fields' : 'Show optional fields'}
          </button>

          {showOptional && (
            <div className="mt-3 flex flex-col gap-3">
              {/* Volume */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Volume applied</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    value={volumeApplied}
                    onChange={e => setVolumeApplied(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                    style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  <select
                    value={volumeUnit}
                    onChange={e => setVolumeUnit(e.target.value)}
                    className="border border-gray-300 rounded-2xl px-3 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                    style={{ minHeight: '56px' }}
                  >
                    {VOLUME_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Applied at */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Applied at</label>
                <input
                  type="datetime-local"
                  value={appliedAt}
                  onChange={e => setAppliedAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{ minHeight: '56px' }}
                />
              </div>

              {/* Temps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Ambient temp (°F)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="—"
                    value={ambientTempF}
                    onChange={e => { setAmbientTempF(e.target.value); setTempEdited(true); }}
                    className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                    style={{ minHeight: '56px' }}
                  />
                  {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={tempEdited} />}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">RH (%)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="0"
                    max="100"
                    placeholder="—"
                    value={ambientRh}
                    onChange={e => { setAmbientRh(e.target.value); setRhEdited(true); }}
                    className="w-full border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                    style={{ minHeight: '56px' }}
                  />
                  {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={rhEdited} />}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Notes</label>
                <textarea
                  placeholder="Additional observations…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
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

        {pendingSync && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700 font-medium">
            ⏱ Saved locally — will sync when connection is restored
          </div>
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {saveError}
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
              saveFlash
                ? 'bg-green-500 scale-[0.99]'
                : canSave && !saving
                  ? 'bg-green-800 hover:bg-green-900 active:bg-green-950'
                  : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ minHeight: '64px', fontSize: '1.05rem' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Saving…
              </span>
            ) : 'Save Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchCard({ batch }) {
  return (
    <div className="bg-white border-2 border-green-300 rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Fraunces, serif' }}>
          {batch.strain_name}
        </span>
        {batch.sub_zone_id && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {batch.sub_zone_id}
          </span>
        )}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
      </div>
      <div className="text-xs text-gray-500">
        Day {batch.days_in_stage ?? 0} · {batch.plant_count_current ?? batch.plant_count_initial} plants
      </div>
    </div>
  );
}
