import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { api } from '../../api';

const CATEGORIES = [
  { label: 'All', code: '' },
  { label: 'Fertilizers', code: 'FERT' },
  { label: 'Biologicals', code: 'BIOL' },
  { label: 'Amendments', code: 'AMEND' },
  { label: 'Foliar', code: 'FOLIAR' },
  { label: 'Additives', code: 'ADDITIVE' },
  { label: 'Pesticides', code: 'PEST' },
];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ExpiryChip({ expiryDate }) {
  if (!expiryDate) return null;
  const today = new Date();
  const exp = new Date(expiryDate);
  const diffDays = Math.ceil((exp - today) / 86400000);
  if (diffDays < 0) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        Expired
      </span>
    );
  }
  if (diffDays <= 90) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        Exp soon
      </span>
    );
  }
  return null;
}

function ItemBadges({ item }) {
  return (
    <span className="flex gap-1 flex-wrap">
      {item.epa_reg_number && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">EPA</span>
      )}
      {item.omri_listed === 1 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">OMRI</span>
      )}
      {item.restricted_use === 1 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-700 text-white">RUP</span>
      )}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-4 flex items-center gap-3 animate-pulse">
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded w-2/5 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/4" />
      </div>
      <div className="h-5 bg-gray-100 rounded w-20" />
      <div className="h-4 bg-gray-100 rounded w-12" />
    </div>
  );
}

export default function CropInputs() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');

  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (activeCategory) params.category = activeCategory;
    if (debouncedSearch) params.search = debouncedSearch;
    api.getInventory(params)
      .then((data) => { setItems(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [activeCategory, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Crop Inputs
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {loading ? 'Loading…' : `${items.length} input${items.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search inputs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent"
          style={{ minHeight: '48px' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
        {CATEGORIES.map(({ label, code }) => (
          <button
            key={code}
            onClick={() => setActiveCategory(code)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeCategory === code
                ? 'bg-green-800 text-white border-green-800'
                : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
            }`}
            style={{ minHeight: '36px' }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Item list */}
      <div className="flex flex-col gap-2">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
          : items.length === 0
          ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center">
              <p className="text-gray-500 text-sm mb-3">No crop inputs found</p>
              <a
                href="https://farmstock.hatstak.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-800 font-semibold hover:underline"
              >
                View in FarmStock →
              </a>
            </div>
          )
          : items.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(`/inputs/${item.id}`)}
              className="bg-white rounded-2xl border border-gray-200 px-4 py-4 flex items-center gap-3 hover:border-green-400 transition-colors text-left w-full"
              style={{ minHeight: '64px' }}
            >
              {/* Category color dot */}
              <span
                className="shrink-0 w-2.5 h-2.5 rounded-full mt-0.5"
                style={{ backgroundColor: item.category_color || '#9ca3af' }}
              />

              {/* Name + manufacturer */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm leading-snug">
                    {item.name}
                  </span>
                  <ItemBadges item={item} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {item.manufacturer || item.category_name}
                </div>
              </div>

              {/* Category label */}
              <span className="hidden sm:inline text-xs text-gray-500 shrink-0">
                {item.category_name}
              </span>

              {/* Stock / expiry */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  className={`text-sm font-semibold ${
                    Number(item.total_stock) > 0 ? 'text-gray-800' : 'text-gray-400'
                  }`}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {Number(item.total_stock).toFixed(2)} {item.unit}
                </span>
                <ExpiryChip expiryDate={item.earliest_expiry} />
              </div>
            </button>
          ))
        }
      </div>
    </div>
  );
}
