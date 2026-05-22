import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import MixCalculator from '../../components/MixCalculator';
import { CONVERSIONS } from '../../lib/mix-calculator';

export default function MixCalculatorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const recipeTypeParam = searchParams.get('recipe_type') || 'fertigation';
  const recipeIdParam   = searchParams.get('recipe_id')   || '';
  const returnTo        = searchParams.get('return_to')   || '';
  const batchId         = searchParams.get('batch_id')    || '';

  const [recipeType, setRecipeType]       = useState(recipeTypeParam);
  const [fertigationList, setFertigationList] = useState([]);
  const [foliarList, setFoliarList]           = useState([]);
  const [selectedId, setSelectedId]           = useState(recipeIdParam);
  const [recipe, setRecipe]                   = useState(null);
  const [ingredients, setIngredients]         = useState([]);
  const [loadingList, setLoadingList]         = useState(true);
  const [loadingRecipe, setLoadingRecipe]     = useState(false);
  const [listError, setListError]             = useState('');
  const [recipeError, setRecipeError]         = useState('');

  // Load all active recipes on mount
  useEffect(() => {
    Promise.all([
      api.getFertigationRecipes(),
      api.getFoliarRecipes(),
    ])
      .then(([fert, fol]) => {
        setFertigationList((fert ?? []).filter(r => r.active === 1));
        setFoliarList((fol ?? []).filter(r => r.active === 1));
        setLoadingList(false);
      })
      .catch(e => { setListError(e.message); setLoadingList(false); });
  }, []);

  // Load specific recipe + ingredients when selection changes
  useEffect(() => {
    if (!selectedId) { setRecipe(null); setIngredients([]); return; }
    setLoadingRecipe(true);
    setRecipeError('');
    const loader = recipeType === 'fertigation'
      ? () => api.getFertigationRecipe(selectedId)
      : () => api.getFoliarRecipe(selectedId);
    loader()
      .then(data => {
        setRecipe(data);
        setIngredients(data.ingredients ?? []);
        setLoadingRecipe(false);
      })
      .catch(e => { setRecipeError(e.message); setLoadingRecipe(false); });
  }, [selectedId, recipeType]);

  // Reset selected recipe when type changes (unless same type as param)
  function handleTypeChange(type) {
    setRecipeType(type);
    setSelectedId('');
    setRecipe(null);
    setIngredients([]);
  }

  function handleVolumeSelected(gallons) {
    sessionStorage.setItem('cv_calc_volume_gal', String(gallons));
    sessionStorage.setItem('cv_calc_volume_batch_id', batchId);
    if (returnTo === 'fertigation') {
      navigate(`/applications/fertigation/new${batchId ? `?batch_id=${batchId}` : ''}`);
    } else if (returnTo === 'foliar') {
      navigate(`/applications/foliar/new${batchId ? `?batch_id=${batchId}` : ''}`);
    } else {
      navigate(-1);
    }
  }

  const activeList = recipeType === 'fertigation' ? fertigationList : foliarList;

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-screen bg-gray-50">
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
          Mix Calculator
        </h1>
      </div>

      <div className="px-4 py-4 bg-white border-b border-gray-100">
        {/* Recipe type toggle */}
        <div className="flex gap-2 mb-4">
          {[['fertigation', 'Fertigation'], ['foliar', 'Foliar']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => handleTypeChange(val)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                recipeType === val
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
              }`}
              style={{ minHeight: '48px' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Recipe selector */}
        {listError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{listError}</div>
        ) : loadingList ? (
          <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Recipe</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full border border-gray-300 rounded-2xl px-4 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 appearance-none"
              style={{ minHeight: '56px', fontFamily: 'Fraunces, serif' }}
            >
              <option value="">— Select a recipe —</option>
              {activeList.map(r => (
                <option key={r.recipe_id} value={r.recipe_id}>
                  {r.name} v{r.version}
                </option>
              ))}
            </select>
            {activeList.length === 0 && (
              <p className="text-xs text-gray-400 mt-1.5">No active {recipeType} recipes found.</p>
            )}
          </div>
        )}

        {returnTo && (
          <p className="text-xs text-amber-700 mt-2 bg-amber-50 rounded-lg px-3 py-1.5">
            Tap "Use This Volume →" to send the calculated volume back to your application form.
          </p>
        )}
      </div>

      {/* Calculator */}
      {recipeError && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{recipeError}</div>
      )}
      {loadingRecipe && (
        <div className="mx-4 mt-4 flex flex-col gap-3">
          {[80, 60, 120].map((h, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl animate-pulse" style={{ height: `${h}px` }} />
          ))}
        </div>
      )}
      {recipe && !loadingRecipe && (
        <div className="flex-1">
          <MixCalculator
            recipe={recipe}
            ingredients={ingredients}
            initialBatchId={batchId || null}
            onVolumeSelected={returnTo ? handleVolumeSelected : null}
          />
        </div>
      )}
      {!selectedId && !loadingList && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a recipe above to begin
        </div>
      )}
    </div>
  );
}
