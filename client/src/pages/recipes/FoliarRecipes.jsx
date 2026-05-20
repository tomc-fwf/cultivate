import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

export default function FoliarRecipes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  useEffect(() => {
    api.getFoliarRecipes()
      .then((data) => {
        setRecipes(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Foliar Recipes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {recipes.length > 0
              ? `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} · versioned and immutable once approved`
              : 'Repeat foliar spray mixes'}
          </p>
        </div>
        {isSupervisor && (
          <button
            onClick={() => navigate('/recipes/foliar/new')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 transition-colors shrink-0"
            style={{ minHeight: '44px' }}
          >
            + New Recipe
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {recipes.length === 0 && !error && (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-10 flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500 text-base">No foliar recipes yet</p>
          <p className="text-gray-400 text-sm max-w-sm">
            Foliar recipes define repeat spray mixes — e.g. "Weekly Preventive Foliar" or "Cal-Mag Foliar". Single-product foliars don't need a recipe.
          </p>
          {isSupervisor && (
            <button
              onClick={() => navigate('/recipes/foliar/new')}
              className="px-6 py-3 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 transition-colors"
              style={{ minHeight: '48px' }}
            >
              Create First Recipe
            </button>
          )}
        </div>
      )}

      {/* Recipe grid */}
      {recipes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {recipes.map((recipe) => (
            <div
              key={recipe.foliar_recipe_id}
              className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-green-400 transition-colors cursor-pointer"
              onClick={() => navigate(`/recipes/foliar/${recipe.foliar_recipe_id}`)}
              style={{ minHeight: '180px' }}
            >
              <div className="flex items-start justify-between">
                <h2
                  className="text-lg font-bold text-green-900 leading-tight"
                  style={{ fontFamily: 'Fraunces, serif' }}
                >
                  {recipe.name}
                </h2>
                <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full ml-2 shrink-0">
                  v{recipe.version}
                </span>
              </div>

              <div className="flex flex-col gap-1 flex-1">
                {recipe.purpose && (
                  <p className="text-sm text-gray-600 line-clamp-1">{recipe.purpose}</p>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  {recipe.ingredient_count ?? 0} ingredient{recipe.ingredient_count !== 1 ? 's' : ''}
                  {recipe.version_count > 1 && ` · ${recipe.version_count} versions`}
                </div>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/recipes/foliar/${recipe.foliar_recipe_id}`); }}
                className="w-full py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 transition-colors"
                style={{ minHeight: '44px' }}
              >
                View Recipe
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
