import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const RECIPE_NAMES = ['BASE', 'SEEDLING', 'AUTO-VEG', 'AUTO-FLOWER', 'PHOTO-VEG', 'PHOTO-FLOWER', 'FLUSH'];

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

export default function FertigationRecipeEdit() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isVersioning = !!id;
  const nameFromQuery = searchParams.get('name')?.toUpperCase() ?? '';

  const [name, setName] = useState(nameFromQuery || RECIPE_NAMES[0]);
  const [ecLow, setEcLow] = useState('');
  const [ecHigh, setEcHigh] = useState('');
  const [phLow, setPhLow] = useState('');
  const [phHigh, setPhHigh] = useState('');
  const [mixingOrder, setMixingOrder] = useState('');
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

  // Load catalog items
  useEffect(() => {
    api.getCatalogItems()
      .then((items) => setCatalogItems(items))
      .catch(() => setCatalogItems([]));
  }, []);

  // Load existing recipe when versioning
  useEffect(() => {
    if (!isVersioning) {
      setLoading(false);
      return;
    }
    api.getFertigationRecipe(id)
      .then((recipe) => {
        setName(recipe.name);
        setEcLow(recipe.ec_target_low != null ? String(recipe.ec_target_low) : '');
        setEcHigh(recipe.ec_target_high != null ? String(recipe.ec_target_high) : '');
        setPhLow(recipe.ph_target_low != null ? String(recipe.ph_target_low) : '');
        setPhHigh(recipe.ph_target_high != null ? String(recipe.ph_target_high) : '');
        setMixingOrder(recipe.mixing_order ?? '');
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
    if (!name) errs.name = 'Recipe name is required';
    if (ecLow && isNaN(Number(ecLow))) errs.ecLow = 'Must be a number';
    if (ecHigh && isNaN(Number(ecHigh))) errs.ecHigh = 'Must be a number';
    if (phLow && isNaN(Number(phLow))) errs.phLow = 'Must be a number';
    if (phHigh && isNaN(Number(phHigh))) errs.phHigh = 'Must be a number';
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
      name,
      ec_target_low: ecLow !== '' ? Number(ecLow) : null,
      ec_target_high: ecHigh !== '' ? Number(ecHigh) : null,
      ph_target_low: phLow !== '' ? Number(phLow) : null,
      ph_target_high: phHigh !== '' ? Number(phHigh) : null,
      mixing_order: mixingOrder || null,
      notes: notes || null,
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
        result = await api.createFertigationRecipeVersion(id, payload);
      } else {
        result = await api.createFertigationRecipe(payload);
      }
      navigate(`/recipes/fertigation/${result.recipe_id}`);
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
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          {isVersioning ? `New Version — ${name}` : 'Create Fertigation Recipe'}
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
          <div className="py-2.5 px-3 bg-gray-100 rounded-xl text-gray-700 font-semibold" style={{ minHeight: '48px' }}>
            {name}
          </div>
        ) : (
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!nameFromQuery}
            className={`w-full rounded-xl border px-3 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-700 ${errors.name ? 'border-red-400' : 'border-gray-300'} ${nameFromQuery ? 'bg-gray-100 text-gray-700' : ''}`}
            style={{ minHeight: '56px', fontSize: '15px' }}
          >
            {RECIPE_NAMES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* EC targets */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">EC Target (mS/cm)</label>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Low</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={ecLow}
              onChange={(e) => setEcLow(e.target.value)}
              placeholder="e.g. 0.4"
              className={`w-full rounded-xl border px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors.ecLow ? 'border-red-400' : 'border-gray-300'}`}
              style={{ minHeight: '56px', fontSize: '16px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            {errors.ecLow && <p className="text-red-500 text-xs mt-1">{errors.ecLow}</p>}
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">High</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={ecHigh}
              onChange={(e) => setEcHigh(e.target.value)}
              placeholder="e.g. 0.5"
              className={`w-full rounded-xl border px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors.ecHigh ? 'border-red-400' : 'border-gray-300'}`}
              style={{ minHeight: '56px', fontSize: '16px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            {errors.ecHigh && <p className="text-red-500 text-xs mt-1">{errors.ecHigh}</p>}
          </div>
        </div>
      </div>

      {/* pH targets */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">pH Target</label>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Low</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={phLow}
              onChange={(e) => setPhLow(e.target.value)}
              placeholder="e.g. 6.0"
              className={`w-full rounded-xl border px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors.phLow ? 'border-red-400' : 'border-gray-300'}`}
              style={{ minHeight: '56px', fontSize: '16px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            {errors.phLow && <p className="text-red-500 text-xs mt-1">{errors.phLow}</p>}
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">High</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={phHigh}
              onChange={(e) => setPhHigh(e.target.value)}
              placeholder="e.g. 6.2"
              className={`w-full rounded-xl border px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-700 ${errors.phHigh ? 'border-red-400' : 'border-gray-300'}`}
              style={{ minHeight: '56px', fontSize: '16px', fontFamily: 'JetBrains Mono, monospace' }}
            />
            {errors.phHigh && <p className="text-red-500 text-xs mt-1">{errors.phHigh}</p>}
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">Ingredients</label>
          <span className="text-xs text-gray-400">{ingredients.length} product{ingredients.length !== 1 ? 's' : ''}</span>
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
                  placeholder='e.g. "Day 9 only"'
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

      {/* Mixing order */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Mixing Order
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <textarea
          value={mixingOrder}
          onChange={(e) => setMixingOrder(e.target.value)}
          placeholder={"1. Add Silica first — adjust pH before other inputs\n2. Add Cal-Mag\n3. Add base nutrients\n4. Adjust pH to target\n5. Measure EC"}
          rows={5}
          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-700 resize-none"
        />
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-50">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-green-800 text-white rounded-xl font-semibold text-base hover:bg-green-900 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
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
