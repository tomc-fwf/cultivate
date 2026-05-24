import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const RECIPE_ORDER = ['BASE', 'SEEDLING', 'AUTO-VEG', 'AUTO-FLOWER', 'PHOTO-VEG', 'PHOTO-FLOWER', 'FLUSH'];

function ecRange(r) {
  if (r.ec_target_low != null && r.ec_target_high != null)
    return `${r.ec_target_low}–${r.ec_target_high} mS/cm`;
  if (r.ec_target_low != null) return `≥${r.ec_target_low} mS/cm`;
  if (r.ec_target_high != null) return `≤${r.ec_target_high} mS/cm`;
  return null;
}

function phRange(r) {
  if (r.ph_target_low != null && r.ph_target_high != null)
    return `${r.ph_target_low}–${r.ph_target_high}`;
  if (r.ph_target_low != null) return `≥${r.ph_target_low}`;
  if (r.ph_target_high != null) return `≤${r.ph_target_high}`;
  return null;
}

export default function FertigationRecipes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  useEffect(() => {
    api.getFertigationRecipes()
      .then((data) => {
        setRecipes(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // Build a map from the API response keyed by name
  const byName = new Map(recipes.map((r) => [r.name, r]));

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-gray-500">Loading recipes…</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Fertigation Recipes
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">7 recipes · versioned and immutable once approved</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Recipe grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {RECIPE_ORDER.map((name) => {
          const recipe = byName.get(name);
          const hasRecipe = recipe && recipe.recipe_id != null;

          if (hasRecipe) {
            return (
              <div
                key={name}
                className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-green-400 transition-colors cursor-pointer"
                onClick={() => navigate(`/recipes/fertigation/${recipe.recipe_id}`)}
                style={{ minHeight: '180px' }}
              >
                <div className="flex items-start justify-between">
                  <h2
                    className="text-lg font-bold text-green-900 leading-tight"
                    style={{ fontFamily: 'Fraunces, serif' }}
                  >
                    {name}
                  </h2>
                  <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full ml-2 shrink-0">
                    v{recipe.version}
                  </span>
                </div>

                <div className="flex flex-col gap-1 flex-1">
                  {ecRange(recipe) && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">EC</span>
                      <span
                        className="text-green-800 font-semibold"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {ecRange(recipe)}
                      </span>
                    </div>
                  )}
                  {phRange(recipe) && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">pH</span>
                      <span
                        className="text-amber-700 font-semibold"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {phRange(recipe)}
                      </span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {recipe.ingredient_count ?? 0} ingredient{recipe.ingredient_count !== 1 ? 's' : ''}
                    {recipe.version_count > 1 && ` · ${recipe.version_count} versions`}
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/recipes/fertigation/${recipe.recipe_id}`); }}
                  className="w-full py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 transition-colors"
                  style={{ minHeight: '44px' }}
                >
                  View Recipe
                </button>
              </div>
            );
          }

          // No recipe yet
          return (
            <div
              key={name}
              className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-5 flex flex-col gap-3"
              style={{ minHeight: '180px' }}
            >
              <h2
                className="text-lg font-bold text-gray-400 leading-tight"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {name}
              </h2>
              <p className="text-sm text-gray-400 flex-1">Not yet created</p>
              {isSupervisor && (
                <button
                  onClick={() => navigate(`/recipes/fertigation/new?name=${encodeURIComponent(name)}`)}
                  className="w-full py-2.5 bg-white text-green-800 border border-green-300 rounded-xl text-sm font-semibold hover:bg-green-50 transition-colors"
                  style={{ minHeight: '44px' }}
                >
                  Create Recipe
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
