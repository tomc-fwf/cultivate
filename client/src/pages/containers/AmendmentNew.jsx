import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_amendment';

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

const AMENDMENT_TYPES = [
  { value: 'top_dress', label: 'Top Dress' },
  { value: 'mix_in', label: 'Mix In' },
  { value: 'drench', label: 'Drench' },
  { value: 'inoculation', label: 'Inoculation' },
  { value: 'media_replacement', label: 'Media Replacement' },
  { value: 'correction', label: 'Correction' },
  { value: 'removal', label: 'Removal' },
  { value: 'other', label: 'Other' },
];

const APPLICATION_METHODS = [
  { value: '', label: '— None —' },
  { value: 'top_dress', label: 'Top Dress' },
  { value: 'mix_in', label: 'Mix In' },
  { value: 'drench', label: 'Drench' },
  { value: 'side_dress', label: 'Side Dress' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'removed', label: 'Removed' },
  { value: 'other', label: 'Other' },
];

const QUANTITY_UNITS = ['lb', 'oz', 'cup', 'tsp', 'tbsp', 'gal', 'L', 'qt', 'g', 'kg', 'ml', 'each'];

const PURPOSE_CHIPS = [
  'pH correction',
  'Nematode inoculation',
  'Mycorrhizae',
  'Compost top dress',
  'Media refresh',
  'Biocontrol',
  'Nutrient correction',
];

const AMENDMENT_CATEGORIES = [
  { label: 'All', code: '' },
  { label: 'Amendments', code: 'AMEND' },
  { label: 'Biologicals', code: 'BIOL' },
  { label: 'Fertilizers', code: 'FERT' },
];

const STATE_CHIP = {
  ready:          'bg-green-100 text-green-800',
  active:         'bg-green-500 text-white',
  empty:          'bg-amber-200 text-amber-900',
  teardown:       'bg-orange-200 text-orange-900',
  startup:        'bg-blue-100 text-blue-800',
  out_of_service: 'bg-gray-200 text-gray-700',
};

const STATE_LABELS = {
  ready: 'Ready', active: 'Active', empty: 'Empty',
  teardown: 'Teardown', startup: 'Startup', out_of_service: 'Out of Service',
};

// ─── Product Picker Sheet ──────────────────────────────────────────────────

