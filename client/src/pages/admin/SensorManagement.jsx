import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api';

function formatRelative(isoStr) {
  if (!isoStr) return 'never';
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(isoStr).toLocaleDateString();
}

function BatteryBar({ pct }) {
  if (pct == null) return <span className="text-gray-400 text-xs">—</span>;
  const color = pct >= 60 ? 'bg-green-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600">{pct}%</span>
    </div>
  );
}

function AssignModal({ sensor, onClose, onSave }) {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [subZoneId, setSubZoneId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Build location list from a known set (seeded in migration 011)
    setLocations([
      { location_id: 1, name: 'Germ-01', sub_zone_id: null },
      { location_id: 2, name: 'Seedlings', sub_zone_id: null },
      { location_id: 3, name: 'Cult-Hoop', sub_zone_id: null },
      { location_id: 4, name: 'Z1A', sub_zone_id: 'Z1A' },
      { location_id: 5, name: 'Z1B', sub_zone_id: 'Z1B' },
      { location_id: 6, name: 'Z2A', sub_zone_id: 'Z2A' },
      { location_id: 7, name: 'Z2B', sub_zone_id: 'Z2B' },
      { location_id: 8, name: 'Z3A', sub_zone_id: 'Z3A' },
      { location_id: 9, name: 'Z3B', sub_zone_id: 'Z3B' },
      { location_id: 10, name: 'Z4A', sub_zone_id: 'Z4A' },
      { location_id: 11, name: 'Z4B', sub_zone_id: 'Z4B' },
    ]);
  }, []);

  async function handleSave() {
    if (!locationId) return;
    setSaving(true);
    setError(null);
    try {
      const loc = locations.find(l => l.location_id === parseInt(locationId, 10));
      await api.assignSensor({
        sensor_id: sensor.sensor_id,
        location_id: parseInt(locationId, 10),
        sub_zone_id: loc?.sub_zone_id ?? null,
        notes: notes || null,
      });
      onSave();
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Assign Sensor
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" style={{ minHeight: '44px', minWidth: '44px' }}>✕</button>
        </div>
        <p className="text-sm text-gray-600">{sensor.device_name} {sensor.label ? `(${sensor.label})` : ''}</p>

        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Location *</label>
          <select value={locationId} onChange={e => setLocationId(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            style={{ minHeight: '56px' }}
          >
            <option value="">Select location…</option>
            {locations.map(l => (
              <option key={l.location_id} value={l.location_id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Row 3, center position"
            className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            style={{ minHeight: '56px' }}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-gray-300 text-gray-700 font-semibold" style={{ minHeight: '56px' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!locationId || saving}
            className="flex-1 py-3 rounded-2xl bg-green-800 text-white font-semibold disabled:opacity-40"
            style={{ minHeight: '56px' }}
          >
            {saving ? 'Saving…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SensorManagement() {
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [lastPoll, setLastPoll] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getSensors();
      setSensors(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await api.syncSensors();
      setSyncResult(result);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handlePoll() {
    setPolling(true);
    setPollResult(null);
    setError(null);
    try {
      const result = await api.pollSensors();
      setPollResult(result);
      setLastPoll(new Date().toISOString());
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setPolling(false);
    }
  }

  async function handleUnassign(sensor) {
    if (!window.confirm(`Unassign ${sensor.device_name} from ${sensor.current_location_name}?`)) return;
    try {
      // Find the assignment_id by loading assignments
      const assignments = await api.getSensorAssignments();
      const assignment = assignments.find(a => a.sensor_id === sensor.sensor_id);
      if (!assignment) return;
      await api.unassignSensor(assignment.assignment_id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Sensor Management
      </h1>
      <p className="text-sm text-gray-500 mb-6">SensorPush environmental monitors · Admin only</p>

      {/* Action bar */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button onClick={handleSync} disabled={syncing}
          className="px-5 py-3 rounded-2xl bg-green-800 text-white font-semibold text-sm disabled:opacity-40"
          style={{ minHeight: '56px' }}
        >
          {syncing ? 'Syncing…' : 'Sync from SensorPush'}
        </button>
        <button onClick={handlePoll} disabled={polling}
          className="px-5 py-3 rounded-2xl bg-gray-700 text-white font-semibold text-sm disabled:opacity-40"
          style={{ minHeight: '56px' }}
        >
          {polling ? 'Polling…' : 'Test poll'}
        </button>
      </div>

      {/* Status messages */}
      {syncResult && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-800">
          Sync complete: {syncResult.synced} total ({syncResult.new} new, {syncResult.updated} updated)
        </div>
      )}
      {pollResult && (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm border ${pollResult.errors?.length ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          Poll complete: {pollResult.updated} new readings
          {lastPoll && <span className="text-gray-500"> · {formatRelative(lastPoll)}</span>}
          {pollResult.errors?.length > 0 && (
            <div className="mt-1 text-xs">{pollResult.errors.join('; ')}</div>
          )}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sensor table */}
      {loading ? (
        <div className="text-gray-400 text-center py-12">Loading…</div>
      ) : sensors.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No sensors synced yet.</p>
          <p className="text-sm text-gray-400">Click "Sync from SensorPush" to import your sensor list.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sensors.map(sensor => (
            <div key={sensor.sensor_id} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{sensor.device_name}</div>
                  {sensor.label && <div className="text-xs text-gray-500">{sensor.label}</div>}
                  {sensor.model && <div className="text-xs text-gray-400">{sensor.model}</div>}
                </div>
                <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1 ${sensor.active ? 'bg-green-500' : 'bg-gray-300'}`} />
              </div>

              <div className="grid grid-cols-2 gap-y-2 text-sm mb-3">
                <div>
                  <span className="text-gray-400 text-xs">Battery</span>
                  <div><BatteryBar pct={sensor.battery_pct} /></div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Last seen</span>
                  <div className="text-gray-700">{formatRelative(sensor.last_seen_at)}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Location</span>
                  <div className="text-gray-700 font-medium">
                    {sensor.current_location_name ?? <span className="text-amber-600">Unassigned</span>}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Latest reading</span>
                  <div className="text-gray-700 text-xs font-mono">
                    {sensor.latest_reading
                      ? `${sensor.latest_reading.temp_f?.toFixed(1)}°F · ${Math.round(sensor.latest_reading.humidity_rh)}%`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setAssignTarget(sensor)}
                  className="flex-1 py-2.5 rounded-xl bg-green-50 text-green-800 text-sm font-semibold border border-green-200 hover:bg-green-100 transition-colors"
                  style={{ minHeight: '44px' }}
                >
                  {sensor.current_location_name ? 'Reassign' : 'Assign to location'}
                </button>
                {sensor.current_location_name && (
                  <button onClick={() => handleUnassign(sensor)}
                    className="px-4 py-2.5 rounded-xl bg-gray-50 text-gray-600 text-sm font-semibold border border-gray-200 hover:bg-gray-100 transition-colors"
                    style={{ minHeight: '44px' }}
                  >
                    Unassign
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {assignTarget && (
        <AssignModal
          sensor={assignTarget}
          onClose={() => setAssignTarget(null)}
          onSave={load}
        />
      )}
    </div>
  );
}
