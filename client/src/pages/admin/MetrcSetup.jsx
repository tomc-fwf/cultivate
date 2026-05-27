import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const TABS = ['Reference Data', 'Sublocations', 'Tag Pools', 'Employees', 'Additive Templates', 'Downloads'];

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

function emptyIngredient() { return { name: '', percentage: '' }; }

function emptyAdditiveForm() {
  return {
    name: '', additive_type: 'Fertilizer', product_trade_name: '',
    epa_registration_number: '', note: '', rei_quantity: '', rei_time_unit: '',
    product_supplier: '', application_device: '',
    active_ingredients: [emptyIngredient()],
  };
}

function AdditiveTemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyAdditiveForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function load() {
    setLoading(true);
    api.getAdditiveTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

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
    const payload = { templates: [{ name: form.name.trim(), additive_type: form.additive_type,
      product_trade_name: form.product_trade_name.trim() || null, epa_registration_number: form.epa_registration_number.trim() || null,
      note: form.note.trim() || null, rei_quantity: form.rei_quantity.trim() || null, rei_time_unit: form.rei_time_unit.trim() || null,
      product_supplier: form.product_supplier.trim() || null, application_device: form.application_device.trim() || null,
      active_ingredients: ingredients }] };
    try {
      const result = await api.createAdditiveTemplates(payload);
      setLastResult(result); setForm(emptyAdditiveForm()); setShowForm(false); load();
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(templateId) {
    setDeleting(templateId);
    try { await api.deleteAdditiveTemplate(templateId); setConfirmDelete(null); load(); }
    catch (e) { alert(e.message); }
    finally { setDeleting(null); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">
          Register products with active ingredient breakdowns for METRC upload type #1.
        </p>
        <button
          onClick={() => { setShowForm((v) => !v); setSaveError(null); setLastResult(null); }}
          className="ml-3 px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 transition-colors flex-shrink-0"
          style={{ minHeight: '36px' }}
        >
          {showForm ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {lastResult && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <div className="font-semibold">Template created — CSV generated</div>
          <div className="mt-1 text-green-600 text-xs">{lastResult.row_count} ingredient row{lastResult.row_count !== 1 ? 's' : ''} · see Downloads tab to retrieve file</div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">New Additive Template</h2>
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
              <input type="text" maxLength={200} value={form.product_supplier} onChange={(e) => updateField('product_supplier', e.target.value)}
                placeholder="e.g. G Labs"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Application Device</label>
              <input type="text" maxLength={200} value={form.application_device} onChange={(e) => updateField('application_device', e.target.value)}
                placeholder="e.g. Drip system, Backpack sprayer"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" style={{ minHeight: '44px' }} />
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

          <div className="flex justify-end mt-5">
            <button type="submit" disabled={saving}
              className="px-6 py-3 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors"
              style={{ minHeight: '56px' }}>
              {saving ? 'Creating…' : 'Create Template & Generate CSV'}
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
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {templates.map((t) => (
              <div key={t.template_id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        t.additive_type === 'Pesticide' ? 'bg-red-100 text-red-700'
                          : t.additive_type === 'Fertilizer' ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'}`}>
                        {t.additive_type}
                      </span>
                      <span className="text-xs text-gray-400">{t.active_ingredients.length} ingredient{t.active_ingredients.length !== 1 ? 's' : ''}</span>
                    </div>
                    {t.product_trade_name && <div className="text-xs text-gray-500 mt-0.5">{t.product_trade_name}</div>}
                    {t.epa_registration_number && <div className="text-xs text-gray-400 mt-0.5">EPA: {t.epa_registration_number}</div>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {t.active_ingredients.map((ing, i) => (
                        <span key={i} className="text-xs text-gray-500">{ing.name} {ing.percentage}%</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="text-xs text-gray-400 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString()}</div>
                    {confirmDelete === t.template_id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600">Delete?</span>
                        <button onClick={() => handleDelete(t.template_id)} disabled={deleting === t.template_id}
                          className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded disabled:opacity-50">
                          {deleting === t.template_id ? '…' : 'Yes'}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(t.template_id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 6: Downloads ──────────────────────────────────────────────────────────

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

const TAB_SLUGS = ['reference-data', 'sublocations', 'tag-pools', 'employees', 'additive-templates', 'downloads'];

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
      {tab === 5 && <DownloadsTab />}
    </div>
  );
}
