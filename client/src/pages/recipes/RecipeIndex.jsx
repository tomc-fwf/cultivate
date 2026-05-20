import { useNavigate } from 'react-router-dom';
import { Droplets, Leaf } from 'lucide-react';

export default function RecipeIndex() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Recipes
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Versioned and immutable once approved</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Fertigation Recipes card */}
        <button
          onClick={() => navigate('/recipes/fertigation')}
          className="w-full bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-5 hover:border-green-400 transition-colors text-left"
          style={{ minHeight: '80px' }}
        >
          <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <Droplets size={24} className="text-green-800" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>
              Fertigation Recipes
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">7 stage-based nutrient formulas</p>
          </div>
          <span className="text-gray-300 text-xl">›</span>
        </button>

        {/* Foliar Recipes card */}
        <button
          onClick={() => navigate('/recipes/foliar')}
          className="w-full bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-5 hover:border-green-400 transition-colors text-left"
          style={{ minHeight: '80px' }}
        >
          <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <Leaf size={24} className="text-green-800" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>
              Foliar Recipes
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Repeat foliar spray mixes</p>
          </div>
          <span className="text-gray-300 text-xl">›</span>
        </button>
      </div>
    </div>
  );
}
