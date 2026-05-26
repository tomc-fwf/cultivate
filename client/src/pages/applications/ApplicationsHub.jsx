import { useNavigate } from 'react-router-dom';
import { Grid2x2, MapPin, FlaskConical, ClipboardList, Sprout, BarChart2 } from 'lucide-react';

const APP_TYPES = [
  {
    key: 'fertigation',
    label: 'Fertigation',
    icon: '💧',
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-900',
    sub: 'Drip irrigation · sub-zone level',
    newHref: '/applications/fertigation/new',
    logHref: '/applications/fertigation',
  },
  {
    key: 'foliar',
    label: 'Foliar',
    icon: '🌿',
    bg: 'bg-green-50 border-green-200',
    text: 'text-green-900',
    sub: 'Spray applications · row/container',
    newHref: '/applications/foliar/new',
    logHref: '/applications/foliar',
  },
  {
    key: 'amendment',
    label: 'Amendment',
    icon: '🪱',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-900',
    sub: 'Container media · compost, inoculants',
    newHref: '/applications/amendments/new',
    logHref: '/applications/amendments',
  },
  {
    key: 'pesticide',
    label: 'Pesticide',
    icon: '⚗️',
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-900',
    sub: 'EPA-registered products · MDA compliance',
    newHref: '/applications/pesticide/new',
    logHref: '/applications/pesticide',
  },
];

