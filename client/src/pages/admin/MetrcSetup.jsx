import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const TABS = ['Reference Data', 'Sublocations', 'Tag Pools', 'Employees', 'Additive Templates', 'Tag Sync', 'Downloads'];

const UOM_TYPES = ['weight', 'volume', 'count', 'area', 'length', 'other'];

// ── Shared components ─────────────────────────────────────────────────────────

function SectionHeader({ title, description }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
  );
}

function ItemRow({ label, sub, onDelete }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-2">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-800">{label}</span>
        {sub && <span className="ml-2 text-xs text-gray-400">{sub}</span>}
      </div>
      <button
        onClick={onDelete}
        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded"
        style={{ minHeight: '36px' }}
      >
        Remove
      </button>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="px-4 py-6 text-center text-sm text-gray-400">{text}</div>;
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      {message}
    </div>
  );
}

// ── Simple name-only reference section ────────────────────────────────────────

function SimpleRefSection({ title, description, items, idKey, loading, onRefresh, onAdd, onDelete, extraFields }) {
  const [newName, setNewName] = useState('');
  const [extra, setExtra] = useState({});
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setErr(null);
    try {
      await onAdd({ name: newName.trim(), ...extra });
      setNewName('');
      setExtra({});
      await onRefresh();
    } catch (error) {
      setErr(error.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    try {
      await onDelete(id);
      await onRefresh();
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <div className="mb-6">
      <SectionHeader title={title} description={description} />
      <ErrorBanner message={err} />
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-4 py-4 text-sm text-gray-400">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState text="No items yet" />
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <ItemRow
                key={item[idKey]}
                label={item.name}
                sub={extraFields ? extraFields.map((f) => item[f]).filter(Boolean).join(' · ') : null}
                onDelete={() => handleDelete(item[idKey])}
              />
            ))}
          </div>
        )}
        <form
          onSubmit={handleAdd}
          className="flex gap-2 p-3 border-t border-gray-100 bg-gray-50"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add new…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            style={{ minHeight: '40px' }}
            required
          />
          {extraFields?.includes('unit_type') && (
            <select
              value={extra.unit_type || 'weight'}
              onChange={(e) => setExtra((prev) => ({ ...prev, unit_type: e.target.value }))}
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '40px' }}
            >
              {UOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {extraFields?.includes('category') && (
            <input
              type="text"
              value={extra.category || ''}
              onChange={(e) => setExtra((prev) => ({ ...prev, category: e.target.value || null }))}
              placeholder="Category (opt.)"
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '40px' }}
            />
          )}
          <button
            type="submit"
            disabled={adding}
            className="px-3 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50"
            style={{ minHeight: '40px' }}
          >
            {adding ? '…' : 'Add'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Tab 1: Reference Data ─────────────────────────────────────────────────────

function RefDataTab() {
  const [wasteMethods, setWasteMethods] = useState([]);
  const [plantWasteReasons, setPlantWasteReasons] = useState([]);
  const [batchWasteReasons, setBatchWasteReasons] = useState([]);
  const [adjustmentReasons, setAdjustmentReasons] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wm, pwr, bwr, ar, u, it] = await Promise.all([
        api.getMetrcWasteMethods(),
        api.getMetrcPlantWasteReasons(),
        api.getMetrcBatchWasteReasons(),
        api.getMetrcAdjustmentReasons(),
        api.getMetrcUnitsOfMeasure(),
        api.getMetrcItems(),
      ]);
      setWasteMethods(wm);
      setPlantWasteReasons(pwr);
      setBatchWasteReasons(bwr);
      setAdjustmentReasons(ar);
      setUoms(u);
      setItems(it);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-5">
        Populate these lookup tables from your MN METRC account's dropdown values. Values must match
        exactly what METRC shows in its UI.
      </p>

      <SimpleRefSection
        title="Plant Waste Methods"
        description="How cannabis material is mixed/disposed (e.g. Compost, Grinder, Clipping)"
        items={wasteMethods}
        idKey="method_id"
        loading={loading}
        onRefresh={load}
        onAdd={(d) => api.createMetrcWasteMethod(d)}
        onDelete={(id) => api.deleteMetrcWasteMethod(id)}
      />

      <SimpleRefSection
        title="Plant Waste Reasons"
        description="Why individually tagged plants are being wasted (e.g. Trim, Waste, Destroy)"
        items={plantWasteReasons}
        idKey="reason_id"
        loading={loading}
        onRefresh={load}
        onAdd={(d) => api.createMetrcPlantWasteReason(d)}
        onDelete={(id) => api.deleteMetrcPlantWasteReason(id)}
      />

      <SimpleRefSection
        title="Batch Waste Reasons"
        description="Why immature batch plant material is being wasted (may differ from plant waste reasons)"
        items={batchWasteReasons}
        idKey="reason_id"
        loading={loading}
        onRefresh={load}
        onAdd={(d) => api.createMetrcBatchWasteReason(d)}
        onDelete={(id) => api.deleteMetrcBatchWasteReason(id)}
      />

      <SimpleRefSection
        title="Package Adjustment Reasons"
        description="Why a package quantity is being adjusted (e.g. Drying, Scale Variance, Spillage)"
        items={adjustmentReasons}
        idKey="reason_id"
        loading={loading}
        onRefresh={load}
        onAdd={(d) => api.createMetrcAdjustmentReason(d)}
        onDelete={(id) => api.deleteMetrcAdjustmentReason(id)}
      />

      <SimpleRefSection
        title="Units of Measure"
        description="From MN METRC GET /unitsofmeasure/v2/active — must match exact spelling"
        items={uoms}
        idKey="uom_id"
        loading={loading}
        onRefresh={load}
        onAdd={(d) => api.createMetrcUnitOfMeasure(d)}
        onDelete={(id) => api.deleteMetrcUnitOfMeasure(id)}
        extraFields={['unit_type']}
      />

      <SimpleRefSection
        title="Items"
        description="METRC item catalog names (e.g. Immature Plants, Buds, Trim) — must match METRC account exactly"
        items={items}
        idKey="item_id"
        loading={loading}
        onRefresh={load}
        onAdd={(d) => api.createMetrcItem(d)}
        onDelete={(id) => api.deleteMetrcItem(id)}
        extraFields={['category']}
      />
    </div>
  );
}

// ── Tab 2: Sublocations ───────────────────────────────────────────────────────

