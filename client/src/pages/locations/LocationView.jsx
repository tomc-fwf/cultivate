import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ScanLine, FlaskConical, Users, RefreshCw, AlertTriangle, Plus } from 'lucide-react';
import { api } from '../../api';
import LocationContextMenu from '../../components/LocationContextMenu';

// ─── Static config ─────────────────────────────────────────────────────────

const STATUS_CHIP = {
  'germ':           'bg-gray-100 text-gray-700',
  'seedling':       'bg-lime-100 text-lime-700',
  'cult-hoop':      'bg-green-100 text-green-700',
  'field-veg':      'bg-green-100 text-green-800',
  'field-flower':   'bg-purple-100 text-purple-700',
  'flush':          'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700',
  'harvesting':     'bg-red-100 text-red-700',
};

const STATUS_LABELS = {
  'germ':           'Germ',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Veg',
  'field-flower':   'Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
};

const STATE_BAR_COLOR = {
  ready:          'bg-green-200',
  active:         'bg-green-500',
  empty:          'bg-amber-300',
  teardown:       'bg-orange-400',
  startup:        'bg-blue-400',
  out_of_service: 'bg-gray-400',
};

const STATE_LABELS = {
  ready:          'Ready',
  active:         'Active',
  empty:          'Empty',
  teardown:       'Teardown',
  startup:        'Startup',
  out_of_service: 'OOS',
};

const ALL_STATES = ['active', 'empty', 'ready', 'startup', 'teardown', 'out_of_service'];

const SECTION_LABELS = { indoor: 'Indoor', hoop_house: 'Hoop-House', outdoor: 'Outdoors' };
const SECTION_ORDER = ['indoor', 'hoop_house', 'outdoor'];

// 60px = NavBar height; extra 12px breathing room; safe-area for iOS home bar
const SHEET_FOOTER_PB = 'max(72px, calc(60px + env(safe-area-inset-bottom)))';

