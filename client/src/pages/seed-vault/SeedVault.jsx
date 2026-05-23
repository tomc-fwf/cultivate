import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Plus, Vault } from 'lucide-react';
import { api } from '../../api';

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse" style={{ minHeight: '160px' }}>
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
      <div className="h-2 bg-gray-100 rounded-full w-full mb-3" />
      <div className="flex gap-1.5 mb-3">
        <div className="h-5 bg-gray-100 rounded-full w-16" />
        <div className="h-5 bg-gray-100 rounded-full w-12" />
      </div>
      <div className="h-10 bg-gray-100 rounded-xl w-full" />
    </div>
  );
}

function PackageCard({ pkg, navigate }) {
  const remaining = pkg.seed_count_remaining ?? 0;
  const initial = pkg.seed_count_initial ?? 1;
  const pct = Math.min(100, Math.round((remaining / Math.max(1, initial)) * 100));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-green-300 transition-colors">
      {/* Row 1 — name + badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">
            {pkg.package_name || pkg.lot_number}
          </p>
          <p className="text-xs text-gray-500">{pkg.strain_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            pkg.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
          }`}>
            {pkg.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
          </span>
          {pkg.feminized && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">
              ♀ FEM
            </span>
          )}
        </div>
      </div>

      {/* Row 2 — seed count progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{remaining} seeds remaining</span>
          <span>{initial} initial</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Row 3 — metadata chips */}
      <div className="flex flex-wrap gap-1.5 mb-3 text-[11px]">
        {pkg.metrc_package_id && (
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
            {pkg.metrc_package_id.slice(-8)}
          </span>
        )}
        {pkg.weight_g_initial && (
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {pkg.weight_g_initial}g
          </span>
        )}
        {pkg.supplier && (
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {pkg.supplier}
          </span>
        )}
        {pkg.received_date && (
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {pkg.received_date}
          </span>
        )}
        {pkg.season_year && (
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
            {pkg.season_year}
          </span>
        )}
      </div>

      {/* Row 4 — full METRC package ID */}
      {pkg.metrc_package_id && (
        <p className="text-[10px] font-mono text-gray-400 mb-3 break-all">{pkg.metrc_package_id}</p>
      )}

      {/* Row 5 — action button */}
      <button
        onClick={() => navigate(`/batches/new?seed_package_id=${pkg.package_id}`)}
        className="w-full py-2.5 bg-green-700 text-white rounded-xl text-sm font-semibold hover:bg-green-800 transition-colors"
        style={{ minHeight: '44px' }}
      >
        Use in New Batch →
      </button>
    </div>
  );
}

const FEMINIZED_OPTIONS = [
  { value: false, label: 'No' },
  { value: true, label: 'Yes' },
];

