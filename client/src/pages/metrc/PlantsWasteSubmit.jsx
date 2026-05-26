import { useState, useEffect } from 'react';
import { api } from '../../api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyManualEntry() {
  return {
    waste_method_name: '',
    mixed_material: '',
    waste_weight: '',
    unit_of_measure_name: 'grams',
    reason_name: '',
    note: '',
    location_name: '',
    sublocation_name: '',
    waste_date: today(),
    plant_labels_raw: '', // comma-separated 24-char tags
  };
}

export default function PlantsWasteSubmit() {
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Batch METRC settings applied to all checked pending events
  const [batchMethod, setBatchMethod] = useState('');
  const [batchUnit, setBatchUnit] = useState('grams');
  const [batchReason, setBatchReason] = useState('');
  const [batchLocation, setBatchLocation] = useState('');

  // Checked pending event IDs
  const [checked, setChecked] = useState(new Set());

  // Manual entries
  const [manualEntries, setManualEntries] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState(emptyManualEntry());

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    setLoadingPending(true);
    setLoadError(null);
    try {
      const data = await api.getPendingPlantsWaste();
      setPending(data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoadingPending(false);
    }
  }

  function toggleChecked(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === pending.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(pending.map((e) => e.waste_trim_id)));
    }
  }

  function updateNewEntry(field, value) {
    setNewEntry((prev) => ({ ...prev, [field]: value }));
  }

  function addManualEntry() {
    if (!newEntry.waste_method_name.trim() || !newEntry.waste_weight || !newEntry.unit_of_measure_name.trim() || !newEntry.reason_name.trim()) {
      return;
    }
    const tags = newEntry.plant_labels_raw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length === 24);
    setManualEntries((prev) => [
      ...prev,
      {
        waste_method_name: newEntry.waste_method_name.trim(),
        mixed_material: newEntry.mixed_material.trim() || null,
        waste_weight: parseFloat(newEntry.waste_weight),
        unit_of_measure_name: newEntry.unit_of_measure_name.trim(),
        reason_name: newEntry.reason_name.trim(),
        note: newEntry.note.trim() || null,
        location_name: newEntry.location_name.trim() || null,
        sublocation_name: newEntry.sublocation_name.trim() || null,
        waste_date: newEntry.waste_date,
        plant_labels: tags.length > 0 ? tags : undefined,
      },
    ]);
    setNewEntry(emptyManualEntry());
    setShowAddForm(false);
  }

  function removeManualEntry(idx) {
    setManualEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleGenerate() {
    if (checked.size === 0 && manualEntries.length === 0) {
      setSubmitError('Select at least one pending event or add a manual entry.');
      return;
    }
    if (checked.size > 0 && (!batchMethod.trim() || !batchUnit.trim() || !batchReason.trim())) {
      setSubmitError('Set Waste Method, Unit, and Reason for the checked events.');
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    // Build events from checked pending rows
    const checkedEvents = pending
      .filter((e) => checked.has(e.waste_trim_id))
      .map((e) => {
        const wasteDate = e.trimmed_at ? e.trimmed_at.slice(0, 10) : today();
        const tags =
          e.metrc_plant_tag && e.metrc_plant_tag.length === 24 ? [e.metrc_plant_tag] : undefined;
        return {
          waste_method_name: batchMethod.trim(),
          waste_weight: e.wet_weight,
          unit_of_measure_name: batchUnit.trim(),
          reason_name: batchReason.trim(),
          location_name: batchLocation.trim() || null,
          note: e.notes || null,
          waste_date: wasteDate,
          plant_labels: tags,
        };
      });

    const allEvents = [...checkedEvents, ...manualEntries];

    try {
      const res = await api.submitPlantsWaste({ events: allEvents });
      setResult(res);
      setChecked(new Set());
      setManualEntries([]);
      await loadPending();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalRows = checked.size + manualEntries.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Submit Today's Plant Waste</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          METRC upload type #21 — batch end-of-day submission
        </p>
      </div>

      {result && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <div className="font-semibold mb-1">CSV generated successfully</div>
          <div className="font-mono text-xs break-all text-green-700">{result.csv_file_path}</div>
          <div className="mt-1 text-green-600">
            {result.row_count} row{result.row_count !== 1 ? 's' : ''} · Upload ID {result.upload_id}
          </div>
          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Batch METRC settings ──────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Batch METRC settings
          <span className="ml-1 text-xs font-normal text-gray-400">(applies to all checked events)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Waste Method <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={batchMethod}
              onChange={(e) => setBatchMethod(e.target.value)}
              placeholder="e.g. Clipping"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '44px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Unit of Measure <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={batchUnit}
              onChange={(e) => setBatchUnit(e.target.value)}
              placeholder="e.g. grams"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '44px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={batchReason}
              onChange={(e) => setBatchReason(e.target.value)}
              placeholder="e.g. Trim"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '44px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location Name</label>
            <input
              type="text"
              value={batchLocation}
              onChange={(e) => setBatchLocation(e.target.value)}
              placeholder="METRC room name (optional)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '44px' }}
            />
          </div>
        </div>
      </div>

      {/* ── Pending waste events ──────────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Pending waste events
            {!loadingPending && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">
                ({pending.length} unsubmitted)
              </span>
            )}
          </h2>
          {pending.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-xs text-green-700 font-semibold hover:text-green-900"
            >
              {checked.size === pending.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {loadingPending ? (
          <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>
        ) : loadError ? (
          <div className="text-sm text-red-600 py-4">{loadError}</div>
        ) : pending.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center bg-white border border-gray-100 rounded-xl">
            No pending waste events. All caught up, or use "Add Entry" below.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {pending.map((e) => (
              <label
                key={e.waste_trim_id}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
                style={{ minHeight: '56px' }}
              >
                <input
                  type="checkbox"
                  checked={checked.has(e.waste_trim_id)}
                  onChange={() => toggleChecked(e.waste_trim_id)}
                  className="mt-0.5 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">
                      {e.wet_weight} {e.weight_unit}
                    </span>
                    <span className="text-xs text-gray-500">{e.trim_reason}</span>
                    {e.strain_name && (
                      <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">
                        {e.strain_name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                    <span>{e.trimmed_at ? e.trimmed_at.slice(0, 10) : '—'}</span>
                    {e.container_id && <span>{e.container_id}</span>}
                    {e.metrc_plant_tag && (
                      <span className="font-mono">…{e.metrc_plant_tag.slice(-6)}</span>
                    )}
                    <span
                      className={`px-1.5 py-0 rounded-full ${
                        e.waste_status === 'held'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {e.waste_status}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Manual entries ────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Manual entries
            {manualEntries.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">
                ({manualEntries.length})
              </span>
            )}
          </h2>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="text-xs text-green-700 font-semibold hover:text-green-900"
          >
            {showAddForm ? 'Cancel' : '+ Add Entry'}
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Waste Method <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newEntry.waste_method_name}
                  onChange={(e) => updateNewEntry('waste_method_name', e.target.value)}
                  placeholder="e.g. Clipping"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newEntry.reason_name}
                  onChange={(e) => updateNewEntry('reason_name', e.target.value)}
                  placeholder="e.g. Trim"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Weight <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  inputMode="decimal"
                  value={newEntry.waste_weight}
                  onChange={(e) => updateNewEntry('waste_weight', e.target.value)}
                  placeholder="e.g. 15.5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Unit <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newEntry.unit_of_measure_name}
                  onChange={(e) => updateNewEntry('unit_of_measure_name', e.target.value)}
                  placeholder="grams"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Waste Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={newEntry.waste_date}
                  onChange={(e) => updateNewEntry('waste_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Mixed Material
                </label>
                <input
                  type="text"
                  value={newEntry.mixed_material}
                  onChange={(e) => updateNewEntry('mixed_material', e.target.value)}
                  placeholder="e.g. Soil"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Location Name
                </label>
                <input
                  type="text"
                  value={newEntry.location_name}
                  onChange={(e) => updateNewEntry('location_name', e.target.value)}
                  placeholder="METRC room name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sublocation</label>
                <input
                  type="text"
                  value={newEntry.sublocation_name}
                  onChange={(e) => updateNewEntry('sublocation_name', e.target.value)}
                  placeholder="e.g. Row 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Plant Labels
                  <span className="ml-1 font-normal text-gray-400">
                    (24-char tags, comma-separated)
                  </span>
                </label>
                <input
                  type="text"
                  value={newEntry.plant_labels_raw}
                  onChange={(e) => updateNewEntry('plant_labels_raw', e.target.value)}
                  placeholder="ABCDEF012345670000000100, ABCDEF012345670000000101"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Note</label>
                <input
                  type="text"
                  value={newEntry.note}
                  onChange={(e) => updateNewEntry('note', e.target.value)}
                  placeholder="Optional METRC note"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={addManualEntry}
                disabled={
                  !newEntry.waste_method_name.trim() ||
                  !newEntry.waste_weight ||
                  !newEntry.unit_of_measure_name.trim() ||
                  !newEntry.reason_name.trim()
                }
                className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-40 transition-colors"
                style={{ minHeight: '44px' }}
              >
                Add to list
              </button>
            </div>
          </div>
        )}

        {manualEntries.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {manualEntries.map((e, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">
                    {e.waste_weight} {e.unit_of_measure_name} · {e.waste_method_name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex gap-2 flex-wrap">
                    <span>{e.waste_date}</span>
                    <span>{e.reason_name}</span>
                    {e.location_name && <span>{e.location_name}</span>}
                    {e.plant_labels && e.plant_labels.length > 0 && (
                      <span className="font-mono">
                        {e.plant_labels.length} tag{e.plant_labels.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeManualEntry(idx)}
                  className="text-red-400 hover:text-red-600 px-2 text-lg leading-none"
                  aria-label="Remove entry"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Generate CSV button ───────────────────────────────────────── */}
      {submitError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-white via-white/90">
        <button
          onClick={handleGenerate}
          disabled={submitting || totalRows === 0}
          className="w-full py-4 bg-green-700 text-white font-bold rounded-2xl hover:bg-green-800 disabled:opacity-40 transition-colors shadow-lg"
          style={{ minHeight: '64px' }}
        >
          {submitting
            ? 'Generating…'
            : `Generate CSV (${totalRows} row${totalRows !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
}