const CATEGORY_BADGE = {
  indoor:     { label: 'Indoor',     className: 'bg-blue-50 text-blue-700' },
  hoop_house: { label: 'Hoop-House', className: 'bg-amber-50 text-amber-700' },
  outdoor:    { label: 'Outdoor',    className: 'bg-green-50 text-green-700' },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function StateBar({ counts, total }) {
  if (!total) return <div className="h-1.5 bg-gray-100 rounded-full" />;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
      {ALL_STATES.map(state => {
        const n = counts[state] ?? 0;
        if (!n) return null;
        const pct = (n / total) * 100;
        return (
          <div
            key={state}
            className={`${STATE_BAR_COLOR[state]} flex-none`}
            style={{ width: `${pct}%` }}
            title={`${STATE_LABELS[state]}: ${n}`}
          />
        );
      })}
    </div>
  );
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

function ObsBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute top-2 right-2 bg-amber-400 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function IndoorCard({ location, navigate, onOpenMenu }) {
  const { location_id, name, batches, open_observation_count } = location;
  const timerRef = useRef(null);
  const didLongPress = useRef(false);
  const pressPos = useRef({ x: 0, y: 0 });

  function startPress(e) {
    didLongPress.current = false;
    pressPos.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onOpenMenu(location, 'location', pressPos.current);
    }, 300);
  }

  function endPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    didLongPress.current = false;
  }

  return (
    <div
      className="relative bg-white rounded-2xl border border-gray-200 px-4 py-4 hover:border-green-300 transition-colors cursor-pointer select-none"
      style={{ minHeight: '100px' }}
      onClick={() => {
        if (didLongPress.current) { didLongPress.current = false; return; }
        navigate(`/batches?location_id=${location_id}&location_name=${encodeURIComponent(name)}`);
      }}
      onContextMenu={e => { e.preventDefault(); onOpenMenu(location, 'location', { x: e.clientX, y: e.clientY }); }}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
    >
      <ObsBadge count={open_observation_count} />
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-semibold text-gray-800 text-sm leading-snug">{name}</span>
        {location.location_category && CATEGORY_BADGE[location.location_category] && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CATEGORY_BADGE[location.location_category].className}`}>
            {CATEGORY_BADGE[location.location_category].label}
          </span>
        )}
      </div>
      {!batches || batches.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Empty</p>
      ) : (
        <div className="space-y-1.5">
          {batches.map(b => (
            <div
              key={b.batch_id}
              className="flex items-center gap-2 min-w-0"
              onClick={e => { e.stopPropagation(); navigate(`/batches/${b.batch_id}`); }}
              onPointerDown={e => e.stopPropagation()}
            >
              <span className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">
                {b.strain_name}
              </span>
              <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_CHIP[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[b.status] ?? b.status}
              </span>
              <span className="shrink-0 text-xs text-gray-500">
                {b.plant_count_current ?? b.plant_count_initial}p
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubZoneRow({ subLoc, navigate, onOpenMenu }) {
  const {
    location_id,
    name,
    sub_zone_id,
    pot_size_gal,
    container_count,
    container_counts,
    batches,
    rei_active,
    rei_expires_at,
    open_observation_count,
  } = subLoc;
  const batch = batches && batches.length > 0 ? batches[0] : null;
  const timerRef = useRef(null);
  const didLongPress = useRef(false);
  const pressPos = useRef({ x: 0, y: 0 });

  function startPress(e) {
    didLongPress.current = false;
    pressPos.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onOpenMenu(subLoc, 'sub_location', pressPos.current);
    }, 300);
  }

  function endPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!didLongPress.current) {
      sub_zone_id
        ? navigate(`/containers/map/${sub_zone_id}`)
        : navigate(`/locations/${location_id}`);
    }
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    didLongPress.current = false;
  }

  return (
    <div
      className="relative py-2 px-0 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors -mx-1 px-1 select-none"
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={e => { e.preventDefault(); onOpenMenu(subLoc, 'sub_location', { x: e.clientX, y: e.clientY }); }}
    >
      {/* Sub-zone header */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold text-gray-800 text-sm">{name}</span>
        {pot_size_gal != null && (
          <span className="text-xs text-gray-400">{pot_size_gal}-gal</span>
        )}
        {rei_active && (
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px leading-tight">
            ⚠ REI{rei_expires_at ? ` until ${formatTime(rei_expires_at)}` : ''}
          </span>
        )}
        {open_observation_count > 0 && (
          <span className="ml-auto text-xs font-semibold text-amber-600">
            {open_observation_count} obs
          </span>
        )}
      </div>

      {/* State bar */}
      <StateBar counts={container_counts ?? {}} total={container_count ?? 0} />

      {/* Batch info */}
      {batch ? (
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
          <span className="text-xs text-gray-700 font-medium truncate flex-1 min-w-0">{batch.strain_name}</span>
          <span className={`shrink-0 text-xs font-medium px-1.5 py-px rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[batch.status] ?? batch.status}
          </span>
          {batch.days_in_stage != null && (
            <span className="shrink-0 text-xs text-gray-400">Day {batch.days_in_stage}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic mt-1">—</p>
      )}
    </div>
  );
}