function AddPackageForm({ strains, onSave, onCancel }) {
  const [packageName, setPackageName] = useState('');
  const [strainId, setStrainId] = useState('');
  const [metrcPackageId, setMetrcPackageId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [supplier, setSupplier] = useState('');
  const [sourceDetail, setSourceDetail] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [seasonYear, setSeasonYear] = useState(String(new Date().getFullYear()));
  const [seedCount, setSeedCount] = useState('');
  const [weightG, setWeightG] = useState('');
  const [feminized, setFeminized] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!strainId) { setError('Strain is required'); return; }
    if (!lotNumber.trim()) { setError('Lot number is required'); return; }
    if (!seedCount || Number(seedCount) <= 0) { setError('Seed count must be a positive number'); return; }

    setSaving(true);
    setError('');
    try {
      const pkg = await api.createSeedPackage({
        strain_id: Number(strainId),
        lot_number: lotNumber.trim(),
        package_name: packageName.trim() || null,
        metrc_package_id: metrcPackageId.trim() || null,
        feminized,
        season_year: seasonYear ? Number(seasonYear) : undefined,
        supplier: supplier.trim() || null,
        source_detail: sourceDetail.trim() || null,
        received_date: receivedDate || null,
        seed_count_initial: Number(seedCount),
        weight_g_initial: weightG ? Number(weightG) : null,
        notes: notes.trim() || null,
      });
      onSave(pkg);
    } catch (err) {
      setError(err.message || 'Failed to create seed package');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
      <h3 className="text-sm font-bold text-gray-900 mb-3">New Seed Package</h3>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Package Name</label>
            <input
              type="text"
              value={packageName}
              onChange={e => setPackageName(e.target.value)}
              placeholder="e.g. NL Auto 2026 Batch A"
              className={inputClass}
              style={{ minHeight: '44px' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Strain <span className="text-red-500">*</span>
            </label>
            <select
              value={strainId}
              onChange={e => setStrainId(e.target.value)}
              className={inputClass}
              style={{ minHeight: '44px' }}
              required
            >
              <option value="">Select strain…</option>
              {strains.map(s => (
                <option key={s.strain_id} value={s.strain_id}>
                  {s.name} ({s.type === 'auto' ? 'Auto' : 'Photo'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">METRC Package ID</label>
            <input
              type="text"
              value={metrcPackageId}
              onChange={e => setMetrcPackageId(e.target.value)}
              placeholder="24-char METRC UID"
              className={`${inputClass} font-mono`}
              style={{ minHeight: '44px' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Lot Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lotNumber}
              onChange={e => setLotNumber(e.target.value)}
              placeholder="Lot number from packaging"
              className={inputClass}
              style={{ minHeight: '44px' }}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier / Source</label>
            <input
              type="text"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              placeholder="Breeder or supplier name"
              className={inputClass}
              style={{ minHeight: '44px' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Source Detail</label>
            <input
              type="text"
              value={sourceDetail}
              onChange={e => setSourceDetail(e.target.value)}
              placeholder="URL, invoice #, or notes"
              className={inputClass}
              style={{ minHeight: '44px' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Date Received</label>
            <input
              type="date"
              value={receivedDate}
              onChange={e => setReceivedDate(e.target.value)}
              className={inputClass}
              style={{ minHeight: '44px' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Season Year</label>
            <input
              type="number"
              value={seasonYear}
              onChange={e => setSeasonYear(e.target.value)}
              placeholder={String(new Date().getFullYear())}
              className={inputClass}
              style={{ minHeight: '44px' }}
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Seed Count <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={seedCount}
              onChange={e => setSeedCount(e.target.value)}
              placeholder="Number of seeds"
              className={inputClass}
              style={{ minHeight: '44px' }}
              inputMode="numeric"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Total Weight (g)</label>
            <input
              type="number"
              value={weightG}
              onChange={e => setWeightG(e.target.value)}
              placeholder="Optional — total weight in grams"
              className={inputClass}
              style={{ minHeight: '44px' }}
              inputMode="decimal"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Feminized</label>
            <div className="flex gap-2">
              {FEMINIZED_OPTIONS.map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setFeminized(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition ${
                    feminized === opt.value
                      ? 'bg-green-700 text-white border-green-700'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes"
              className={`${inputClass} resize-none`}
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-700 font-semibold text-sm"
            style={{ minHeight: '48px' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
            style={{ minHeight: '48px' }}
          >
            {saving ? 'Saving…' : 'Save Package'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SeedVault() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState([]);
  const [strains, setStrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [showAddForm, setShowAddForm] = useState(false);
  const [toast, setToast] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([api.getSeedPackages(), api.getStrains()])
      .then(([pkgs, strs]) => {
        setPackages(pkgs);
        setStrains(strs);
      })
      .catch(err => setError(err.message || 'Failed to load seed packages'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived year list from packages plus current year
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    new Set([currentYear, ...packages.map(p => p.season_year).filter(Boolean)])
  ).sort((a, b) => b - a);

  const filteredPackages = yearFilter === 'all'
    ? packages
    : packages.filter(p => p.season_year === yearFilter || (!p.season_year && yearFilter === currentYear));

  function handleSaved(pkg) {
    setPackages(prev => [pkg, ...prev]);
    setShowAddForm(false);
    setToast('Seed package added');
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-36">
      {/* Page header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Vault size={20} className="text-green-700" />
          <h1 className="text-xl font-bold text-gray-900">Seed Vault</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            aria-label="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 rounded-xl px-3 py-2 transition-colors"
            style={{ minHeight: '36px' }}
          >
            <Plus size={14} />
            Add Package
          </button>
        </div>
      </div>

      {/* Year filter chips */}
      {!loading && (
        <div className="flex gap-2 flex-wrap mb-5 mt-3">
          <button
            onClick={() => setYearFilter('all')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              yearFilter === 'all'
                ? 'bg-green-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {years.map(y => (
            <button
              key={y}
              onClick={() => setYearFilter(y)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                yearFilter === y
                  ? 'bg-green-800 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadData} className="ml-3 text-red-700 font-semibold underline">Retry</button>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <AddPackageForm
          strains={strains}
          onSave={handleSaved}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredPackages.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">
            {yearFilter === 'all'
              ? 'No seed packages yet. Add one above.'
              : `No seed packages for ${yearFilter}. Add one above.`}
          </p>
        </div>
      )}

      {/* Package grid */}
      {!loading && filteredPackages.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map(pkg => (
            <PackageCard key={pkg.package_id} pkg={pkg} navigate={navigate} />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-2xl shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
