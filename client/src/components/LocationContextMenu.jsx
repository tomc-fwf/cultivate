import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, MapPin, Droplets, ClipboardList, X, Pencil } from 'lucide-react';
import { api } from '../api';

// 60px = NavBar height; extra 12px breathing room; safe-area for iOS home bar
const SHEET_FOOTER_PB = 'max(72px, calc(60px + env(safe-area-inset-bottom)))';

// ─── Add Sub-location Modal ──────────────────────────────────────────────────

export function AddSubLocationModal({ location, onClose, onRefresh }) {
  const [name, setName] = useState('');
  const [metrcName, setMetrcName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isMouse] = useState(() => window.matchMedia('(pointer: fine)').matches);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.createLocation({
        name: name.trim(),
        location_category: location.location_category,
        parent_location_id: location.location_id,
        metrc_name: metrcName.trim() || name.trim(),
      });
      onRefresh();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to create sub-location');
      setSaving(false);
    }
  }

  const formContent = (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}
      <div className="space-y-3 mb-4">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Name (required)"
          autoFocus
        />
        <input
          type="text"
          value={metrcName}
          onChange={e => setMetrcName(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="METRC name (same as name if blank)"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={!name.trim() || saving}
        className="w-full bg-green-700 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50"
        style={{ minHeight: '48px' }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </>
  );

  if (isMouse) {
    // Desktop: centered modal
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 max-w-[90vw] pointer-events-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 text-sm">
                Add Sub-location to {location.name}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 ml-3">
                <X size={18} />
              </button>
            </div>
            {formContent}
          </div>
        </div>
      </>
    );
  }

  // Mobile: bottom sheet with scrollable content + sticky footer
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 shadow-xl flex flex-col"
        style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h3 className="font-semibold text-gray-900">Add Sub-location to {location.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-3">
              {error}
            </div>
          )}
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Name (required)"
              autoFocus
            />
            <input
              type="text"
              value={metrcName}
              onChange={e => setMetrcName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="METRC name (same as name if blank)"
            />
          </div>
        </div>

        {/* Sticky footer */}
        <div
          className="px-5 pt-3 border-t border-gray-100 shrink-0"
          style={{ paddingBottom: SHEET_FOOTER_PB }}
        >
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="w-full bg-green-700 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50"
            style={{ minHeight: '48px' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Context Menu ────────────────────────────────────────────────────────────

export default function LocationContextMenu({ location, level, onClose, anchorPosition, onEdit, onRefresh }) {
  const navigate = useNavigate();
  const [showAddSub, setShowAddSub] = useState(false);
  const [isMouse] = useState(() => window.matchMedia('(pointer: fine)').matches);

  const firstBatch = location.batches?.[0] ?? location.batch ?? null;

  const actions = [
    {
      label: 'Edit Location',
      icon: Pencil,
      onClick: () => { onEdit(location); onClose(); },
    },
    {
      label: 'Add Plant Group',
      icon: Sprout,
      onClick: () => { navigate(`/batches/new?location_id=${location.location_id}`); onClose(); },
    },
  ];

  if (level === 'location') {
    actions.push({
      label: 'Add Sub-location',
      icon: MapPin,
      onClick: () => setShowAddSub(true),
    });
  }

  if (firstBatch) {
    actions.push({
      label: 'Apply Fertigation',
      icon: Droplets,
      onClick: () => { navigate(`/applications/fertigation/new?batch_id=${firstBatch.batch_id}`); onClose(); },
    });
  }

  actions.push({
    label: 'View History',
    icon: ClipboardList,
    onClick: () => { navigate(`/batches?location_id=${location.location_id}`); onClose(); },
  });

  if (showAddSub) {
    return (
      <AddSubLocationModal
        location={location}
        onClose={() => { setShowAddSub(false); onClose(); }}
        onRefresh={onRefresh}
      />
    );
  }

  if (!isMouse) {
    // Mobile: bottom sheet
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50">
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
            <span className="font-semibold text-gray-900">{location.name}</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X size={20} />
            </button>
          </div>
          <div className="py-2" style={{ paddingBottom: SHEET_FOOTER_PB }}>
            {actions.map(action => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="w-full flex items-center gap-4 px-4 py-3.5 text-gray-800 font-medium hover:bg-gray-50 transition-colors text-left"
                style={{ minHeight: '56px' }}
              >
                <action.icon size={20} className="text-gray-500 shrink-0" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Desktop: positioned popover
  const menuWidth = 220;
  const menuHeight = 200;
  const x = Math.min(anchorPosition?.x ?? 0, window.innerWidth - menuWidth - 8);
  const y = Math.min(anchorPosition?.y ?? 0, window.innerHeight - menuHeight - 8);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ position: 'fixed', top: y, left: x, zIndex: 50 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-200 py-2 min-w-[200px]"
      >
        {actions.map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 w-full text-left transition-colors"
          >
            <action.icon size={16} className="text-gray-500 shrink-0" />
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}