function ZoneCard({ location, navigate, onOpenMenu }) {
  const { name, sub_locations, rei_active } = location;
  const timerRef = useRef(null);
  const didLongPress = useRef(false);
  const pressPos = useRef({ x: 0, y: 0 });

  function startPress(e) {
    didLongPress.current = false;
    pressPos.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onOpenMenu(location, 'location', pressPos.current);
    }, 300);
  }

  function endPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    didLongPress.current = false;
  }

  return (
    <div
      className={`bg-white rounded-2xl border px-4 py-4 transition-colors ${
        rei_active ? 'border-amber-300' : 'border-gray-200 hover:border-green-300'
      }`}
    >
      {/* Zone header — long-press / right-click target */}
      <div
        className="flex items-center justify-between gap-2 mb-2 cursor-pointer select-none"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={e => { e.preventDefault(); onOpenMenu(location, 'location', { x: e.clientX, y: e.clientY }); }}
      >
        <span className="font-bold text-gray-800 text-sm">{name}</span>
        <div className="flex items-center gap-1.5">
          {rei_active && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              ⚠ REI
            </span>
          )}
          {location.location_category && CATEGORY_BADGE[location.location_category] && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CATEGORY_BADGE[location.location_category].className}`}>
              {CATEGORY_BADGE[location.location_category].label}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {(sub_locations ?? []).map(sl => (
          <SubZoneRow
            key={sl.location_id}
            subLoc={sl}
            navigate={navigate}
            onOpenMenu={onOpenMenu}
          />
        ))}
      </div>
    </div>
  );
}

function NoSubZonesCard({ location, onOpenMenu }) {
  const timerRef = useRef(null);
  const didLongPress = useRef(false);
  const pressPos = useRef({ x: 0, y: 0 });

  function startPress(e) {
    didLongPress.current = false;
    pressPos.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onOpenMenu(location, 'location', pressPos.current);
    }, 300);
  }

  function endPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    didLongPress.current = false;
  }

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 px-4 py-4 cursor-pointer hover:border-green-300 transition-colors select-none"
      style={{ minHeight: '80px' }}
      onClick={() => { if (didLongPress.current) { didLongPress.current = false; } }}
      onContextMenu={e => { e.preventDefault(); onOpenMenu(location, 'location', { x: e.clientX, y: e.clientY }); }}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-bold text-gray-800 text-sm leading-snug">{location.name}</span>
        {location.location_category && CATEGORY_BADGE[location.location_category] && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CATEGORY_BADGE[location.location_category].className}`}>
            {CATEGORY_BADGE[location.location_category].label}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 italic">No sub-locations yet</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 animate-pulse" style={{ minHeight: '100px' }}>
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-full mb-1.5" />
      <div className="h-3 bg-gray-100 rounded w-4/5" />
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

const CATEGORY_PLACEHOLDERS = {
  indoor: 'e.g. Germ-02',
  hoop_house: 'e.g. Hoop-02',
  outdoor: 'e.g. Zone 5',
};

const CATEGORY_DISPLAY = {
  indoor: 'Indoor',
  hoop_house: 'Hoop-House',
  outdoor: 'Outdoor',
};

