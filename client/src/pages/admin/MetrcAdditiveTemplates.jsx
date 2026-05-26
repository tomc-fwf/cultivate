import { useState, useEffect } from 'react';
import { api } from '../../api';

const ADDITIVE_TYPES = ['Fertilizer', 'Pesticide', 'Other'];

function emptyIngredient() {
  return { name: '', percentage: '' };
}

function emptyTemplate() {
  return {
    name: '',
    additive_type: 'Fertilizer',
    product_trade_name: '',
    epa_registration_number: '',
    note: '',
    rei_quantity: '',
    rei_time_unit: '',
    product_supplier: '',
    application_device: '',
    active_ingredients: [emptyIngredient()],
  };
}

export default function MetrcAdditiveTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyTemplate());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAdditiveTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addIngredient() {
    setForm((prev) => ({
      ...prev,
      active_ingredients: [...prev.active_ingredients, emptyIngredient()],
    }));
  }

  function removeIngredient(idx) {
    setForm((prev) => ({
      ...prev,
      active_ingredients: prev.active_ingredients.filter((_, i) => i !== idx),
    }));
  }

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

    if (ingredients.length === 0) {
      setSaveError('At least one active ingredient is required.');
      setSaving(false);
      return;
    }

    const payload = {
      templates: [
        {
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
        },
      ],
    };

    try {
      const result = await api.createAdditiveTemplates(payload);
      setLastResult(result);
      setForm(emptyTemplate());
      setShowForm(false);
      await loadTemplates();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">METRC Additive Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Register products with active ingredient breakdowns for METRC upload type #1.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setSaveError(null); setLastResult(null); }}
          className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors"
          style={{ minHeight: '44px' }}
        >
          {showForm ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {lastResult && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <div className="font-semibold">Template created and CSV generated</div>
          <div className="mt-1 font-mono text-xs break-all text-green-700">{lastResult.csv_file_path}</div>
          <div className="mt-1 text-green-600">{lastResult.row_count} ingredient row{lastResult.row_count !== 1 ? 's' : ''} · Upload ID {lastResult.upload_id}</div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">New Additive Template</h2>

          {saveError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. Organic Gem Fish Hydrolysate"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
            </div>

            {/* Additive Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Additive Type <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={form.additive_type}
                onChange={(e) => updateField('additive_type', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              >
                {ADDITIVE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* EPA Registration Number — shown only for Pesticide */}
            {form.additive_type === 'Pesticide' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  EPA Registration Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required={form.additive_type === 'Pesticide'}
                  maxLength={50}
                  value={form.epa_registration_number}
                  onChange={(e) => updateField('epa_registration_number', e.target.value)}
                  placeholder="e.g. 70299-19"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
            )}

            {/* Product Trade Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product Trade Name</label>
              <input
                type="text"
                maxLength={200}
                value={form.product_trade_name}
                onChange={(e) => updateField('product_trade_name', e.target.value)}
                placeholder="e.g. Wonder Sprout"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
            </div>

            {/* Product Supplier */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product Supplier</label>
              <input
                type="text"
                maxLength={200}
                value={form.product_supplier}
                onChange={(e) => updateField('product_supplier', e.target.value)}
                placeholder="e.g. G Labs"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
            </div>

            {/* Application Device */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Application Device</label>
              <input
                type="text"
                maxLength={200}
                value={form.application_device}
                onChange={(e) => updateField('application_device', e.target.value)}
                placeholder="e.g. Drip system, Backpack sprayer"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ minHeight: '44px' }}
              />
            </div>

            {/* REI — quantity and time unit must be paired */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">REI Quantity</label>
                <input
                  type="text"
                  maxLength={10}
                  value={form.rei_quantity}
                  onChange={(e) => updateField('rei_quantity', e.target.value)}
                  placeholder="e.g. 4"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">REI Time Unit</label>
                <input
                  type="text"
                  maxLength={50}
                  value={form.rei_time_unit}
                  onChange={(e) => updateField('rei_time_unit', e.target.value)}
                  placeholder="e.g. hours, days"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>
            </div>
            {((form.rei_quantity.trim() !== '') !== (form.rei_time_unit.trim() !== '')) && (
              <p className="text-xs text-amber-600 -mt-2">REI quantity and time unit must both be filled or both empty.</p>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
              <textarea
                rows={2}
                value={form.note}
                onChange={(e) => updateField('note', e.target.value)}
                placeholder="Optional note for METRC"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Active Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">
                  Active Ingredients <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={addIngredient}
                  className="text-xs text-green-700 font-semibold hover:text-green-900"
                >
                  + Add row
                </button>
              </div>
              <div className="space-y-2">
                {form.active_ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      required={idx === 0}
                      value={ing.name}
                      onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                      placeholder="Ingredient name"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      style={{ minHeight: '44px' }}
                    />
                    <input
                      type="number"
                      required={idx === 0}
                      min="0"
                      max="100"
                      step="0.01"
                      value={ing.percentage}
                      onChange={(e) => updateIngredient(idx, 'percentage', e.target.value)}
                      placeholder="%"
                      className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      style={{ minHeight: '44px' }}
                      inputMode="decimal"
                    />
                    {form.active_ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeIngredient(idx)}
                        className="text-red-400 hover:text-red-600 px-1"
                        aria-label="Remove ingredient"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors"
              style={{ minHeight: '56px' }}
            >
              {saving ? 'Creating…' : 'Create Template & Generate CSV'}
            </button>
          </div>
        </form>
      )}

      {/* Template list */}
      {loading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading templates…</div>
      ) : error ? (
        <div className="text-sm text-red-600 py-4">{error}</div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">
          No additive templates yet. Create one above.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
          {templates.map((t) => (
            <div key={t.template_id} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
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
                  {t.epa_registration_number && (
                    <div className="text-xs text-gray-400 mt-0.5">EPA: {t.epa_registration_number}</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {t.active_ingredients.map((ing, i) => (
                      <span key={i} className="text-xs text-gray-500">
                        {ing.name} {ing.percentage}%
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(t.created_at).toLocaleDateString()}
                </div>
              </div>
              {t.metrc_csv_file_path && (
                <div className="mt-1.5 font-mono text-xs text-gray-400 break-all">{t.metrc_csv_file_path}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
