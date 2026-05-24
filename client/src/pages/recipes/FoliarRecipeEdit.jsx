import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

const RATE_UNITS = [
  { value: 'ml_per_gal', label: 'ml/gal' },
  { value: 'ml_per_L', label: 'ml/L' },
  { value: 'tsp_per_gal', label: 'tsp/gal' },
  { value: 'tbsp_per_gal', label: 'tbsp/gal' },
  { value: 'oz_per_gal', label: 'oz/gal' },
  { value: 'g_per_gal', label: 'g/gal' },
  { value: 'g_per_L', label: 'g/L' },
  { value: 'drops_per_gal', label: 'drops/gal' },
];

function emptyIngredient(index) {
  return { _key: Date.now() + index, input_id: '', rate_value: '', rate_unit: 'tsp_per_gal', order_index: index + 1, notes: '' };
}

export default function FoliarRecipeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const isVersioning = !!id;

  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState([emptyIngredient(0)]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const formRef = useRef(null);
  const autoSaveTimer = useRef(null);

  // Load catalog items
  useEffect(() => {
    api.getCatalogItems()
      .then((items) => setCatalogItems(items))
      .catch(() => setCatalogItems([]));
  }, []);

  // Draft persistence
  const saveDraft = useCallback(() => {
    const draftKey = isVersioning
      ? `cv_draft_foliar_recipe_${id}`
      : 'cv_draft_foliar_recipe_new';
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        name, purpose, notes, ingredients,
        savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [id, isVersioning, name, purpose, notes, ingredients]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveDraft]);

  // Load existing recipe when versioning
  useEffect(() => {
    const draftKey = isVersioning
      ? `cv_draft_foliar_recipe_${id}`
      : 'cv_draft_foliar_recipe_new';

    if (!isVersioning) {
      setLoading(false);
      try {
        const raw = localStorage.getItem(draftKey);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft.name) setName(draft.name);
        if (draft.purpose !== undefined) setPurpose(draft.purpose);
        if (draft.notes !== undefined) setNotes(draft.notes);
        if (draft.ingredients && draft.ingredients.length > 0) setIngredients(draft.ingredients);
      } catch { /* ignore */ }
      return;
    }
    api.getFoliarRecipe(id)
      .then((recipe) => {
        setName(recipe.name);
        setPurpose(recipe.purpose ?? '');
        setNotes(recipe.notes ?? '');
        if (recipe.ingredients && recipe.ingredients.length > 0) {
          setIngredients(
            recipe.ingredients.map((ing, i) => ({
              _key: ing.id ?? Date.now() + i,
              input_id: ing.input_id,
              rate_value: String(ing.rate_value),
              rate_unit: ing.rate_unit,
              order_index: ing.order_index ?? i + 1,
              notes: ing.notes ?? '',
            })),
          );
        }
        setLoading(false);
        // Restore in-progress draft on top of API-loaded values
        try {
          const raw = localStorage.getItem(draftKey);
          if (!raw) return;
          const draft = JSON.parse(raw);
          if (draft.purpose !== undefined) setPurpose(draft.purpose);
          if (draft.notes !== undefined) setNotes(draft.notes);
          if (draft.ingredients && draft.ingredients.length > 0) setIngredients(draft.ingredients);
        } catch { /* ignore */ }
      })
      .catch((e) => {
        setLoadError(e.message);
        setLoading(false);
      });
  }, [id, isVersioning]);

  function addIngredient() {
    setIngredients((prev) => [...prev, emptyIngredient(prev.length)]);
  }

  function removeIngredient(key) {
    setIngredients((prev) => prev.filter((i) => i._key !== key));
  }

  function updateIngredient(key, field, value) {
    setIngredients((prev) =>
      prev.map((i) => (i._key === key ? { ...i, [field]: value } : i)),
    );
  }

  function moveIngredient(key, dir) {
    setIngredients((prev) => {
      const idx = prev.findIndex((i) => i._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((item, i) => ({ ...item, order_index: i + 1 }));
    });
  }

  function validate() {
    const errs = {};
    if (!name || name.trim().length === 0) errs.name = 'Recipe name is required';
    if (ingredients.length === 0) errs.ingredients = 'At least one ingredient is required';
    ingredients.forEach((ing, i) => {
      if (!ing.input_id) errs[`ing_product_${i}`] = 'Product required';
      if (!ing.rate_value || isNaN(Number(ing.rate_value))) errs[`ing_rate_${i}`] = 'Valid rate required';
    });
    return errs;
  }

  async function handleSave() {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      formRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const payload = {
      name: name.trim(),
      purpose: purpose.trim() || null,
      notes: notes.trim() || null,
      ingredients: ingredients.map((ing, i) => ({
        input_id: Number(ing.input_id),
        rate_value: Number(ing.rate_value),
        rate_unit: ing.rate_unit,
        order_index: i + 1,
        notes: ing.notes || null,
      })),
    };

    setSaving(true);
    setSaveError('');
    try {
      let result;
      if (isVersioning) {
        result = await api.createFoliarRecipeVersion(id, payload);
      } else {
        result = await api.createFoliarRecipe(payload);
      }
      const draftKey = isVersioning ? `cv_draft_foliar_recipe_${id}` : 'cv_draft_foliar_recipe_new';
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      const dest = isVersioning && result?.foliar_recipe_id
        ? `/recipes/foliar/${result.foliar_recipe_id}`
        : '/recipes/foliar';
      window.location.href = dest;
    } catch (e) {
      setSaveError(e.message);
      setSaving(false);
    }
  }

  const filteredItems = catalogSearch
    ? catalogItems.filter((item) =>
        item.name.toLowerCase().includes(catalogSearch.toLowerCase()),
      )
    : catalogItems;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-gray-500">Loading…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-36" ref={formRef}>
      {/* Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          {isVersioning ? `New Version — ${name}` : 'Create Foliar Recipe'}
        </h1>
        {isVersioning && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            Creating a new version will supersede the current active recipe. The old version is preserved for audit history.
          </p>
        )}
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {saveError}
        </div>
      )}

      {/* Recipe name */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Recipe Name</label>
        {isVersioning ? (
          <div className="py-2.5 px-3 bg-gray-100 rounded-xl text-gray-700 font-semibold" style={{ minHeight: '48px', display: 'flex', alignItems: 'center' }}>
            {name}
          </div>
        ) : (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "Weekly Preventive Foliar" or "Cal-Mag Foliar"'
            className={`w-full rounded-xl border px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
            style={{ minHeight: '56px', fontSize: '15px' }}
          />
        )}
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Purpose */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Purpose
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <input
          type="text"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder='e.g. "Mg deficiency correction", "Weekly preventive IPM spray"'
          className="w-full rounded-xl border border-gray-300 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700"
          style={{ minHeight: '56px', fontSize: '15px' }}
        />
        <p className="text-xs text-gray-400 mt-1">What is this foliar addressing?</p>
      </div>

      {/* Ingredients */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">Ingredients</label>
          <span className="text-xs text-gray-400">{ingredients.length} product{ingredients.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Pesticide notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-800">
          Pesticide-class products (those with an EPA registration number) must be logged via the Pesticide Application form, not here.
        </div>

        {errors.ingredients && (
          <p className="text-red-500 text-xs mb-2">{errors.ingredients}</p>
        )}

        {/* Catalog search — shown when catalog loaded */}
        {catalogItems.length > 0 && (
          <div className="mb-3">
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search catalog…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-700"
            />
          </div>
        )}

        <div className="space-y-3">
          {ingredients.map((ing, idx) => (
            <div key={ing._key} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-medium">#{idx + 1}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveIngredient(ing._key, -1)}
                    disabled={idx === 0}
                    className="px-2 py-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-sm"
                    aria-label="Move up"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveIngredient(ing._key, 1)}
                    disabled={idx === ingredients.length - 1}
                    className="px-2 py-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-sm"
                    aria-label="Move down"
                  >↓</button>
                  <button
                    type="button"
                    onClick={() => removeIngredient(ing._key)}
                    className="px-2 py-1 text-red-400 hover:text-red-600 text-sm font-bold"
                    aria-label="Remove ingredient"
                  >×</button>
                </div>
              </div>

              {/* Product picker */}
              <div className="mb-2">
                <label className="text-xs text-gray-500 mb-1 block">Product</label>
                {catalogItems.length > 0 ? (
                  <select
                    value={ing.input_id}
                    onChange={(e) => updateIngredient(ing._key, 'input_id', e.target.value)}
                    className={`w-full rounded-xl border px-3 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors[`ing_product_${idx}`] ? 'border-red-400' : 'border-gray-300'}`}
                    style={{ minHeight: '48px', fontSize: '14px' }}
                  >
                    <option value="">— Select product —</option>
                    {filteredItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}{item.category_name ? ` (${item.category_name})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    inputMode="numeric"
                    value={ing.input_id}
                    onChange={(e) => updateIngredient(ing._key, 'input_id', e.target.value)}
                    placeholder="Product ID (catalog unavailable)"
                    className={`w-full rounded-xl border px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors[`ing_product_${idx}`] ? 'border-red-400' : 'border-gray-300'}`}
                    style={{ minHeight: '48px', fontSize: '14px' }}
                  />
                )}
                {errors[`ing_product_${idx}`] && (
                  <p className="text-red-500 text-xs mt-0.5">{errors[`ing_product_${idx}`]}</p>
                )}
              </div>

              {/* Rate + unit */}
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Rate</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={ing.rate_value}
                    onChange={(e) => updateIngredient(ing._key, 'rate_value', e.target.value)}
                    placeholder="0.125"
                    className={`w-full rounded-xl border px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors[`ing_rate_${idx}`] ? 'border-red-400' : 'border-gray-300'}`}
                    style={{ minHeight: '48px', fontSize: '16px', fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  {errors[`ing_rate_${idx}`] && (
                    <p className="text-red-500 text-xs mt-0.5">{errors[`ing_rate_${idx}`]}</p>
                  )}
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Unit</label>
                  <select
                    value={ing.rate_unit}
                    onChange={(e) => updateIngredient(ing._key, 'rate_unit', e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700"
                    style={{ minHeight: '48px', fontSize: '14px' }}
                  >
                    {RATE_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
                <input
                  type="text"
                  value={ing.notes}
                  onChange={(e) => updateIngredient(ing._key, 'notes', e.target.value)}
                  placeholder='e.g. "apply to runoff"'
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700"
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addIngredient}
          className="mt-3 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-green-400 hover:text-green-700 transition-colors font-medium"
          style={{ minHeight: '56px' }}
        >
          + Add Ingredient
        </button>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Notes
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes about this recipe…"
          rows={3}
          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-700 resize-none"
        />
      </div>

      {/* Save button — fixed to bottom thumb zone */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-50">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={saving}
            className="flex-none px-5 py-4 bg-gray-100 text-gray-700 rounded-xl font-semibold text-base hover:bg-gray-200 disabled:opacity-50 transition-colors"
            style={{ minHeight: '56px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-4 bg-green-800 text-white rounded-xl font-semibold text-base hover:bg-green-900 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            style={{ minHeight: '56px' }}
          >
            {saving
              ? 'Saving…'
              : isVersioning
              ? 'Save New Version'
              : 'Save Recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}
