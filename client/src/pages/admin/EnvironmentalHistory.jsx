import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const DATE_RANGES = [
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7d',  value: '7d'  },
  { label: 'Last 30d', value: '30d' },
  { label: 'Custom',   value: 'custom' },
];

function getRangeStart(value) {
  const now = new Date();
  if (value === '24h') return new Date(now - 86400000).toISOString().slice(0, 16);
  if (value === '7d')  return new Date(now - 7 * 86400000).toISOString().slice(0, 16);
  if (value === '30d') return new Date(now - 30 * 86400000).toISOString().slice(0, 16);
  return '';
}

function formatTs(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return isoStr; }
}

function toCSV(rows) {
  const headers = ['timestamp', 'temp_f', 'humidity_rh', 'dew_point_f', 'vpd_kpa'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.observed_at ?? r.hour_at ?? '',
      r.temp_f ?? r.temp_f_avg ?? '',
      r.humidity_rh ?? r.humidity_rh_avg ?? '',
      r.dew_point_f ?? r.dew_point_f_avg ?? '',
      r.vpd_kpa ?? r.vpd_kpa_avg ?? '',
    ].join(','));
  }
  return lines.join('\n');
}

export default function EnvironmentalHistory() {
  const navigate = useNavigate();
  const [sensors, setSensors] = useState([]);
  const [sensorsLoading, setSensorsLoading] = useState(true);
  const [selectedSensorId, setSelectedSensorId] = useState('');
  const [dateRange, setDateRange] = useState('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [readings, setReadings] = useState([]);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsError, setReadingsError] = useState('');

  useEffect(() => {
    api.getSensors()
      .then(data => {
        setSensors(data);
        setSensorsLoading(false);
        if (data.length > 0) setSelectedSensorId(data[0].sensor_id);
      })
      .catch(() => setSensorsLoading(false));
  }, []);

  const load = useCallback(() => {
    if (!selectedSensorId) return;
    setReadingsLoading(true);
    setReadingsError('');

    let start, end;
    if (dateRange === 'custom') {
      start = customStart ? new Date(customStart).toISOString() : null;
      end = customEnd ? new Date(customEnd).toISOString() : new Date().toISOString();
    } else {
      start = new Date(getRangeStart(dateRange)).toISOString();
      end = new Date().toISOString();
    }
    if (!start) { setReadingsLoading(false); return; }

    api.getSensorReadings(selectedSensorId, { start, end, resolution: 'raw' })
      .then(data => { setReadings(Array.isArray(data) ? data : []); setReadingsLoading(false); })
      .catch(e => { setReadingsError(e.message); setReadingsLoading(false); });
  }, [selectedSensorId, dateRange, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  function handleDownloadCSV() {
    if (!readings.length) return;
    const csv = toCSV(readings);
    const sensor = sensors.find(s => s.sensor_id === selectedSensorId);
    const filename = `env-history-${sensor?.device_name ?? selectedSensorId}-${dateRange}.csv`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <button
        onClick={() => navigate('/admin/sensors')}
        className="text-sm text-gray-500 mb-4 flex items-center gap-1 hover:text-gray-700"
        style={{ minHeight: '44px' }}
      >
        ← Sensor Management
      </button>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Environmental History
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Charts will be available in Phase 3</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4 mb-5 flex flex-col gap-3">
        {/* Sensor selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Sensor</label>
          {sensorsLoading ? (
            <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <select
              value={selectedSensorId}
              onChange={e => setSelectedSensorId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              style={{ minHeight: '48px' }}
            >
              {sensors.length === 0 && <option value="">No sensors synced yet</option>}
              {sensors.map(s => (
                <option key={s.sensor_id} value={s.sensor_id}>
                  {s.device_name}{s.current_location_name ? ` — ${s.current_location_name}` : ''}{s.current_sub_zone_id ? ` (${s.current_sub_zone_id})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Date range */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date Range</label>
          <div className="flex gap-2 flex-wrap">
            {DATE_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setDateRange(r.value)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  dateRange === r.value
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                }`}
                style={{ minHeight: '40px' }}
              >
                {r.label}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{ minHeight: '44px' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-between items-center">
          <span className="text-xs text-gray-400">
            {readings.length > 0 ? `${readings.length} readings` : ''}
          </span>
          <button
            onClick={handleDownloadCSV}
            disabled={readings.length === 0}
            className="px-4 py-2 text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ minHeight: '40px' }}
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Data table */}
      {readingsLoading ? (
        <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
      ) : readingsError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{readingsError}</div>
      ) : readings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-8 text-center text-gray-400 text-sm">
          No readings found for this range.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Temp (°F)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">RH (%)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Dew Pt (°F)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">VPD (kPa)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {readings.slice(0, 500).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-600 font-mono whitespace-nowrap">
                      {formatTs(r.observed_at ?? r.hour_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {(r.temp_f ?? r.temp_f_avg)?.toFixed(1) ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {r.humidity_rh != null ? Math.round(r.humidity_rh) : r.humidity_rh_avg != null ? Math.round(r.humidity_rh_avg) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {(r.dew_point_f ?? r.dew_point_f_avg)?.toFixed(1) ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {(r.vpd_kpa ?? r.vpd_kpa_avg)?.toFixed(3) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {readings.length > 500 && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
              Showing first 500 of {readings.length} readings. Download CSV for full data.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
