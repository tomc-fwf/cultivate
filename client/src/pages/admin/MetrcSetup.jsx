import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const TABS = ['Reference Data', 'Sublocations', 'Tag Pools', 'Employees', 'Additive Templates'];

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

function TagPoolSection({ title, description, onGetCounts, onImport }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prefix, setPrefix] = useState('');
  const [startNum, setStartNum] = useState('');
  const [count, setCount] = useState('');
  const [importing, setImporting] = useState(false);
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

  // Generate preview tags from prefix + range
  const prefixClean = prefix.trim().toUpperCase();
  const prefixValid = /^[A-Z0-9]{18}$/.test(prefixClean);
  const startInt = parseInt(startNum, 10);
  const countInt = parseInt(count, 10);
  const rangeValid = !isNaN(startInt) && !isNaN(countInt) && startInt >= 1 && countInt >= 1 && countInt <= 10000;

  function generateTags() {
    if (!prefixValid || !rangeValid) return [];
    return Array.from({ length: countInt }, (_, i) => {
      const seq = String(startInt + i).padStart(6, '0');
      return prefixClean + seq;
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
          Added {importResult.added} tags · Skipped {importResult.skipped} duplicates · Total in pool: {importResult.total_now}
        </div>
      )}

      {/* Import form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-1">Import Tags</h4>
        <p className="text-xs text-gray-500 mb-4">
          Enter your 18-character facility prefix, the first tag number in the range, and how many tags to import.
        </p>
        <form onSubmit={handleImport} className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Facility Prefix <span className="text-red-500">*</span>
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
                placeholder="e.g. 1"
                min={1}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
            </div>
          </div>

          {/* Preview */}
          {prefixValid && rangeValid && generatedTags.length > 0 && (
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
            disabled={importing || !prefixValid || !rangeValid}
            className="px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {importing ? 'Importing…' : generatedTags.length > 0 ? `Import ${generatedTags.length} tags` : 'Import Tags'}
          </button>
        </form>
      </div>

      {/* Recent tags */}
      {recent.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Most recent tags
            </span>
          </div>
          <div className="divide-y divide-gray-100">
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
  return (
    <div>
      <TagPoolSection
        title="Plant Tags"
        description="24-character METRC plant tags available for assignment. Import the tag ranges issued to your facility."
        onGetCounts={api.getMetrcPlantTagCounts}
        onImport={api.importMetrcPlantTags}
      />
      <TagPoolSection
        title="Package Tags"
        description="24-character METRC package tags. Used when creating immature plant packages and harvest packages."
        onGetCounts={api.getMetrcPackageTagCounts}
        onImport={api.importMetrcPackageTags}
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

function AdditiveTemplatesTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAdditiveTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Additive templates register products with their active ingredient breakdowns for METRC
        upload type #1. Each template generates a CSV row when created.
      </p>
      <button
        onClick={() => navigate('/admin/metrc-additive-templates')}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors mb-6"
        style={{ minHeight: '56px' }}
      >
        <div className="text-left">
          <div className="text-sm font-semibold text-gray-800">Manage Additive Templates</div>
          <div className="text-xs text-gray-500">Create templates with active ingredients and generate CSV</div>
        </div>
        <span className="text-gray-400">→</span>
      </button>

      {loading ? (
        <div className="text-sm text-gray-400">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-4">No templates created yet.</div>
      ) : (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {templates.length} template{templates.length !== 1 ? 's' : ''} created
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {templates.map((t) => (
              <div key={t.template_id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                    t.additive_type === 'Pesticide'
                      ? 'bg-red-100 text-red-700'
                      : t.additive_type === 'Fertilizer'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {t.additive_type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {t.active_ingredients.length} ingredient{t.active_ingredients.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {t.product_trade_name && (
                  <div className="text-xs text-gray-500 mt-0.5">{t.product_trade_name}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MetrcSetup() {
  const [tab, setTab] = useState(0);

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
            onClick={() => setTab(i)}
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
    </div>
  );
}