export default function ApplicationsHub() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'Fraunces, serif' }}>
        Applications
      </h1>

      {/* ── Four application types ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {APP_TYPES.map(t => (
          <div key={t.key} className={`rounded-2xl border-2 ${t.bg} overflow-hidden`}>
            <button
              onClick={() => navigate(t.newHref)}
              className="w-full px-4 pt-4 pb-3 text-left active:brightness-95 transition-all"
              style={{ minHeight: '88px' }}
            >
              <div className="text-2xl mb-1.5">{t.icon}</div>
              <div className={`font-bold text-sm ${t.text}`}>{t.label}</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-snug">{t.sub}</div>
            </button>
            <button
              onClick={() => navigate(t.logHref)}
              className={`w-full px-4 py-2.5 text-xs font-semibold ${t.text} opacity-60 hover:opacity-100 border-t border-black/5 text-left transition-opacity flex items-center justify-between`}
            >
              <span>View log</span>
              <span>→</span>
            </button>
          </div>
        ))}
      </div>

      {/* ── Field & Containers ─────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Field & Containers</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/containers')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-gray-400 flex-shrink-0"><Grid2x2 size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Container Dashboard</div>
            <div className="text-xs text-gray-500">All 1,180 containers · state overview · filter by zone</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/locations')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-gray-400 flex-shrink-0"><MapPin size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Locations</div>
            <div className="text-xs text-gray-500">Pre-field + field zones · batch placement overview</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/soil-samples')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-gray-400 flex-shrink-0"><FlaskConical size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Soil Sample Tracker</div>
            <div className="text-xs text-gray-500">Lab tracking · per-parameter results · pending samples</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── Compliance ────────────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Compliance</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/audit')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🔎</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Tag Audit</div>
            <div className="text-xs text-gray-500">Walk rows · verify METRC tags · generate discrepancy report</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── METRC Tag Assignment ───────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">METRC</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/tag-assignments')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🏷️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Tag Assignment</div>
            <div className="text-xs text-gray-500">Walk-through · assign METRC tags to untagged placements</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/metrc/plants-waste')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🌿</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Submit Plant Waste</div>
            <div className="text-xs text-gray-500">End-of-day · upload type #21 · batch CSV generation</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── Observations & REI ─────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Observations & Safety</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/observations/new')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🔍</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Log Observation</div>
            <div className="text-xs text-gray-500">Plant health, pest, harvest readiness</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/observations')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Observation Log</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/rei')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">REI Dashboard</div>
            <div className="text-xs text-gray-500">Active re-entry intervals</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── Recipes & Catalog ──────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Recipes & Catalog</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/recipes/fertigation')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📗</span>
          <span className="text-sm font-semibold text-gray-800">Fertigation Recipes</span>
          <span className="ml-auto text-gray-400">→</span>
        </button>
        <button
          onClick={() => navigate('/recipes/foliar')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📘</span>
          <span className="text-sm font-semibold text-gray-800">Foliar Recipes</span>
          <span className="ml-auto text-gray-400">→</span>
        </button>
        <button
          onClick={() => navigate('/inputs')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📦</span>
          <span className="text-sm font-semibold text-gray-800">Crop Inputs</span>
          <span className="ml-auto text-gray-400">→</span>
        </button>
      </div>

      {/* ── Library & Reference ────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Library & Reference</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/recipes')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📚</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Recipe Library</div>
            <div className="text-xs text-gray-500">Fertigation + foliar recipes</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/inputs')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📦</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Crop Input Inventory</div>
            <div className="text-xs text-gray-500">Products, lots, EPA/OMRI registrations</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/rei')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">REI Status Dashboard</div>
            <div className="text-xs text-gray-500">Active re-entry intervals</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── Compliance & Reports ───────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Compliance & Reports</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
        <button
          onClick={() => navigate('/compliance')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🛡️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Compliance Dashboard</div>
            <div className="text-xs text-gray-500">OCM inspection readiness · RAG status overview</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/compliance/plant-inventory')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🌿</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Plant Inventory</div>
            <div className="text-xs text-gray-500">Current active batches · inspector handoff</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/compliance/tag-verification')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🏷️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Tag Verification</div>
            <div className="text-xs text-gray-500">Container-to-METRC-tag walkthrough sheet</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/compliance/metrc-reconciliation')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🔄</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">METRC Reconciliation</div>
            <div className="text-xs text-gray-500">Sync status across all event types</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/metrc')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📤</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">METRC Record Additives</div>
            <div className="text-xs text-gray-500">All four application types · JSON / CSV</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/metrc-harvest')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🌿</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">METRC Harvest Export</div>
            <div className="text-xs text-gray-500">Harvest events · per-batch weight totals · METRC UID flag</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/metrc-waste')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🗑️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">METRC Waste Export</div>
            <div className="text-xs text-gray-500">Waste trim + plant loss · unified · METRC sync status</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/metrc-tag-assignments')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🏷️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">METRC Tag Assignments</div>
            <div className="text-xs text-gray-500">Active plant-to-container tag map · grouped by batch · CSV</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/metrc-phase-changes')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🔄</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">METRC Phase Changes</div>
            <div className="text-xs text-gray-500">Phase transitions + location moves · Change Growth Phase</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/mda-pesticide')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🏛️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">MDA Pesticide Report</div>
            <div className="text-xs text-gray-500">MN Statute 18B.37 format · defensive recordkeeping</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/cultivation-record')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Cultivation Record</div>
            <div className="text-xs text-gray-500">Full per-batch audit record · MN Statute 342.25</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/crop-inputs')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🪴</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Rule 4770 Crop Input Log</div>
            <div className="text-xs text-gray-500">All four input classes · ingredient-level detail · MN Rule 4770</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/plant-losses')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">💀</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Plant Loss & Destruction Log</div>
            <div className="text-xs text-gray-500">All plant losses · METRC sync status · pending flag</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/harvest-records')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">⚖️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Harvest Records Report</div>
            <div className="text-xs text-gray-500">Partial and final harvests · batch totals · METRC UID flag</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/phi-compliance')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">⚗️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">PHI Compliance Report</div>
            <div className="text-xs text-gray-500">Pre-harvest interval status · MDA inspection readiness · risk flags</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/exports/annual-summary')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📅</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Annual Batch Summary</div>
            <div className="text-xs text-gray-500">Batches · plants · yield · compliance stats · OCM annual review</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── Planning ──────────────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-6">Planning</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/planting-plans')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-gray-400 flex-shrink-0"><ClipboardList size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              Planting Plans
              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Supervisor</span>
            </div>
            <div className="text-xs text-gray-500">Container assignment planning · supervisor sign-off</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── Analytics ─────────────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-6">Analytics</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 mb-6">
        <button
          onClick={() => navigate('/analytics/applicators')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📊</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Applicator Performance</div>
            <div className="text-xs text-gray-500">Application counts · EC accuracy · date range filter</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/analytics/pesticide-summary')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">⚗️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Annual Pesticide Summary</div>
            <div className="text-xs text-gray-500">Per-product totals · license renewal · MN 18B.37</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/analytics/annual')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📅</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Annual Batch Tracker</div>
            <div className="text-xs text-gray-500">Gantt view · all batches by sub-zone · year picker</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/analytics/recipe-performance')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🌱</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Recipe Performance</div>
            <div className="text-xs text-gray-500">Harvest yield by recipe version · avg g per plant</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/analytics/compare')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">⚖️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Cross-Batch Comparison</div>
            <div className="text-xs text-gray-500">Compare up to 6 batches · yield, loss rate, EC deviation</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/batches')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">📈</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">EC / pH Charts</div>
            <div className="text-xs text-gray-500">Select a batch from the Batches list · per-batch EC and pH charts</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>

      {/* ── Admin ──────────────────────────────────────────────────────── */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-6">Admin</h2>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
        <button
          onClick={() => navigate('/admin/container-labels')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🏷️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Container QR Labels</div>
            <div className="text-xs text-gray-500">Print Avery 5160 label sheets for containers</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/admin/sensors')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🌡️</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800">Sensor Management</div>
            <div className="text-xs text-gray-500">SensorPush monitors · assign to locations · test poll</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/strains')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-gray-400 flex-shrink-0"><Sprout size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              Strains
              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Supervisor</span>
            </div>
            <div className="text-xs text-gray-500">Strain catalog · auto / photo type · genetics</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/admin/environmental-history')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-gray-400 flex-shrink-0"><BarChart2 size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              Environmental History
              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Admin</span>
            </div>
            <div className="text-xs text-gray-500">Historical temp/RH charts · per sensor / location</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
        <button
          onClick={() => navigate('/admin/metrc-additive-templates')}
          className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          <span className="text-lg flex-shrink-0">🧪</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              METRC Additive Templates
              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Admin</span>
            </div>
            <div className="text-xs text-gray-500">Register products with active ingredients for METRC upload #1</div>
          </div>
          <span className="text-gray-400 flex-shrink-0">→</span>
        </button>
      </div>
    </div>
  );
}
