import { useState, useEffect } from 'react';
import { api } from '../api';

export function useCurrentConditions(locationId, subZoneId) {
  const [conditions, setConditions] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId && !subZoneId) return;
    setLoading(true);
    const params = {};
    if (subZoneId) params.sub_zone_id = subZoneId;
    else if (locationId) params.location_id = locationId;
    api.getCurrentConditions(params)
      .then(data => { setConditions(Array.isArray(data) ? (data[0] ?? null) : (data ?? null)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [locationId, subZoneId]);

  return { conditions, loading };
}

export function SensorBadge({ reading, manual = false }) {
  if (!reading) return null;
  if (manual) {
    return <span className="text-xs mt-1 block text-gray-400">✏ Manual entry</span>;
  }
  if (reading.age_seconds == null) return null;
  const minutes = Math.round(reading.age_seconds / 60);
  const timeLabel = minutes < 1 ? 'just now' : `${minutes} min ago`;
  const stale = reading.age_seconds > 1800;

  return (
    <span className={`text-xs mt-1 block ${stale ? 'text-amber-600' : 'text-green-600'}`}>
      {stale ? '⚠ Stale — ' : '📡 '}Auto-filled · {timeLabel}
    </span>
  );
}