function ProductPickerSheet({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('AMEND');
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

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 100); }, []);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex flex-col justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
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
              >✕</button>
            )}
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {AMENDMENT_CATEGORIES.map(c => (
            <button
              key={c.code}
              onClick={() => setCategory(c.code)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                category === c.code
                  ? 'bg-green-800 text-white'
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-green-300'
              }`}
              style={{ minHeight: '36px' }}
            >
              {c.label}
            </button>
          ))}
        </div>
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
                    onClick={() => { if (!isPesticide) { onSelect(item); } }}
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

// ─── Main Component ────────────────────────────────────────────────────────

export default function AmendmentNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const containerIdParam = searchParams.get('container_id');

  // Container state
  const [containerInfo, setContainerInfo] = useState(null);
  const [containerLoading, setContainerLoading] = useState(false);
  const [containerInput, setContainerInput] = useState('');

  // Form fields
  const [amendmentType, setAmendmentType] = useState('');
  const [applicationMethod, setApplicationMethod] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [quantityUnit, setQuantityUnit] = useState('lb');
  const [purpose, setPurpose] = useState('');
  const [appliedAt, setAppliedAt] = useState(toLocalDatetimeString());
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  // Load container when id is provided via URL
  useEffect(() => {
    if (!containerIdParam) return;
    setContainerLoading(true);
    api.getContainer(containerIdParam)
      .then(d => { setContainerInfo(d); setContainerLoading(false); })
      .catch(() => { setContainerInfo(null); setContainerLoading(false); });
  }, [containerIdParam]);

  // Load container when manually typed (debounced)
  useEffect(() => {
    if (containerIdParam) return;
    const cid = containerInput.toUpperCase().trim();
    if (!cid || cid.length < 8) { setContainerInfo(null); return; }
    const t = setTimeout(() => {
      setContainerLoading(true);
      api.getContainer(cid)
        .then(d => { setContainerInfo(d); setContainerLoading(false); })
        .catch(() => { setContainerInfo(null); setContainerLoading(false); });
    }, 500);
    return () => clearTimeout(t);
  }, [containerInput, containerIdParam]);

  // Restore draft
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (!draft || draft.containerIdParam !== containerIdParam) return;
      if (draft.amendmentType) setAmendmentType(draft.amendmentType);
      if (draft.applicationMethod) setApplicationMethod(draft.applicationMethod);
      if (draft.quantity) setQuantity(draft.quantity);
      if (draft.quantityUnit) setQuantityUnit(draft.quantityUnit);
      if (draft.purpose) setPurpose(draft.purpose);
      if (draft.appliedAt) setAppliedAt(draft.appliedAt);
      if (draft.notes) setNotes(draft.notes);
    } catch { /* ignore */ }
  }, [containerIdParam]);

  // Auto-save draft
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        containerIdParam, amendmentType, applicationMethod, quantity, quantityUnit,
        purpose, appliedAt, notes, savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [containerIdParam, amendmentType, applicationMethod, quantity, quantityUnit, purpose, appliedAt, notes]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  const effectiveContainerId = containerIdParam ?? containerInput.toUpperCase().trim();
  const canSave = Boolean(effectiveContainerId) && Boolean(amendmentType);

  async function handleSave() {
    setSaveError('');
    setSaving(true);

    const payload = {
      container_id: effectiveContainerId,
      applied_at: new Date(appliedAt).toISOString(),
      amendment_type: amendmentType,
      application_method: applicationMethod || null,
      input_id: selectedProduct ? selectedProduct.id : null,
      quantity: quantity !== '' ? parseFloat(quantity) : null,
      quantity_unit: quantity !== '' ? quantityUnit : null,
      purpose: purpose.trim() || null,
      notes: notes || null,
    };

    try {
      await api.createContainerAmendment(payload);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }

      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      setToast({ message: 'Saved · Synced', type: 'success' });

      setTimeout(() => {
        if (containerIdParam) {
          navigate(`/containers/${encodeURIComponent(containerIdParam)}`);
        } else {
          navigate('/applications/amendments');
        }
      }, 1400);
    } catch (e) {
      setSaving(false);
      if (e.message?.includes('EPA') || e.message?.includes('Pesticide')) {
        setSaveError(e.message + ' Use the Pesticide Application form instead.');
      } else {
        setSaveError(e.message || 'Failed to save. Please try again.');
      }
    }
  }

  const containerState = containerInfo?.current_state?.current_state;
  const currentBatch = containerInfo?.current_batch;

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {showProductPicker && (
        <ProductPickerSheet
          onSelect={item => { setSelectedProduct(item); setShowProductPicker(false); }}
          onClose={() => setShowProductPicker(false)}
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
          Log Container Amendment
        </h1>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-36 flex flex-col gap-4">

        {/* ── CONTAINER ── */}
        {containerIdParam ? (
          containerLoading ? (
            <div className="h-20 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ) : containerInfo ? (
            <ContainerCard
              containerId={containerIdParam}
              containerState={containerState}
              currentBatch={currentBatch}
            />
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              Container not found: {containerIdParam}
            </div>
          )
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Container ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Z1-A-R3-C12"
              value={containerInput}
              onChange={e => setContainerInput(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-2xl px-4 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            {containerLoading && (
              <div className="text-xs text-gray-400 mt-1 ml-1">Looking up container…</div>
            )}
            {containerInfo && !containerLoading && (
              <div className="mt-2">
                <ContainerCard
                  containerId={containerInput.toUpperCase()}
                  containerState={containerState}
                  currentBatch={currentBatch}
                />
              </div>
            )}
          </div>
        )}

        {/* ── AMENDMENT TYPE ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Amendment Type <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {AMENDMENT_TYPES.map(opt => (
              <button
                key={opt.value}
                onClick={() => setAmendmentType(opt.value)}
                className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition-colors text-left ${
                  amendmentType === opt.value
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

        {/* ── PRODUCT (optional) ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Product <span className="text-gray-300 font-normal normal-case">(optional)</span>
          </label>
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
              <div className="flex items-center justify-between gap-2">
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
                <button
                  onClick={e => { e.stopPropagation(); setSelectedProduct(null); }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0"
                  style={{ minHeight: '40px', minWidth: '40px' }}
                >
                  ×
                </button>
              </div>
            ) : (
              <span className="text-gray-400 font-medium text-sm">Tap to select product (optional) →</span>
            )}
          </button>
        </div>

        {/* ── QUANTITY ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Quantity <span className="text-gray-300 font-normal normal-case">(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="flex-1 border border-gray-300 rounded-2xl px-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              style={{ minHeight: '56px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            <select
              value={quantityUnit}
              onChange={e => setQuantityUnit(e.target.value)}
              className="border border-gray-300 rounded-2xl px-3 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              style={{ minHeight: '56px' }}
            >
              {QUANTITY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* ── PURPOSE ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Purpose <span className="text-gray-300 font-normal normal-case">(optional)</span>
          </label>
          <div className="flex gap-2 flex-wrap mb-2">
            {PURPOSE_CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => setPurpose(purpose === chip ? '' : chip)}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors flex-shrink-0 ${
                  purpose === chip
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                }`}
                style={{ minHeight: '36px' }}
              >
                {chip}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Describe the purpose of this amendment…"
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
              {/* Application method */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Application Method</label>
                <select
                  value={applicationMethod}
                  onChange={e => setApplicationMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{ minHeight: '56px' }}
                >
                  {APPLICATION_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
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

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Notes</label>
                <textarea
                  placeholder="Additional observations or context…"
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
            ) : 'Save Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContainerCard({ containerId, containerState, currentBatch }) {
  return (
    <div className="bg-white border-2 border-green-300 rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-bold text-gray-900 text-base font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {containerId}
        </span>
        {containerState && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_CHIP[containerState] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATE_LABELS[containerState] ?? containerState}
          </span>
        )}
      </div>
      {currentBatch && (
        <div className="text-xs text-gray-500">
          {currentBatch.strain_name}
          {currentBatch.sub_zone_id && ` · ${currentBatch.sub_zone_id}`}
          {currentBatch.status && ` · ${currentBatch.status}`}
        </div>
      )}
    </div>
  );
}
