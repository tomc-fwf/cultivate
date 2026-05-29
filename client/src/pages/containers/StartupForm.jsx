import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_startup';

const MEDIA_PCT_CHIPS = [
  { value: 33,  label: '33%' },
  { value: 50,  label: '50%' },
  { value: 100, label: '100%' },
];

const AMENDMENT_METHODS = ['top_dress', 'mix_in', 'drench', 'side_dress'];
const AMENDMENT_UNITS = ['lb', 'oz', 'cup', 'gal', 'tsp'];

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

// ─── Product picker bottom sheet for amendment selection ───────────────────

function AmendmentProductPicker({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = { category: 'AMEND' };
    if (search.trim()) params.search = search.trim();
    api.getInventory(params)
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search]);

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
      <div className="bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[75vh]">
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
        <div className="px-4 pb-3">
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search amendment products…"
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
        <div className="overflow-y-auto flex-1 px-4 pb-24">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">No amendment products found</div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map(item => {
                const isPesticide = Boolean(item.epa_reg_number || item.epa_reg_no);
                return (
                  <button
                    key={item.id}
                    onClick={() => { if (!isPesticide) onSelect(item); }}
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
                            EPA — pesticide
                          </span>
                        )}
                        {item.omri_listed === 1 && !isPesticide && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">OMRI</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{item.manufacturer ?? ''}</div>
                    </div>
                    {item.total_stock != null && (
                      <div className="text-xs font-mono text-gray-500 flex-shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {Number(item.total_stock).toFixed(1)} {item.unit ?? ''}
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

// ─── Main Form ─────────────────────────────────────────────────────────────

export default function StartupForm() {
  const { containerId } = useParams();
  const navigate = useNavigate();

  const [containerData, setContainerData] = useState(null);
  const [soilSamples, setSoilSamples] = useState([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [ctxError, setCtxError] = useState('');

  // Form state — pre-populated from most recent teardown / sample
  const [priorTeardownId, setPriorTeardownId] = useState(null);
  const [priorSoilSampleId, setPriorSoilSampleId] = useState(null);
  const [mediaPct, setMediaPct] = useState(33);
  const [mediaPctCustom, setMediaPctCustom] = useState('');
  const [useCustomPct, setUseCustomPct] = useState(false);
  const [mediaBrand, setMediaBrand] = useState('');
  const [notes, setNotes] = useState('');

  // Pending amendments (local; saved to server on "Begin Startup")
  const [pendingAmendments, setPendingAmendments] = useState([]);
  const [showAddAmendment, setShowAddAmendment] = useState(false);
  const [addProduct, setAddProduct] = useState(null);
  const [addQty, setAddQty] = useState('');
  const [addUnit, setAddUnit] = useState('lb');
  const [addMethod, setAddMethod] = useState('');
  const [addPurpose, setAddPurpose] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(null);

  const autoSaveTimer = useRef(null);

  useEffect(() => {
    Promise.all([api.getContainer(containerId), api.getSoilSamples(containerId)])
      .then(([cd, samples]) => {
        setContainerData(cd);
        setSoilSamples(samples);

        const mostRecentTeardown = cd.teardown_events?.[0];
        const mostRecentSample = samples?.[0];

        if (mostRecentTeardown) setPriorTeardownId(mostRecentTeardown.teardown_id);
        if (mostRecentSample) setPriorSoilSampleId(mostRecentSample.sample_id);

        setLoadingCtx(false);
      })
      .catch(e => { setCtxError(e.message); setLoadingCtx(false); });
  }, [containerId]);

  // Restore draft after context load so pre-populated values can be overridden
  useEffect(() => {
    if (loadingCtx) return;
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(DRAFT_KEY + '_' + containerId)); } catch { return null; }
    })();
    if (saved) {
      if (saved.mediaPct != null) setMediaPct(saved.mediaPct);
      if (saved.useCustomPct != null) setUseCustomPct(saved.useCustomPct);
      if (saved.mediaPctCustom) setMediaPctCustom(saved.mediaPctCustom);
      if (saved.mediaBrand) setMediaBrand(saved.mediaBrand);
      if (saved.notes) setNotes(saved.notes);
    }
  }, [loadingCtx, containerId]);

  function scheduleDraftSave(overrides = {}) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY + '_' + containerId, JSON.stringify({
        mediaPct, useCustomPct, mediaPctCustom, mediaBrand, notes, ...overrides,
      }));
    }, 3000);
  }

  function clearDraft() { localStorage.removeItem(DRAFT_KEY + '_' + containerId); }

  const effectiveMediaPct = useCustomPct
    ? (parseFloat(mediaPctCustom) || null)
    : mediaPct;

  // ─── Amendment helpers ──────────────────────────────────────────────────

  function handleAddAmendment() {
    const amendment = {
      productName: addProduct?.name ?? null,
      input_id: addProduct ? Number(addProduct.id) : null,
      amendment_type: 'amendment',
      quantity: addQty !== '' ? parseFloat(addQty) : null,
      quantity_unit: addUnit,
      application_method: addMethod || null,
      purpose: addPurpose.trim() || null,
    };
    setPendingAmendments(prev => [...prev, amendment]);
    setShowAddAmendment(false);
    setAddProduct(null);
    setAddQty('');
    setAddMethod('');
    setAddPurpose('');
  }

  function removeAmendment(index) {
    setPendingAmendments(prev => prev.filter((_, i) => i !== index));
  }

  // ─── Save ───────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const startup = await api.startStartup(containerId, {
        prior_teardown_id: priorTeardownId ?? null,
        prior_soil_sample_id: priorSoilSampleId ?? null,
        media_replaced_pct: effectiveMediaPct,
        media_brand: mediaBrand.trim() || null,
        notes: notes.trim() || null,
      });

      // Save pending amendments using the startup_id from the newly created event.
      // Container is now in startup state, so container_state='startup' is accurate.
      for (const amendment of pendingAmendments) {
        try {
          await api.createContainerAmendmentFromStartup(containerId, {
            amendment_type: amendment.amendment_type,
            container_state: 'startup',
            startup_id: startup.startup_id,
            soil_sample_id: priorSoilSampleId ?? null,
            input_id: amendment.input_id,
            quantity: amendment.quantity,
            quantity_unit: amendment.quantity_unit,
            application_method: amendment.application_method,
            purpose: amendment.purpose,
            applied_at: new Date().toISOString(),
          });
        } catch {
          // Individual amendment failure does not abort startup
        }
      }

      clearDraft();
      setToast('Startup initiated');
      setTimeout(() => navigate(`/containers/${encodeURIComponent(containerId)}`), 1500);
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);
  }

  // ─── Render ─────────────────────────────────────────────────────────────

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

  const { current_state, teardown_events } = containerData ?? {};
  const currentState = current_state?.current_state;

  if (currentState !== 'teardown') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
          className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900">
          ← {containerId}
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          Startup requires container to be in 'teardown' state. Currently: <strong>{currentState}</strong>
        </div>
      </div>
    );
  }

  const mostRecentTeardown = teardown_events?.[0];
  const mostRecentSample = soilSamples?.[0];

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {showProductPicker && (
        <AmendmentProductPicker
          onSelect={item => { setAddProduct(item); setShowProductPicker(false); }}
          onClose={() => setShowProductPicker(false)}
        />
      )}

      <button
        onClick={() => navigate(`/containers/${encodeURIComponent(containerId)}`)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← {containerId}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Begin Startup
      </h1>
      <div className="text-sm text-gray-500 mb-5">
        <span className="font-mono text-xs">{containerId}</span> · Teardown → Startup
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-5 text-sm text-blue-800">
        Startup transitions the container to <strong>Startup</strong> state. Use this phase for
        media replacement and amendments before planting.
      </div>

      {/* Prior teardown context */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Prior teardown</label>
        {mostRecentTeardown ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
            <span className="text-green-600">✓</span>
            <div>
              <div className="font-medium text-gray-800">Teardown #{mostRecentTeardown.teardown_id}</div>
              <div className="text-xs text-gray-500">Started {fmtDate(mostRecentTeardown.started_at)}</div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            No teardown event found — proceeding without teardown reference.
          </div>
        )}
      </div>

      {/* Prior soil sample context */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Prior soil sample</label>
        {mostRecentSample ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
            <span className="text-green-600">✓</span>
            <div>
              <div className="font-medium text-gray-800">{mostRecentSample.sample_label}</div>
              <div className="text-xs text-gray-500">
                {fmtDate(mostRecentSample.sampled_at)}
                {mostRecentSample.results_received ? ' · Results received' : ' · Results pending'}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            No soil sample found. Recommend logging a soil sample before startup to inform amendment decisions.
          </div>
        )}
      </div>

      {/* Media replaced % */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Media replaced</label>
        <div className="flex gap-2 flex-wrap mb-2">
          {MEDIA_PCT_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => { setMediaPct(chip.value); setUseCustomPct(false); scheduleDraftSave({ mediaPct: chip.value, useCustomPct: false }); }}
              className={`px-5 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                !useCustomPct && mediaPct === chip.value
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              style={{ minHeight: '56px' }}
            >
              {chip.label}
            </button>
          ))}
          <button
            onClick={() => { setUseCustomPct(true); scheduleDraftSave({ useCustomPct: true }); }}
            className={`px-5 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
              useCustomPct
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
            style={{ minHeight: '56px' }}
          >
            Custom
          </button>
        </div>
        {useCustomPct && (
          <input
            type="number"
            min="0"
            max="100"
            inputMode="decimal"
            value={mediaPctCustom}
            onChange={e => { setMediaPctCustom(e.target.value); scheduleDraftSave({ mediaPctCustom: e.target.value }); }}
            placeholder="Enter percentage (0–100)"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{ minHeight: '56px' }}
          />
        )}
      </div>

      {/* Media brand */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Media brand <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={mediaBrand}
          onChange={e => { setMediaBrand(e.target.value); scheduleDraftSave({ mediaBrand: e.target.value }); }}
          placeholder="e.g. Pro-Mix HP, Mother Earth Coco…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          style={{ minHeight: '56px' }}
        />
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); scheduleDraftSave({ notes: e.target.value }); }}
          rows={3}
          placeholder="Amendment plan, notes from soil sample results…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      {/* ── AMENDMENTS SECTION ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-gray-700">Amendments Applied</label>
          {pendingAmendments.length > 0 && (
            <span className="text-xs text-green-700 font-semibold bg-green-100 px-2 py-0.5 rounded-full">
              {pendingAmendments.length} queued
            </span>
          )}
        </div>

        {/* Queued amendments list */}
        {pendingAmendments.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {pendingAmendments.map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate">
                    {a.productName ?? 'Amendment'}
                  </div>
                  <div className="text-xs text-gray-500 flex gap-1 flex-wrap mt-0.5">
                    {a.quantity != null && <span>{a.quantity} {a.quantity_unit}</span>}
                    {a.application_method && <span>· {a.application_method.replace('_', ' ')}</span>}
                    {a.purpose && <span>· {a.purpose}</span>}
                  </div>
                </div>
                <button
                  onClick={() => removeAmendment(i)}
                  className="text-red-400 hover:text-red-600 text-xl leading-none flex-shrink-0"
                  style={{ minHeight: '40px', minWidth: '40px' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Amendment toggle / inline form */}
        {!showAddAmendment ? (
          <button
            onClick={() => setShowAddAmendment(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-green-400 hover:text-green-700 transition-colors"
            style={{ minHeight: '56px' }}
          >
            + Add Amendment
          </button>
        ) : (
          <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50">

            {/* Product picker */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Product <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </label>
              <button
                onClick={() => setShowProductPicker(true)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors text-sm ${
                  addProduct
                    ? 'border-green-400 bg-white'
                    : 'border-dashed border-gray-300 bg-white hover:border-green-300'
                }`}
                style={{ minHeight: '56px' }}
              >
                {addProduct ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{addProduct.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); setAddProduct(null); }}
                      className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >×</button>
                  </div>
                ) : (
                  <span className="text-gray-400">Tap to select product →</span>
                )}
              </button>
            </div>

            {/* Quantity + unit chips */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Quantity
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={addQty}
                  onChange={e => setAddQty(e.target.value)}
                  placeholder="0.0"
                  className="w-24 border border-gray-300 rounded-xl px-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-300"
                  style={{ minHeight: '48px', fontFamily: 'JetBrains Mono, monospace' }}
                />
                <div className="flex gap-1.5 flex-wrap">
                  {AMENDMENT_UNITS.map(u => (
                    <button
                      key={u}
                      onClick={() => setAddUnit(u)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        addUnit === u
                          ? 'bg-green-800 text-white border-green-800'
                          : 'border-gray-300 text-gray-600 bg-white hover:border-green-400'
                      }`}
                      style={{ minHeight: '44px' }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Application method chips */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Method
              </label>
              <div className="flex gap-2 flex-wrap">
                {AMENDMENT_METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setAddMethod(addMethod === m ? '' : m)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      addMethod === m
                        ? 'bg-green-800 text-white border-green-800'
                        : 'border-gray-300 text-gray-600 bg-white hover:border-green-400'
                    }`}
                    style={{ minHeight: '44px' }}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Purpose */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Purpose <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={addPurpose}
                onChange={e => setAddPurpose(e.target.value)}
                placeholder="e.g. pH correction per soil sample"
                className="w-full border border-gray-300 rounded-xl px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300"
                style={{ minHeight: '52px' }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddAmendment}
                className="flex-1 bg-green-700 text-white font-bold text-sm py-3 rounded-xl hover:bg-green-800 active:bg-green-900 transition-colors"
                style={{ minHeight: '56px' }}
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddAmendment(false);
                  setAddProduct(null);
                  setAddQty('');
                  setAddMethod('');
                  setAddPurpose('');
                }}
                className="px-6 border border-gray-300 text-gray-600 text-sm font-medium rounded-xl hover:border-gray-400 transition-colors bg-white"
                style={{ minHeight: '56px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {/* ── END AMENDMENTS SECTION ──────────────────────────────────────────── */}

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {saveError}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-10">
        {pendingAmendments.length > 0 && (
          <div className="text-center text-xs text-green-700 font-medium mb-2">
            {pendingAmendments.length} amendment{pendingAmendments.length !== 1 ? 's' : ''} will be saved with startup
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-700 text-white font-bold text-base py-4 rounded-2xl disabled:opacity-40 hover:bg-blue-800 active:bg-blue-900 transition-colors"
          style={{ minHeight: '64px' }}
        >
          {saving ? 'Starting up…' : 'Begin Startup'}
        </button>
      </div>
    </div>
  );
}