function SublocationsTab() {
  const navigate = useNavigate();
  const [sublocations, setSublocations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', location_id: '' });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subs, tree] = await Promise.all([
        api.getMetrcSublocations(),
        api.getLocationsTree(),
      ]);
      setSublocations(subs);
      // Flatten tree groups into a simple [{location_id, name}] list
      const flat = [];
      for (const group of Object.values(tree.tree ?? tree)) {
        for (const loc of (group || [])) {
          flat.push({ location_id: loc.location_id, name: loc.name, metrc_name: loc.metrc_name });
          for (const sub of (loc.sub_locations || [])) {
            flat.push({ location_id: sub.location_id, name: `  ${sub.name}`, metrc_name: sub.metrc_name });
          }
        }
      }
      setLocations(flat);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setAdding(true);
    setErr(null);
    try {
      await api.createMetrcSublocation({
        name: form.name.trim(),
        location_id: form.location_id ? Number(form.location_id) : null,
      });
      setForm({ name: '', location_id: '' });
      await load();
    } catch (error) {
      setErr(error.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteMetrcSublocation(id);
      await load();
    } catch (error) {
      setErr(error.message);
    }
  }

  // Group by location
  const grouped = sublocations.reduce((acc, s) => {
    const key = s.location_name || 'No location';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div>
      <p className="text-xs text-gray-500 mb-5">
        METRC sublocations are named areas within a METRC location (room). They differ from
        Cultivate's physical sub-zones. Define names that match your METRC account configuration.
      </p>

      {/* Location metrc_name verification callout */}
      {!loading && locations.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">Verify your METRC location names</div>
              <div className="text-xs text-amber-700 mt-0.5">
                The METRC Name column is written into every CSV — it must match your MN METRC account exactly.
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/locations')}
              className="text-xs font-semibold text-amber-800 underline whitespace-nowrap hover:text-amber-900"
            >
              Edit →
            </button>
          </div>
          <div className="bg-white border-t border-amber-100">
            <div className="flex items-center px-3 py-1.5 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 flex-1">Cultivate Name</span>
              <span className="text-xs font-semibold text-gray-500 w-40 text-right">METRC Name</span>
            </div>
            <div className="divide-y divide-gray-100">
              {locations.map((l) => (
                <div key={l.location_id} className="flex items-center px-3 py-2 gap-4">
                  <span className="text-xs text-gray-600 flex-1">{l.name.trim()}</span>
                  <span className="text-xs font-mono font-medium w-40 text-right">
                    {l.metrc_name
                      ? <span className="text-gray-900">{l.metrc_name}</span>
                      : <span className="text-red-500 italic">not set</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ErrorBanner message={err} />

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl mb-4">
          <EmptyState text="No sublocations yet" />
        </div>
      ) : (
        Object.entries(grouped).map(([locName, subs]) => (
          <div key={locName} className="mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {locName}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
              {subs.map((s) => (
                <ItemRow
                  key={s.sublocation_id}
                  label={s.name}
                  onDelete={() => handleDelete(s.sublocation_id)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-4 mt-2">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Sublocation</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sublocation Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Row 1, Table A, Sublocation 1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '44px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Location <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.location_id}
              onChange={(e) => setForm((p) => ({ ...p, location_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '44px' }}
            >
              <option value="">Select a location…</option>
              {locations.filter(l => !l.name.startsWith('  ')).map((l) => (
                <option key={l.location_id} value={l.location_id}>{l.name}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {adding ? 'Adding…' : 'Add Sublocation'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Tag pool section ──────────────────────────────────────────────────────────

function TagPoolSection({ title, description, prefix, onGetCounts, onImport, onReset }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startNum, setStartNum] = useState('');
  const [count, setCount] = useState('');
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await onGetCounts());
    } catch { /* silent */ }
    setLoading(false);
  }, [onGetCounts]);

  useEffect(() => { load(); }, [load]);

  const startInt = parseInt(startNum, 10);
  const countInt = parseInt(count, 10);
  const rangeValid = !isNaN(startInt) && !isNaN(countInt) && startInt >= 1 && countInt >= 1 && countInt <= 10000;
  const prefixReady = /^[A-Z0-9]{18}$/.test(prefix);

  function generateTags() {
    if (!prefixReady || !rangeValid) return [];
    return Array.from({ length: countInt }, (_, i) => {
      const seq = String(startInt + i).padStart(6, '0');
      return prefix + seq;
    });
  }

  const generatedTags = generateTags();
  const previewTags = generatedTags.slice(0, 3);
  const lastTag = generatedTags.length > 1 ? generatedTags[generatedTags.length - 1] : null;

  async function handleImport(e) {
    e.preventDefault();
    if (generatedTags.length === 0) return;
    setImporting(true);
    setErr(null);
    setImportResult(null);
    try {
      const result = await onImport({ tags: generatedTags });
      setImportResult(result);
      setStartNum('');
      setCount('');
      await load();
    } catch (error) {
      setErr(error.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setErr(null);
    try {
      const result = await onReset();
      setConfirmReset(false);
      setImportResult({ _reset: true, deleted: result.deleted });
      await load();
    } catch (error) {
      setErr(error.message);
    } finally {
      setResetting(false);
    }
  }

  const counts = data?.counts || {};
  const recent = data?.recent || [];

  return (
    <div className="mb-8">
      <SectionHeader title={title} description={description} />

      {/* Counts */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Available', key: 'available', color: 'text-green-700 bg-green-50 border-green-200' },
          { label: 'Reserved', key: 'reserved', color: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'Used', key: 'used', color: 'text-gray-600 bg-gray-50 border-gray-200' },
        ].map(({ label, key, color }) => (
          <div key={key} className={`border rounded-xl p-3 text-center ${color}`}>
            <div className="text-2xl font-bold">{loading ? '…' : (counts[key] ?? 0)}</div>
            <div className="text-xs font-medium mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <ErrorBanner message={err} />

      {importResult && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {importResult._reset
            ? `Cleared ${importResult.deleted} available tags from pool`
            : `Added ${importResult.added} tags · Skipped ${importResult.skipped} duplicates · Total in pool: ${importResult.total_now}`}
        </div>
      )}

      {/* Reset available tags */}
      {(counts.available ?? 0) > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl">
          {!confirmReset ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-red-700">
                Remove all {counts.available} available tags from the pool (reserved and used tags are kept).
              </span>
              <button
                onClick={() => setConfirmReset(true)}
                className="text-xs font-semibold text-red-700 underline whitespace-nowrap hover:text-red-900"
              >
                Clear available tags
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-red-800">
                Delete {counts.available} available tags? This cannot be undone.
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmReset(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50"
                  style={{ minHeight: '32px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
                  style={{ minHeight: '32px' }}
                >
                  {resetting ? 'Clearing…' : 'Yes, clear'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Import Tags</h4>
        {!prefixReady && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Enter and confirm your facility prefix above before importing.
          </p>
        )}
        <form onSubmit={handleImport} className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Starting Number <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={startNum}
                onChange={(e) => setStartNum(e.target.value)}
                placeholder="e.g. 000001"
                min={1}
                disabled={!prefixReady}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-40"
                style={{ minHeight: '44px' }}
              />
              <p className="text-xs text-gray-400 mt-1">Leading zeros added automatically to 6 digits</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Number of Tags <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="e.g. 500"
                min={1}
                max={10000}
                disabled={!prefixReady}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-40"
                style={{ minHeight: '44px' }}
              />
            </div>
          </div>

          {/* Preview */}
          {prefixReady && rangeValid && generatedTags.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="text-xs font-medium text-gray-500 mb-1">Preview — {generatedTags.length} tags</div>
              <div className="font-mono text-xs text-gray-700 space-y-0.5">
                {previewTags.map((t) => <div key={t}>{t}</div>)}
                {lastTag && generatedTags.length > 3 && (
                  <>
                    <div className="text-gray-400">…</div>
                    <div>{lastTag}</div>
                  </>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={importing || !prefixReady || !rangeValid}
            className="px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {importing ? 'Importing…' : generatedTags.length > 0 ? `Import ${generatedTags.length} tags` : 'Import Tags'}
          </button>
        </form>
      </div>

      {/* Full tag pool — sorted, scrollable */}
      {recent.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Tag pool — {recent.length} tags
            </span>
          </div>
          <div className="divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: '480px' }}>
            {recent.map((t) => (
              <div key={t.tag} className="flex items-center justify-between px-4 py-2">
                <span className="font-mono text-xs text-gray-700">{t.tag}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  t.status === 'available'
                    ? 'bg-green-100 text-green-700'
                    : t.status === 'reserved'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Tag Pools ──────────────────────────────────────────────────────────

function TagPoolsTab() {
  const [prefix, setPrefix] = useState('');
  const [confirmPrefix, setConfirmPrefix] = useState('');

  const prefixClean = prefix.trim().toUpperCase();
  const confirmPrefixClean = confirmPrefix.trim().toUpperCase();
  const prefixValid = /^[A-Z0-9]{18}$/.test(prefixClean);
  const prefixMatches = prefixClean === confirmPrefixClean;
  const prefixReady = prefixValid && prefixMatches;

  return (
    <div>
      {/* Shared facility prefix — entered once, used by both plant and package tag imports */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-1">Facility Prefix</h4>
        <p className="text-xs text-gray-500 mb-3">
          The 18-character prefix shared by all your METRC tags. Enter it once and it applies to both plant and package tag imports below.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Prefix <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-gray-400">(18 characters)</span>
            </label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              placeholder="e.g. 1A4FF0100000001000"
              maxLength={18}
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 ${
                prefix && !prefixValid ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              style={{ minHeight: '44px' }}
            />
            {prefix && !prefixValid && (
              <p className="text-xs text-red-600 mt-1">Must be exactly 18 alphanumeric characters ({prefixClean.length}/18)</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Confirm Prefix <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={confirmPrefix}
              onChange={(e) => setConfirmPrefix(e.target.value.toUpperCase())}
              placeholder="Re-enter to confirm"
              maxLength={18}
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 ${
                confirmPrefix && !prefixMatches ? 'border-red-300 bg-red-50'
                  : confirmPrefix && prefixReady ? 'border-green-400 bg-green-50'
                  : 'border-gray-300'
              }`}
              style={{ minHeight: '44px' }}
            />
            {confirmPrefix && !prefixMatches && (
              <p className="text-xs text-red-600 mt-1">Prefixes do not match</p>
            )}
            {prefixReady && (
              <p className="text-xs text-green-700 mt-1">✓ Prefix confirmed — {prefixClean}</p>
            )}
          </div>
        </div>
      </div>

      <TagPoolSection
        title="Plant Tags"
        description="METRC plant tags for individual plant assignment."
        prefix={prefixReady ? prefixClean : ''}
        onGetCounts={api.getMetrcPlantTagCounts}
        onImport={api.importMetrcPlantTags}
        onReset={api.resetMetrcPlantTags}
      />
      <TagPoolSection
        title="Package Tags"
        description="METRC package tags for immature plant packages and harvest packages."
        prefix={prefixReady ? prefixClean : ''}
        onGetCounts={api.getMetrcPackageTagCounts}
        onImport={api.importMetrcPackageTags}
        onReset={api.resetMetrcPackageTags}
      />
    </div>
  );
}

// ── Tab 4: Employees ──────────────────────────────────────────────────────────

function EmployeesTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ license_number: '', name: '', role: '' });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEmployees(await api.getMetrcEmployees());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.license_number.trim() || !form.name.trim()) return;
    setAdding(true);
    setErr(null);
    try {
      await api.createMetrcEmployee({
        license_number: form.license_number.trim(),
        name: form.name.trim(),
        role: form.role.trim() || null,
      });
      setForm({ license_number: '', name: '', role: '' });
      await load();
    } catch (error) {
      setErr(error.message);
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(emp) {
    try {
      await api.updateMetrcEmployee(emp.employee_id, { is_active: emp.is_active ? 0 : 1 });
      await load();
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-5">
        MN OCM employee license numbers for METRC Package Adjustment records (#12). Enter the
        license numbers exactly as they appear in your facility's MN OCM account.
      </p>

      <ErrorBanner message={err} />

      {/* Employee list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        {loading ? (
          <div className="px-4 py-4 text-sm text-gray-400">Loading…</div>
        ) : employees.length === 0 ? (
          <EmptyState text="No employees yet" />
        ) : (
          <div className="divide-y divide-gray-100">
            {employees.map((emp) => (
              <div key={emp.employee_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{emp.name}</span>
                    {emp.role && (
                      <span className="text-xs text-gray-500">{emp.role}</span>
                    )}
                    {!emp.is_active && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-gray-500 mt-0.5">{emp.license_number}</div>
                </div>
                <button
                  onClick={() => toggleActive(emp)}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                    emp.is_active
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                  style={{ minHeight: '36px' }}
                >
                  {emp.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add employee form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Employee</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                License Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.license_number}
                onChange={(e) => setForm((p) => ({ ...p, license_number: e.target.value }))}
                placeholder="e.g. M12345"
                maxLength={50}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Full name"
                maxLength={200}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role (optional)</label>
            <input
              type="text"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              placeholder="e.g. Cultivation Manager"
              maxLength={50}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '44px' }}
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {adding ? 'Adding…' : 'Add Employee'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Tab 5: Additive Templates ─────────────────────────────────────────────────

const ADDITIVE_TYPES = ['Fertilizer', 'Pesticide', 'Other'];
const CATEGORY_OPTIONS = ['Fertilizer', 'Pesticide', 'Fungicide', 'Biocontrol', 'Amendment', 'FoliarNutrient', 'Other'];
const SIGNAL_WORDS = ['', 'CAUTION', 'WARNING', 'DANGER'];
const APPLICATION_DEVICES = [
  'Drip Irrigation',
  'Foliar Spray',
  'Soil Drench',
  'Hose Watering',
  'Root Drench',
  'Top Dress',
  'Soil Amendment',
  'Tank Mix',
  'Broadcast Spreader',
  'Hose-End Sprayer',
  'Hand Application',
];

const DEVICE_SHORT = {
  'Drip Irrigation':   'Drip',
  'Foliar Spray':      'Foliar',
  'Soil Drench':       'Drench',
  'Hose Watering':     'Hose H₂O',
  'Root Drench':       'Root Drench',
  'Top Dress':         'Top Dress',
  'Soil Amendment':    'Soil Amend',
  'Tank Mix':          'Tank Mix',
  'Broadcast Spreader':'Broadcast',
  'Hose-End Sprayer':  'Hose Sprayer',
  'Hand Application':  'Hand',
};

const CATEGORY_COLORS = {
  Fertilizer:    'bg-green-100 text-green-700',
  FoliarNutrient:'bg-teal-100 text-teal-700',
  Pesticide:     'bg-red-100 text-red-700',
  Fungicide:     'bg-orange-100 text-orange-700',
  Biocontrol:    'bg-blue-100 text-blue-700',
  Amendment:     'bg-amber-100 text-amber-700',
  Other:         'bg-gray-100 text-gray-600',
};

function emptyIngredient() { return { name: '', percentage: '' }; }

function emptyAdditiveForm() {
  return {
    name: '', additive_type: 'Fertilizer', product_trade_name: '',
    epa_registration_number: '', note: '', rei_quantity: '', rei_time_unit: '',
    product_supplier: '', application_device: '',
    active_ingredients: [emptyIngredient()],
    // Product catalog fields
    category: '', unit: '', manufacturer: '',
    phi_days: '', phi_days_operational: '', phi_notes: '',
    rei_hours: '', omri_listed: false, restricted_use: false,
    signal_word: '', target_organisms: '', sds_url: '', label_url: '',
  };
}

function DocUploadField({ label, docType, templateId, currentFileName, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await api.uploadAdditiveTemplateDoc(templateId, docType, file);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await api.deleteAdditiveTemplateDoc(templateId, docType);
      onUploaded();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleView() {
    window.open(`/api/metrc/csv/additive-templates/${templateId}/documents/${docType}`, '_blank');
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-2">{label}</label>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {currentFileName ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-xs text-green-800 flex-1 truncate">{currentFileName}</span>
          <button
            type="button"
            onClick={handleView}
            className="text-xs font-medium text-green-700 hover:text-green-900 px-2 py-1 rounded"
            style={{ minHeight: '32px' }}
          >View</button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-xs font-medium text-gray-600 hover:text-gray-800 px-2 py-1 rounded"
            style={{ minHeight: '32px' }}
          >{uploading ? 'Uploading…' : 'Replace'}</button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded"
            style={{ minHeight: '32px' }}
          >✕</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-700 transition-colors disabled:opacity-50"
          style={{ minHeight: '56px' }}
        >
          {uploading ? 'Uploading…' : `Upload ${label} PDF`}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

function TemplateActionSheet({ template, onClose, onEdit, onDuplicate, onDelete, onToggleActive }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const isActive = template.is_active !== 0;

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(template.template_id);
      onClose();
    } catch (e) {
      alert(e.message);
      setDeleting(false);
    }
  }

  async function handleToggleActive() {
    setToggling(true);
    try {
      await onToggleActive(template.template_id, isActive ? 0 : 1);
      onClose();
    } catch (e) {
      alert(e.message);
      setToggling(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50" style={{ paddingBottom: '80px' }}>
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-900 truncate">{template.name}</div>
            {!isActive && <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{template.additive_type}{template.application_device ? ` · ${template.application_device}` : ''}</div>
        </div>
        <div className="px-3 py-3 flex flex-col gap-1">
          {isActive && (
            <button
              onClick={() => { onEdit(template); onClose(); }}
              className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-left text-gray-800 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors"
              style={{ minHeight: '56px' }}
            >
              Edit
            </button>
          )}
          {isActive && (
            <button
              onClick={() => { onDuplicate(template); onClose(); }}
              className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-left text-gray-800 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors"
              style={{ minHeight: '56px' }}
            >
              Duplicate
            </button>
          )}
          <button
            onClick={handleToggleActive}
            disabled={toggling}
            className={`flex items-center gap-4 w-full px-4 py-3 rounded-xl text-left font-medium transition-colors disabled:opacity-50 ${
              isActive
                ? 'text-amber-700 hover:bg-amber-50 active:bg-amber-100'
                : 'text-green-700 hover:bg-green-50 active:bg-green-100'
            }`}
            style={{ minHeight: '56px' }}
          >
            {toggling ? '…' : isActive ? 'Deactivate' : 'Activate'}
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-left text-red-600 font-medium hover:bg-red-50 active:bg-red-100 transition-colors"
              style={{ minHeight: '56px' }}
            >
              Remove
            </button>
          ) : (
            <div className="px-4 py-3 rounded-xl bg-red-50 flex items-center justify-between gap-3" style={{ minHeight: '56px' }}>
              <span className="text-sm font-medium text-red-700">Delete this template?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50"
                  style={{ minHeight: '36px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
                  style={{ minHeight: '36px' }}
                >
                  {deleting ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-full px-4 py-3 rounded-xl text-gray-500 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors mt-1"
            style={{ minHeight: '48px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function AdditiveTemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showProductDetails, setShowProductDetails] = useState(false);
  const [form, setForm] = useState(emptyAdditiveForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [actionSheet, setActionSheet] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [showInactive, setShowInactive] = useState(false);
  const longPressTimer = useRef(null);
  const formRef = useCallback((node) => { if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []); // ref callback — called when form mounts/unmounts

  function load() {
    setLoading(true);
    api.getAdditiveTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.getCatalogSuppliers()
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function updateField(field, value) { setForm((prev) => ({ ...prev, [field]: value })); }
  function addIngredient() { setForm((prev) => ({ ...prev, active_ingredients: [...prev.active_ingredients, emptyIngredient()] })); }
  function removeIngredient(idx) { setForm((prev) => ({ ...prev, active_ingredients: prev.active_ingredients.filter((_, i) => i !== idx) })); }
  function updateIngredient(idx, field, value) {
    setForm((prev) => {
      const updated = [...prev.active_ingredients];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, active_ingredients: updated };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    const ingredients = form.active_ingredients
      .filter((ing) => ing.name.trim() !== '')
      .map((ing) => ({ name: ing.name.trim(), percentage: parseFloat(ing.percentage) || 0 }));
    if (ingredients.length === 0) { setSaveError('At least one active ingredient is required.'); setSaving(false); return; }
    const template = {
      name: form.name.trim(),
      additive_type: form.additive_type,
      product_trade_name: form.product_trade_name.trim() || null,
      epa_registration_number: form.epa_registration_number.trim() || null,
      note: form.note.trim() || null,
      rei_quantity: form.rei_quantity.trim() || null,
      rei_time_unit: form.rei_time_unit.trim() || null,
      product_supplier: form.product_supplier.trim() || null,
      application_device: form.application_device.trim() || null,
      active_ingredients: ingredients,
      // Product catalog fields
      category: form.category || null,
      unit: form.unit.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      phi_days: form.phi_days !== '' ? parseFloat(form.phi_days) : null,
      phi_days_operational: form.phi_days_operational !== '' ? parseFloat(form.phi_days_operational) : null,
      phi_notes: form.phi_notes.trim() || null,
      rei_hours: form.rei_hours !== '' ? parseFloat(form.rei_hours) : null,
      omri_listed: form.omri_listed ? 1 : 0,
      restricted_use: form.restricted_use ? 1 : 0,
      signal_word: form.signal_word || null,
      target_organisms: form.target_organisms.trim() || null,
      sds_url: form.sds_url.trim() || null,
      label_url: form.label_url.trim() || null,
    };
    try {
      if (editingTemplateId) {
        await api.patchAdditiveTemplate(editingTemplateId, template);
        setEditingTemplateId(null);
        setLastResult(null);
      } else {
        const result = await api.createAdditiveTemplates({ templates: [template] });
        setLastResult(result);
      }
      setForm(emptyAdditiveForm());
      setShowForm(false);
      load();
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(templateId) {
    await api.deleteAdditiveTemplate(templateId);
    load();
  }

  async function handleToggleActive(templateId, newValue) {
    await api.patchAdditiveTemplate(templateId, { is_active: newValue });
    load();
  }

  function cycleSort(field) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  }

  const sortedTemplates = [...templates]
    .filter((t) => showInactive || t.is_active !== 0)
    .sort((a, b) => {
      let av = '', bv = '';
      if (sortBy === 'name') { av = a.name ?? ''; bv = b.name ?? ''; }
      else if (sortBy === 'type') { av = a.additive_type ?? ''; bv = b.additive_type ?? ''; }
      else if (sortBy === 'application') { av = a.application_device ?? ''; bv = b.application_device ?? ''; }
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function duplicateTemplate(t) {
    setForm({
      name: `${t.name} (copy)`,
      additive_type: t.additive_type,
      product_trade_name: t.product_trade_name ?? '',
      epa_registration_number: t.epa_registration_number ?? '',
      note: t.note ?? '',
      rei_quantity: t.rei_quantity ?? '',
      rei_time_unit: t.rei_time_unit ?? '',
      product_supplier: t.product_supplier ?? '',
      application_device: t.application_device ?? '',
      active_ingredients: t.active_ingredients.length > 0
        ? t.active_ingredients.map((i) => ({ name: i.name, percentage: String(i.percentage) }))
        : [emptyIngredient()],
      category: t.category ?? '',
      unit: t.unit ?? '',
      manufacturer: t.manufacturer ?? '',
      phi_days: t.phi_days != null ? String(t.phi_days) : '',
      phi_days_operational: t.phi_days_operational != null ? String(t.phi_days_operational) : '',
      phi_notes: t.phi_notes ?? '',
      rei_hours: t.rei_hours != null ? String(t.rei_hours) : '',
      omri_listed: !!t.omri_listed,
      restricted_use: !!t.restricted_use,
      signal_word: t.signal_word ?? '',
      target_organisms: t.target_organisms ?? '',
      sds_url: t.sds_url ?? '',
      label_url: t.label_url ?? '',
      label_file_name: t.label_file_name ?? '',
    });
    setSaveError(null);
    setLastResult(null);
    setShowProductDetails(!!(t.category || t.manufacturer || t.phi_days != null));
    setShowForm(true);
  }

  function editTemplate(t) {
    setForm({
      name: t.name,
      additive_type: t.additive_type,
      product_trade_name: t.product_trade_name ?? '',
      epa_registration_number: t.epa_registration_number ?? '',
      note: t.note ?? '',
      rei_quantity: t.rei_quantity ?? '',
      rei_time_unit: t.rei_time_unit ?? '',
      product_supplier: t.product_supplier ?? '',
      application_device: t.application_device ?? '',
      active_ingredients: t.active_ingredients.length > 0
        ? t.active_ingredients.map((i) => ({ name: i.name, percentage: String(i.percentage) }))
        : [emptyIngredient()],
      category: t.category ?? '',
      unit: t.unit ?? '',
      manufacturer: t.manufacturer ?? '',
      phi_days: t.phi_days != null ? String(t.phi_days) : '',
      phi_days_operational: t.phi_days_operational != null ? String(t.phi_days_operational) : '',
      phi_notes: t.phi_notes ?? '',
      rei_hours: t.rei_hours != null ? String(t.rei_hours) : '',
      omri_listed: !!t.omri_listed,
      restricted_use: !!t.restricted_use,
      signal_word: t.signal_word ?? '',
      target_organisms: t.target_organisms ?? '',
      sds_url: t.sds_url ?? '',
      label_url: t.label_url ?? '',
    });
    setEditingTemplateId(t.template_id);
    setDocsExpanded(false);
    setSaveError(null);
    setLastResult(null);
    setShowProductDetails(!!(t.category || t.manufacturer || t.phi_days != null));
    setShowForm(true);
  }

  function startLongPress(t) {
    longPressTimer.current = setTimeout(() => setActionSheet(t), 600);
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  return (
    <div>
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <span className="font-semibold">Template names must match METRC exactly.</span> These templates are registered
        in METRC's web UI under <em>Reports → Additive Templates</em>. The name you enter here must be identical to
        the name in your MN METRC account — application CSV uploads reference templates by name.
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">
          Manage your product catalog for use in plant and immature plant additive application CSVs.
        </p>
        <button
          onClick={() => { setShowForm((v) => !v); setEditingTemplateId(null); setSaveError(null); setLastResult(null); setShowProductDetails(false); }}
          className="ml-3 px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 transition-colors flex-shrink-0"
          style={{ minHeight: '36px' }}
        >
          {showForm ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {lastResult && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <div className="font-semibold">Template saved</div>
          <div className="mt-1 text-green-600 text-xs">{(lastResult.template_ids ?? []).length} template{(lastResult.template_ids ?? []).length !== 1 ? 's' : ''} saved</div>
        </div>
      )}

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="mb-6 bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">{editingTemplateId ? 'Edit Additive Template' : 'New Additive Template'}</h2>
          {saveError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{saveError}</div>}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Template Name <span className="text-red-500">*</span></label>
              <input type="text" required maxLength={100} value={form.name} onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. Organic Gem Fish Hydrolysate"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Additive Type <span className="text-red-500">*</span></label>
              <select required value={form.additive_type} onChange={(e) => updateField('additive_type', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }}>
                {ADDITIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                EPA Registration Number
                {form.additive_type === 'Pesticide' ? <span className="text-red-500"> *</span> : <span className="text-gray-400 font-normal"> (if applicable)</span>}
              </label>
              <input type="text" required={form.additive_type === 'Pesticide'} maxLength={50} value={form.epa_registration_number}
                onChange={(e) => updateField('epa_registration_number', e.target.value)} placeholder="e.g. 70299-19"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
              {form.additive_type !== 'Pesticide' && <p className="text-xs text-gray-400 mt-1">Required in MN if this product has an EPA registration number.</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product Trade Name</label>
              <input type="text" maxLength={200} value={form.product_trade_name} onChange={(e) => updateField('product_trade_name', e.target.value)}
                placeholder="e.g. Wonder Sprout"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product Supplier</label>
              <select value={form.product_supplier} onChange={(e) => updateField('product_supplier', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }}>
                <option value="">— Select supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
              {suppliers.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No suppliers found — add them in Farmstock.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Application Device</label>
              <select value={form.application_device} onChange={(e) => updateField('application_device', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }}>
                <option value="">— Select device —</option>
                {APPLICATION_DEVICES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">REI Quantity</label>
                <input type="text" maxLength={10} value={form.rei_quantity} onChange={(e) => updateField('rei_quantity', e.target.value)}
                  placeholder="e.g. 4"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">REI Time Unit</label>
                <input type="text" maxLength={50} value={form.rei_time_unit} onChange={(e) => updateField('rei_time_unit', e.target.value)}
                  placeholder="e.g. hours, days"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
              </div>
            </div>
            {((form.rei_quantity.trim() !== '') !== (form.rei_time_unit.trim() !== '')) && (
              <p className="text-xs text-amber-600 -mt-2">REI quantity and time unit must both be filled or both empty.</p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
              <textarea rows={2} value={form.note} onChange={(e) => updateField('note', e.target.value)}
                placeholder="Optional note for METRC"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>

            {/* Collapsible Product Details section */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowProductDetails((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <span className="text-sm font-semibold text-gray-700">Product Details</span>
                <span className="text-xs text-gray-500">{showProductDetails ? '▲ Collapse' : '▼ Expand'}</span>
              </button>
              {showProductDetails && (
                <div className="p-4 grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                      <select value={form.category} onChange={(e) => updateField('category', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }}>
                        <option value="">— Not set —</option>
                        {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                      <input type="text" maxLength={50} value={form.unit} onChange={(e) => updateField('unit', e.target.value)}
                        placeholder="e.g. gal, lb, oz"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer</label>
                    <input type="text" maxLength={200} value={form.manufacturer} onChange={(e) => updateField('manufacturer', e.target.value)}
                      placeholder="e.g. Oregon's Best Organics"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">PHI / REI</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Label PHI (days)</label>
                        <input type="number" inputMode="decimal" min="0" step="0.5" value={form.phi_days}
                          onChange={(e) => updateField('phi_days', e.target.value)} placeholder="e.g. 7"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Operational PHI (days)</label>
                        <input type="number" inputMode="decimal" min="0" step="0.5" value={form.phi_days_operational}
                          onChange={(e) => updateField('phi_days_operational', e.target.value)} placeholder="≥ label PHI"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1">PHI Notes</label>
                      <input type="text" value={form.phi_notes} onChange={(e) => updateField('phi_notes', e.target.value)}
                        placeholder="e.g. No biofoliars after flower week 3"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1">REI Hours (numeric)</label>
                      <input type="number" inputMode="decimal" min="0" step="0.5" value={form.rei_hours}
                        onChange={(e) => updateField('rei_hours', e.target.value)} placeholder="e.g. 4"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                      <p className="text-xs text-gray-400 mt-1">Separate from REI Quantity/Time Unit above, which are used for METRC CSV export.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Signal Word</label>
                      <select value={form.signal_word} onChange={(e) => updateField('signal_word', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }}>
                        {SIGNAL_WORDS.map((w) => <option key={w} value={w}>{w || '— Not set —'}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col justify-end gap-3 pb-0.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.omri_listed} onChange={(e) => updateField('omri_listed', e.target.checked)}
                          className="w-4 h-4 rounded text-green-600" />
                        <span className="text-sm text-gray-700">OMRI Listed</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.restricted_use} onChange={(e) => updateField('restricted_use', e.target.checked)}
                          className="w-4 h-4 rounded text-red-600" />
                        <span className="text-sm text-gray-700">Restricted Use (RUP)</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Target Organisms</label>
                    <input type="text" value={form.target_organisms} onChange={(e) => updateField('target_organisms', e.target.value)}
                      placeholder="e.g. Botrytis, Powdery Mildew, Spider Mites"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SDS URL</label>
                    <input type="url" value={form.sds_url} onChange={(e) => updateField('sds_url', e.target.value)}
                      placeholder="https://…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Product Label URL</label>
                    <input type="url" value={form.label_url} onChange={(e) => updateField('label_url', e.target.value)}
                      placeholder="https://…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                  </div>

                </div>
              )}
            </div>

            {editingTemplateId ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDocsExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition-colors"
                  style={{ minHeight: '48px' }}
                >
                  <span className="text-sm font-semibold text-gray-700">Documents</span>
                  <span className="text-gray-400 text-sm">{docsExpanded ? '▲' : '▼'}</span>
                </button>
                {docsExpanded && (
                  <div className="p-4 grid grid-cols-1 gap-4">
                    <DocUploadField
                      label="Product Label"
                      docType="label"
                      templateId={editingTemplateId}
                      currentFileName={templates.find((t) => t.template_id === editingTemplateId)?.label_file_name ?? null}
                      onUploaded={load}
                    />
                    <DocUploadField
                      label="Safety Data Sheet (SDS)"
                      docType="sds"
                      templateId={editingTemplateId}
                      currentFileName={templates.find((t) => t.template_id === editingTemplateId)?.sds_file_name ?? null}
                      onUploaded={load}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400 px-1">Save the template first to attach documents.</div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">Active Ingredients <span className="text-red-500">*</span></label>
                <button type="button" onClick={addIngredient} className="text-xs text-green-700 font-semibold hover:text-green-900">+ Add row</button>
              </div>
              <div className="space-y-2">
                {form.active_ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input type="text" required={idx === 0} value={ing.name} onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                      placeholder="Ingredient name"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
                    <input type="number" required={idx === 0} min="0" max="100" step="0.01" value={ing.percentage}
                      onChange={(e) => updateIngredient(idx, 'percentage', e.target.value)} placeholder="%"
                      className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      style={{ minHeight: '44px' }} inputMode="decimal" />
                    {form.active_ingredients.length > 1 && (
                      <button type="button" onClick={() => removeIngredient(idx)} className="text-red-400 hover:text-red-600 px-1" aria-label="Remove ingredient">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingTemplateId(null); setSaveError(null); setLastResult(null); setShowProductDetails(false); }}
              className="px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              style={{ minHeight: '56px' }}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-3 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors"
              style={{ minHeight: '56px' }}>
              {saving ? 'Saving…' : editingTemplateId ? 'Save Changes' : 'Save Template'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-4">Loading templates…</div>
      ) : templates.length === 0 && !showForm ? (
        <div className="text-sm text-gray-500 text-center py-6">No templates yet. Click + New Template above.</div>
      ) : templates.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1">
              {[['name', 'Name'], ['type', 'Type'], ['application', 'Application']].map(([field, label]) => (
                <button
                  key={field}
                  onClick={() => cycleSort(field)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    sortBy === field
                      ? 'bg-green-700 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={{ minHeight: '28px' }}
                >
                  {label}{sortBy === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowInactive((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                showInactive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              style={{ minHeight: '28px' }}
            >
              {showInactive ? 'Hiding none' : 'Show inactive'}
            </button>
          </div>
          <div className="text-xs text-gray-400 mb-2">
            {sortedTemplates.length} template{sortedTemplates.length !== 1 ? 's' : ''}
            {!showInactive && templates.filter((t) => t.is_active === 0).length > 0 && (
              <span className="ml-1">· {templates.filter((t) => t.is_active === 0).length} inactive hidden</span>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {sortedTemplates.map((t) => (
              <div
                key={t.template_id}
                className={`px-4 py-3.5 select-none ${t.is_active === 0 ? 'opacity-50' : ''}`}
                onContextMenu={(e) => { e.preventDefault(); setActionSheet(t); }}
                onTouchStart={() => startLongPress(t)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${t.is_active === 0 ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.name}</span>
                      {t.is_active === 0 && <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>}
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        t.additive_type === 'Pesticide' ? 'bg-red-100 text-red-700'
                          : t.additive_type === 'Fertilizer' ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'}`}>
                        {t.additive_type}
                      </span>
                      {t.category && t.category !== t.additive_type && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[t.category] ?? 'bg-gray-100 text-gray-600'}`}>
                          {t.category}
                        </span>
                      )}
                      {t.application_device && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {DEVICE_SHORT[t.application_device] ?? t.application_device}
                        </span>
                      )}
                      {t.unit && (
                        <span className="text-xs text-gray-500">{t.unit}</span>
                      )}
                      <span className="text-xs text-gray-400">{t.active_ingredients.length} ingredient{t.active_ingredients.length !== 1 ? 's' : ''}</span>
                      {(t.label_file_name || t.label_url) && (
                        <a
                          href={t.label_file_name ? `/api/metrc/csv/additive-templates/${t.template_id}/documents/label` : t.label_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          style={{ minHeight: '22px' }}
                          aria-label="Product label"
                        >
                          {t.label_file_name ? 'Label ↓' : 'Label ↗'}
                        </a>
                      )}
                      {(t.sds_file_name || t.sds_url) && (
                        <a
                          href={t.sds_file_name ? `/api/metrc/csv/additive-templates/${t.template_id}/documents/sds` : t.sds_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                          style={{ minHeight: '22px' }}
                          aria-label="Safety data sheet"
                        >
                          {t.sds_file_name ? 'SDS ↓' : 'SDS ↗'}
                        </a>
                      )}
                    </div>
                    {t.product_trade_name && <div className="text-xs text-gray-500 mt-0.5">{t.product_trade_name}</div>}
                    {t.epa_registration_number && <div className="text-xs text-gray-400 mt-0.5">EPA: {t.epa_registration_number}</div>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {t.active_ingredients.map((ing, i) => (
                        <span key={i} className="text-xs text-gray-500">{ing.name} {ing.percentage}%</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="text-xs text-gray-400 whitespace-nowrap mb-1">{new Date(t.created_at).toLocaleDateString()}</div>
                    <button
                      onClick={() => setActionSheet(t)}
                      className="text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
                      style={{ minHeight: '36px', fontSize: '18px', lineHeight: 1 }}
                      aria-label="Actions"
                    >
                      ⋮
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {actionSheet && (
        <TemplateActionSheet
          template={actionSheet}
          onClose={() => setActionSheet(null)}
          onEdit={editTemplate}
          onDuplicate={duplicateTemplate}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
        />
      )}
    </div>
  );
}

// ── Tab 6: Tag Sync ───────────────────────────────────────────────────────────

const SYNC_STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800',
  synced: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  not_required: 'bg-gray-100 text-gray-500',
};

function TagSyncTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState(null);
  const [filterBatch, setFilterBatch] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (filterBatch) params.batch_id = filterBatch;
      const result = await api.getMetrcTagAssignments(params);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    setSelected(new Set());
  }, [filterBatch]);

  useEffect(() => { load(); }, [load]);

  const assignments = data?.assignments ?? [];
  const filtered = filterStatus === 'all'
    ? assignments
    : assignments.filter(a => a.metrc_sync_status === filterStatus);

  const allFilteredIds = filtered.map(a => a.assignment_id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allFilteredIds));
  }

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleMarkSynced() {
    if (selected.size === 0) return;
    setMarking(true); setMarkError(null);
    try {
      const res = await api.markTagAssignmentsSynced({ assignment_ids: Array.from(selected) });
      if (!res.ok) throw new Error(res.data?.error ?? 'Failed to mark synced');
      await load();
    } catch (e) {
      setMarkError(e.message);
    } finally {
      setMarking(false);
    }
  }

  const pendingCount = assignments.filter(a => a.metrc_sync_status === 'pending').length;
  const syncedCount = assignments.filter(a => a.metrc_sync_status === 'synced').length;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Track which METRC plant tag assignments have been manually entered into METRC.
        After entering assignments in METRC, select them here and click "Mark Synced."
      </p>

      {/* Summary chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
          {pendingCount} pending
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          {syncedCount} synced
        </span>
        <button
          onClick={() => api.downloadMetrcTagAssignmentsCsv(filterBatch ? { batch_id: filterBatch } : {})}
          className="ml-auto px-3 py-1 rounded-full text-xs font-semibold bg-green-700 text-white hover:bg-green-800"
        >
          ↓ Download CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input
          type="number"
          placeholder="Batch ID filter…"
          value={filterBatch}
          onChange={e => setFilterBatch(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-36"
        />
        {['pending', 'synced', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filterStatus === s
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {markError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{markError}</div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600 py-4">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">
          {filterStatus === 'pending' ? 'No pending tag assignments.' : 'No assignments match the filter.'}
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          {filterStatus !== 'synced' && (
            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                Select all ({filtered.length})
              </label>
              {selected.size > 0 && (
                <button
                  onClick={handleMarkSynced}
                  disabled={marking}
                  className="px-4 py-1.5 text-xs font-semibold bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
                  style={{ minHeight: '36px' }}
                >
                  {marking ? 'Marking…' : `Mark ${selected.size} synced`}
                </button>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {filtered.map(a => (
              <div key={a.assignment_id} className="px-4 py-3 flex items-center gap-3">
                {filterStatus !== 'synced' && (
                  <input
                    type="checkbox"
                    checked={selected.has(a.assignment_id)}
                    onChange={() => toggleOne(a.assignment_id)}
                    className="rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono font-medium text-gray-900 truncate">
                    {a.metrc_plant_tag}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {a.strain_name} · {a.container_id} · Batch {a.batch_id}
                    {a.metrc_plant_batch_uid && (
                      <span className="ml-1 text-gray-400">({a.metrc_plant_batch_uid.slice(-6)})</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Tagged {a.tagged_at ? new Date(a.tagged_at).toLocaleDateString() : '—'}
                    {a.metrc_synced_at && ` · Synced ${new Date(a.metrc_synced_at).toLocaleDateString()}`}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${SYNC_STATUS_COLORS[a.metrc_sync_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {a.metrc_sync_status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 7: Downloads ──────────────────────────────────────────────────────────

const UPLOAD_TYPE_LABELS = {
  'additive-template': 'Additive Templates (#1)',
  'create-plantings': 'Create Plantings (#2)',
  'plants-waste': 'Plants Waste (#21)',
  'plantings-from-package': 'Plantings from Package (#17)',
  'plantings-from-plant': 'Plantings from Plant (#18)',
  'split-planting': 'Split Planting (#19)',
  'destroy-immature': 'Destroy Immature (#20)',
  'destroy-plants': 'Destroy Plants (#22)',
  'immature-growth-phase': 'Immature Growth Phase (#3)',
  'immature-packages': 'Immature Packages (#4)',
  'immature-waste': 'Immature Waste (#5)',
  'plants-growth-phase': 'Plants Growth Phase (#6)',
  'plants-location': 'Plants Location (#7)',
  'harvest-plants': 'Harvest Plants (#8)',
  'manicure-plants': 'Manicure Plants (#9)',
  'packages-from-harvest': 'Packages from Harvest (#10)',
  'immature-additive-apps': 'Immature Additive Apps (#11)',
  'location-additive-apps': 'Location Additive Apps (#12)',
  'plant-additive-apps': 'Plant Additive Apps (#13)',
  'package-adjustment': 'Package Adjustment (#14)',
  'package-from-veg': 'Package from Veg (#15)',
  'package-planting-from-plant': 'Package Planting from Plant (#16)',
};

function DownloadsTab() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [dlError, setDlError] = useState(null);

  useEffect(() => {
    api.getMetrcCsvUploads()
      .then(setUploads)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(upload) {
    setDlError(null);
    setDownloading(upload.upload_id);
    try {
      const filename = upload.file_path
        ? upload.file_path.split('/').pop().split('\\').pop()
        : `metrc-${upload.upload_type}-${upload.upload_id}.csv`;
      await api.downloadMetrcCsvUpload(upload.upload_id, filename);
    } catch (e) {
      setDlError(`Download failed: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  }

  // Group uploads by date
  const byDate = uploads.reduce((acc, u) => {
    const date = u.generated_at ? u.generated_at.slice(0, 10) : 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(u);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        All generated METRC CSV files. Download a file and upload it to METRC via the Import facility.
        Files are stored on the server — set <code className="bg-gray-100 px-1 rounded">METRC_CSV_OUTPUT_DIR</code> to
        a Railway persistent volume to prevent loss on redeploy.
      </p>

      {dlError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {dlError}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600 py-4">{error}</div>
      ) : uploads.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">No CSV files generated yet.</div>
      ) : (
        <div className="space-y-5">
          {sortedDates.map((date) => (
            <div key={date}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{date}</div>
              <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
                {byDate[date].map((u) => (
                  <div key={u.upload_id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {UPLOAD_TYPE_LABELS[u.upload_type] ?? u.upload_type}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {u.row_count} row{u.row_count !== 1 ? 's' : ''} ·{' '}
                        {u.generated_at ? new Date(u.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        {u.status && u.status !== 'generated' && (
                          <span className="ml-2 text-amber-600 font-medium">{u.status}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(u)}
                      disabled={downloading === u.upload_id}
                      className="px-3 py-1.5 text-xs font-semibold bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors flex-shrink-0"
                      style={{ minHeight: '36px' }}
                    >
                      {downloading === u.upload_id ? 'Downloading…' : '↓ Download'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TAB_SLUGS = ['reference-data', 'sublocations', 'tag-pools', 'employees', 'additive-templates', 'tag-sync', 'downloads'];

export default function MetrcSetup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TAB_SLUGS.indexOf(searchParams.get('tab') ?? '');
  const [tab, setTab] = useState(initialTab >= 0 ? initialTab : 0);

  function handleTabChange(i) {
    setTab(i);
    setSearchParams({ tab: TAB_SLUGS[i] }, { replace: true });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">METRC Setup</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Populate reference data required by all METRC CSV upload types.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => handleTabChange(i)}
            className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex-shrink-0 ${
              tab === i
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <RefDataTab />}
      {tab === 1 && <SublocationsTab />}
      {tab === 2 && <TagPoolsTab />}
      {tab === 3 && <EmployeesTab />}
      {tab === 4 && <AdditiveTemplatesTab />}
      {tab === 5 && <TagSyncTab />}
      {tab === 6 && <DownloadsTab />}
    </div>
  );
}