export default function LocationView() {
  const navigate = useNavigate();
  const [tree, setTree] = useState(null);
  const [globalAlerts, setGlobalAlerts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [addLocationModal, setAddLocationModal] = useState(null); // null | { category }
  const [addName, setAddName] = useState('');
  const [addMetrcName, setAddMetrcName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addDisplayOrder, setAddDisplayOrder] = useState('');
  const [addNameError, setAddNameError] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [editLocationModal, setEditLocationModal] = useState(null);
  const [editName, setEditName] = useState('');
  const [editMetrcName, setEditMetrcName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDisplayOrder, setEditDisplayOrder] = useState('');
  const [editColSpan, setEditColSpan] = useState(1);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    api.getLocationsTree()
      .then(d => {
        setTree(d.tree);
        setGlobalAlerts(d.global_alerts ?? {});
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function openMenu(location, level, anchorPosition) {
    setContextMenu({ location, level, anchorPosition });
  }

  const closeAddModal = () => {
    setAddLocationModal(null);
    setAddName('');
    setAddMetrcName('');
    setAddDescription('');
    setAddDisplayOrder('');
    setAddNameError('');
    setAddError('');
  };

  const handleAddLocation = async () => {
    if (!addName.trim()) {
      setAddNameError('Name is required.');
      return;
    }
    setAddNameError('');
    setAddError('');
    setAddSaving(true);
    try {
      await api.createLocation({
        name: addName.trim(),
        location_category: addLocationModal.category,
        metrc_name: addMetrcName.trim() || addName.trim(),
        ...(addDescription.trim() ? { description: addDescription.trim() } : {}),
        ...(addDisplayOrder ? { display_order: Number(addDisplayOrder) } : {}),
      });
      closeAddModal();
      loadData();
    } catch (err) {
      setAddError(err.message || 'Failed to create location.');
    } finally {
      setAddSaving(false);
    }
  };

  useEffect(() => {
    if (editLocationModal) {
      setEditName(editLocationModal.name || '');
      setEditMetrcName(editLocationModal.metrc_name || '');
      setEditDescription(editLocationModal.description || '');
      setEditDisplayOrder(editLocationModal.display_order != null ? String(editLocationModal.display_order) : '');
      setEditColSpan(editLocationModal.col_span || 1);
      setEditError('');
    }
  }, [editLocationModal]);

  async function handleEditSave() {
    if (!editName.trim()) { setEditError('Name is required'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      await api.updateLocation(editLocationModal.location_id, {
        name: editName.trim(),
        metrc_name: editMetrcName.trim() || editName.trim(),
        description: editDescription.trim() || undefined,
        display_order: editDisplayOrder ? Number(editDisplayOrder) : undefined,
        col_span: editColSpan,
      });
      setEditLocationModal(null);
      await loadData();
    } catch (e) {
      setEditError(e.message || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  }

  const alerts = globalAlerts;
  const alertParts = [];
  if (alerts.losses_unsynced > 0) alertParts.push(`${alerts.losses_unsynced} unsynced ${alerts.losses_unsynced === 1 ? 'loss' : 'losses'}`);
  if (alerts.teardown_pending > 0) alertParts.push(`${alerts.teardown_pending} teardown pending`);
  if (alerts.startup_pending > 0) alertParts.push(`${alerts.startup_pending} startup pending`);
  if (alerts.lab_samples_awaiting > 0) alertParts.push(`${alerts.lab_samples_awaiting} awaiting lab`);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-36">

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-green-700" />
          <h1 className="text-xl font-bold text-gray-900">Locations</h1>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Global alerts bar */}
      {!loading && alertParts.length > 0 && (
        <button
          className="w-full mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-left text-sm text-amber-800 font-medium hover:bg-amber-100 transition-colors"
          onClick={() => navigate('/tasks')}
        >
          <AlertTriangle size={14} className="inline mr-1.5 align-middle" />
          {alertParts.join(' · ')}
        </button>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadData} className="ml-3 text-red-700 font-semibold underline">Retry</button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <>
          <section className="mb-6">
            <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
            </div>
          </section>
          <section>
            <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          </section>
        </>
      )}

      {/* Tree sections */}
      {!loading && tree && SECTION_ORDER.map(category => {
        const locations = tree[category] ?? [];
        const isOutdoor = category === 'outdoor';
        return (
          <section key={category} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                {SECTION_LABELS[category]}
              </h2>
              <button
                onClick={() => setAddLocationModal({ category })}
                className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 rounded-xl px-3 py-1.5 transition"
                style={{ minHeight: '36px' }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
            {locations.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No locations yet.</p>
            ) : (
              <div className={
                isOutdoor
                  ? 'grid grid-cols-2 gap-3'
                  : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'
              }>
                {locations.map(loc => {
                  if (isOutdoor) {
                    const colClass = loc.col_span === 2 ? 'col-span-2' : '';
                    if (loc.sub_locations && loc.sub_locations.length > 0) {
                      return (
                        <div key={loc.location_id} className={colClass}>
                          <ZoneCard
                            location={loc}
                            navigate={navigate}
                            onOpenMenu={openMenu}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={loc.location_id} className={colClass}>
                        <NoSubZonesCard location={loc} onOpenMenu={openMenu} />
                      </div>
                    );
                  }
                  return (
                    <IndoorCard
                      key={loc.location_id}
                      location={loc}
                      navigate={navigate}
                      onOpenMenu={openMenu}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* ── Add Location modal ───────────────────────────────────────────── */}
      {addLocationModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeAddModal} />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 flex flex-col"
            style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="px-4 pb-2 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                Add {CATEGORY_DISPLAY[addLocationModal.category]} Location
              </h3>
            </div>

            {/* Scrollable form fields */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {addError && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-800">
                  {addError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => { setAddName(e.target.value); setAddNameError(''); }}
                    placeholder={CATEGORY_PLACEHOLDERS[addLocationModal.category]}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${addNameError ? 'border-red-400' : 'border-gray-300'}`}
                    style={{ minHeight: '44px' }}
                    autoFocus
                  />
                  {addNameError && (
                    <p className="mt-1 text-xs text-red-600">{addNameError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    METRC Name <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addMetrcName}
                    onChange={e => setAddMetrcName(e.target.value)}
                    placeholder="Same as name if blank"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={{ minHeight: '44px' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Description <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addDescription}
                    onChange={e => setAddDescription(e.target.value)}
                    placeholder="Short description"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={{ minHeight: '44px' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Display Order <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={addDisplayOrder}
                    onChange={e => setAddDisplayOrder(e.target.value)}
                    placeholder="e.g. 10, 20, 30 — lower numbers appear first"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={{ minHeight: '44px' }}
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            {/* Sticky footer — always above keyboard/NavBar */}
            <div
              className="px-4 pt-3 border-t border-gray-100 flex gap-3 shrink-0"
              style={{ paddingBottom: SHEET_FOOTER_PB }}
            >
              <button
                onClick={closeAddModal}
                disabled={addSaving}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-700 font-semibold"
                style={{ minHeight: '48px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddLocation}
                disabled={addSaving}
                className="flex-1 py-3 rounded-2xl bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold"
                style={{ minHeight: '48px' }}
              >
                {addSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Quick Actions bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-20 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 py-3">
        <div className="max-w-4xl mx-auto px-4 flex gap-3">
          <button
            onClick={() => navigate('/scan')}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-green-50 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-700 transition-colors"
            style={{ minHeight: '48px' }}
          >
            <ScanLine size={16} />
            Scan
          </button>
          <button
            onClick={() => navigate('/recipes/mix-calculator')}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-green-50 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-700 transition-colors"
            style={{ minHeight: '48px' }}
          >
            <FlaskConical size={16} />
            Mix Today
          </button>
          <button
            onClick={() => navigate('/batches')}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-green-50 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-700 transition-colors"
            style={{ minHeight: '48px' }}
          >
            <Users size={16} />
            My Groups
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <LocationContextMenu
          location={contextMenu.location}
          level={contextMenu.level}
          anchorPosition={contextMenu.anchorPosition}
          onClose={() => setContextMenu(null)}
          onEdit={(loc) => setEditLocationModal(loc)}
          onRefresh={loadData}
        />
      )}

      {/* ── Edit Location modal ──────────────────────────────────────────── */}
      {editLocationModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setEditLocationModal(null)} />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 flex flex-col"
            style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="px-4 pb-2 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Edit Location</h3>
              <p className="text-sm text-gray-500">{editLocationModal.name}</p>
            </div>

            {/* Scrollable form */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
              {editError && (
                <div className="bg-red-50 text-red-700 rounded-xl px-3 py-2 text-sm">{editError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">METRC Name</label>
                <input
                  type="text"
                  value={editMetrcName}
                  onChange={e => setEditMetrcName(e.target.value)}
                  placeholder="Same as name if blank"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  value={editDisplayOrder}
                  onChange={e => setEditDisplayOrder(e.target.value)}
                  placeholder="Lower numbers appear first"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ minHeight: '44px' }}
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Column Span</label>
                <div className="flex gap-2">
                  {[1, 2].map(n => (
                    <button
                      key={n}
                      onClick={() => setEditColSpan(n)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition ${
                        editColSpan === n
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
                      }`}
                      style={{ minHeight: '44px' }}
                    >
                      {n === 1 ? 'Normal (1 col)' : 'Wide (2 cols)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div
              className="px-4 pt-3 border-t border-gray-100 flex gap-3 shrink-0"
              style={{ paddingBottom: SHEET_FOOTER_PB }}
            >
              <button
                onClick={() => setEditLocationModal(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-700 font-semibold"
                style={{ minHeight: '48px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex-1 py-3 rounded-2xl bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold"
                style={{ minHeight: '48px' }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
