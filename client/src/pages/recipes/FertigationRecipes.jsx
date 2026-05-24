import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

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

function ContextMenu({ x, y, recipe, onClose, onView, onEdit }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const menuW = 180;
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = y;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1 text-sm"
      style={{ left, top, minWidth: menuW }}
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 mb-1">
        {recipe.name}
      </div>
      <button
        onClick={() => { onClose(); onView(); }}
        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-800 flex items-center gap-2"
        style={{ minHeight: '40px' }}
      >
        View Recipe
      </button>
      {onEdit && (
        <button
          onClick={() => { onClose(); onEdit(); }}
          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-green-800 font-medium flex items-center gap-2"
          style={{ minHeight: '40px' }}
        >
          Edit / New Version
        </button>
      )}
    </div>
  );
}

export default function FertigationRecipes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, recipe }

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  function loadRecipes() {
    setLoading(true);
    setError('');
    api.getFertigationRecipes()
      .then((data) => {
        setRecipes(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadRecipes();
  }, []);

  function handleContextMenu(e, recipe) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, recipe });
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-gray-500">Loading recipes…</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          recipe={contextMenu.recipe}
          onClose={() => setContextMenu(null)}
          onView={() => navigate(`/recipes/fertigation/${contextMenu.recipe.recipe_id}`)}
          onEdit={isSupervisor ? () => navigate(`/recipes/fertigation/${contextMenu.recipe.recipe_id}/version`) : null}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Fertigation Recipes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {recipes.length > 0
              ? `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} · versioned and immutable once approved`
              : 'Nutrient mixes delivered via drip irrigation'}
          </p>
        </div>
        {isSupervisor && (
          <button
            onClick={() => navigate('/recipes/fertigation/new')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 transition-colors shrink-0"
            style={{ minHeight: '44px' }}
          >
            + New Recipe
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadRecipes} className="ml-3 underline text-red-600 hover:text-red-800 text-xs shrink-0">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {recipes.length === 0 && !error && (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-10 flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500 text-base">No fertigation recipes yet</p>
          <p className="text-gray-400 text-sm max-w-sm">
            Fertigation recipes define nutrient mixes applied via drip irrigation — e.g. "Base Feed", "Bloom", "Flush".
          </p>
          {isSupervisor && (
            <button
              onClick={() => navigate('/recipes/fertigation/new')}
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
              key={recipe.recipe_id}
              className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-green-400 transition-colors cursor-pointer"
              onClick={() => navigate(`/recipes/fertigation/${recipe.recipe_id}`)}
              onContextMenu={(e) => handleContextMenu(e, recipe)}
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
          ))}
        </div>
      )}
    </div>
  );
}
