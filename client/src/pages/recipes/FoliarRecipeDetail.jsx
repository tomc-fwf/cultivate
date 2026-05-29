import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const RATE_UNIT_LABELS = {
  ml_per_gal: 'ml/gal',
  ml_per_L: 'ml/L',
  tsp_per_gal: 'tsp/gal',
  tbsp_per_gal: 'tbsp/gal',
  oz_per_gal: 'oz/gal',
  g_per_gal: 'g/gal',
  g_per_L: 'g/L',
  drops_per_gal: 'drops/gal',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FoliarRecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ingredientDocs, setIngredientDocs] = useState({});

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  useEffect(() => {
    api.getFoliarRecipe(id)
      .then((data) => { setRecipe(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (!recipe) return;
    const ings = recipe.ingredients ?? [];
    if (ings.length === 0) return;
    Promise.all(
      ings.map((ing) =>
        api.getAdditiveTemplateDocs(ing.item_name ?? '')
          .then((docs) => ({ name: ing.item_name, docs }))
          .catch(() => ({ name: ing.item_name, docs: { label_url: null, sds_url: null } }))
      )
    ).then((results) => {
      const map = {};
      for (const r of results) { if (r.name) map[r.name] = r.docs; }
      setIngredientDocs(map);
    });
  }, [recipe]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="text-gray-500">Loading recipe…</div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
          {error || 'Recipe not found'}
        </div>
        <button onClick={() => navigate('/recipes/foliar')} className="mt-4 text-green-800 text-sm underline">
          ← Back to foliar recipes
        </button>
      </div>
    );
  }

  const ingredients = recipe.ingredients ?? [];
  const versionHistory = recipe.version_history ?? [];

  /* ── Print card (hidden on screen, visible on print) ──────────────────── */
  const PrintCard = () => (
    <div className="hidden print:block" style={{ background: '#faf6ed', fontFamily: 'Fraunces, serif', color: '#1f3320', padding: '40px', minHeight: '100vh' }}>
      <style>{`
        @media print {
          body { background: #faf6ed !important; }
          @page { margin: 0.75in; }
        }
      `}</style>

      {/* Title */}
      <div style={{ borderBottom: '3px solid #a04727', paddingBottom: '12px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1f3320', margin: 0 }}>{recipe.name}</h1>
        <p style={{ fontSize: '13px', color: '#a04727', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
          Version {recipe.version} · Approved {formatDate(recipe.approved_at)}
        </p>
      </div>

      {/* Purpose banner */}
      {recipe.purpose && (
        <div style={{ background: '#1f3320', color: '#faf6ed', borderRadius: '8px', padding: '12px 20px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', opacity: 0.7, textTransform: 'uppercase' }}>Purpose</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>{recipe.purpose}</div>
        </div>
      )}

      {/* Ingredients table */}
      <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '10px', color: '#1f3320' }}>Ingredients</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #a04727' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a04727' }}>#</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a04727' }}>Product</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a04727' }}>Rate</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a04727' }}>Unit</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a04727' }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map((ing, i) => (
            <tr key={ing.id} style={{ borderBottom: '1px solid #e5dcc8' }}>
              <td style={{ padding: '8px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>{ing.order_index ?? i + 1}</td>
              <td style={{ padding: '8px 8px', fontSize: '14px', fontWeight: '600' }}>{ing.item_name ?? `Product #${ing.input_id}`}</td>
              <td style={{ padding: '8px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', fontWeight: '700', textAlign: 'right' }}>{ing.rate_value}</td>
              <td style={{ padding: '8px 8px', fontSize: '13px', color: '#5a4a3a' }}>{RATE_UNIT_LABELS[ing.rate_unit] ?? ing.rate_unit}</td>
              <td style={{ padding: '8px 8px', fontSize: '12px', color: '#7a6a5a' }}>{ing.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Notes */}
      {recipe.notes && (
        <>
          <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px', color: '#1f3320', borderTop: '1px solid #c9b99a', paddingTop: '12px', marginTop: '16px' }}>Notes</h2>
          <p style={{ fontSize: '13px', color: '#5a4a3a', lineHeight: '1.6' }}>{recipe.notes}</p>
        </>
      )}

      <p style={{ marginTop: '40px', fontSize: '11px', color: '#a04727', borderTop: '1px solid #c9b99a', paddingTop: '8px' }}>
        Cultivate · Fairwater Farm · Printed {new Date().toLocaleDateString('en-US')}
      </p>
    </div>
  );

  /* ── Screen view ──────────────────────────────────────────────────────── */
  return (
    <>
      <PrintCard />

      <div className="print:hidden max-w-3xl mx-auto px-4 py-6 pb-28">
        {/* Back link */}
        <Link to="/recipes/foliar" className="text-sm text-green-800 hover:underline mb-4 inline-block">
          ← All Foliar Recipes
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                {recipe.name}
              </h1>
              <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                v{recipe.version}
              </span>
              {recipe.active === 0 && (
                <span className="bg-gray-200 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                  Superseded
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Approved {formatDate(recipe.approved_at)}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              to={`/recipes/calculator?recipe_type=foliar&recipe_id=${recipe.foliar_recipe_id}`}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-green-300 bg-green-50 rounded-xl text-sm font-medium text-green-800 hover:bg-green-100 transition-colors"
              style={{ minHeight: '44px' }}
            >
              Mix Calculator
            </Link>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              style={{ minHeight: '44px' }}
            >
              Print Recipe Card
            </button>
            {isSupervisor && recipe.active === 1 && (
              <button
                onClick={() => navigate(`/recipes/foliar/${recipe.foliar_recipe_id}/version`)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 transition-colors"
                style={{ minHeight: '44px' }}
              >
                Create New Version
              </button>
            )}
          </div>
        </div>

        {/* Purpose banner */}
        {recipe.purpose && (
          <div className="bg-green-900 text-white rounded-2xl p-4 mb-6">
            <div className="text-xs uppercase tracking-wide text-green-300 mb-0.5">Purpose</div>
            <div className="font-semibold text-base">{recipe.purpose}</div>
          </div>
        )}

        {/* Ingredients */}
        <div className="bg-white rounded-2xl border border-gray-200 mb-4 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Ingredients</h2>
          </div>
          {ingredients.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No ingredients recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-left">Unit</th>
                    <th className="px-4 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ing, i) => {
                    const docs = ingredientDocs[ing.item_name] ?? {};
                    return (
                      <tr key={ing.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {ing.order_index ?? i + 1}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{ing.item_name ?? <span className="text-gray-400">Product #{ing.input_id}</span>}</span>
                            {docs.label_url && (
                              <a href={docs.label_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                style={{ minHeight: '22px' }} aria-label="Product label">Label</a>
                            )}
                            {docs.sds_url && (
                              <a href={docs.sds_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                                style={{ minHeight: '22px' }} aria-label="Safety data sheet">SDS</a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {ing.rate_value}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{RATE_UNIT_LABELS[ing.rate_unit] ?? ing.rate_unit}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{ing.notes ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Notes */}
        {recipe.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4">
            <h2 className="font-semibold text-amber-900 mb-2">Notes</h2>
            <p className="text-sm text-amber-800 leading-relaxed">{recipe.notes}</p>
          </div>
        )}

        {/* Version history */}
        {versionHistory.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Version History</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {versionHistory.map((v) => (
                <div
                  key={v.foliar_recipe_id}
                  className={`px-5 py-3 flex items-center justify-between ${
                    v.foliar_recipe_id === recipe.foliar_recipe_id ? 'bg-green-50' : 'hover:bg-gray-50 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (v.foliar_recipe_id !== recipe.foliar_recipe_id) navigate(`/recipes/foliar/${v.foliar_recipe_id}`);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      v{v.version}
                    </span>
                    {v.active === 1 && (
                      <span className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded font-medium">current</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {v.created_by_name ? `${v.created_by_name} · ` : ''}
                    {formatDate(v.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
