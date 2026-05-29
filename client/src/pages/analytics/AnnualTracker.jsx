import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const SUB_ZONES = ['Z1A', 'Z1B', 'Z2A', 'Z2B', 'Z3A', 'Z3B', 'Z4A', 'Z4B'];
const WEEK_W  = 17;   // px per week column
const ROW_H   = 48;   // px per sub-zone row
const LABEL_W = 72;   // px for the sub-zone label column
const HEADER_H = 52;  // px for the month-label header row

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function daysInYear(y) {
  return isLeapYear(y) ? 366 : 365;
}

// Parse a YYYY-MM-DD string as local midnight (avoids UTC-offset day shifts).
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const STATUS_LABELS = {
  germ: 'Germ', seedling: 'Seedling', 'cult-hoop': 'Cult-Hoop',
  'field-veg': 'Field Veg', 'field-flower': 'Field Flower', flush: 'Flush',
  harvest_window: 'Harvest Window', harvesting: 'Harvesting', closed: 'Closed',
};

export default function AnnualTracker() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear]       = useState(currentYear);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tooltip, setTooltip] = useState(null); // { batch, clientX, clientY }

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getAnnualTracker({ year })
      .then(d  => { setData(d);         setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [year]);

  // ── chart geometry ───────────────────────────────────────────────────────
  const totalW    = 52 * WEEK_W;
  const yearStart = new Date(year, 0, 1);              // Jan 1 local midnight
  const yearEnd   = new Date(year + 1, 0, 1);          // Jan 1 next year (exclusive)
  const yearMs    = yearEnd - yearStart;
  const today     = new Date();

  // Position (px from chart left) for a given Date.
  function datePx(date) {
    return ((date - yearStart) / yearMs) * totalW;
  }

  // Returns { left, width } in px, or null if the batch doesn't overlap this year.
  function batchBar(batch) {
    const sowMs = parseLocalDate(batch.sow_date).getTime();
    // Open batches extend to the lesser of today and year-end.
    const rawEnd = batch.closed_date
      ? parseLocalDate(batch.closed_date).getTime() + 86_400_000  // include the close day
      : Math.min(today.getTime() + 86_400_000, yearEnd.getTime());

    const start = Math.max(sowMs, yearStart.getTime());
    const end   = Math.min(rawEnd, yearEnd.getTime());
    if (end <= start) return null;

    const left  = ((start - yearStart.getTime()) / yearMs) * totalW;
    const width = Math.max(3, ((end - start) / yearMs) * totalW);
    return { left, width };
  }

  // Today marker position (null if outside this year).
  const todayPx = year === currentYear ? datePx(today) : null;

  // Month tick positions.
  const monthTicks = MONTHS.map((label, m) => ({
    label,
    left: datePx(new Date(year, m, 1)),
  }));

  // Group batches by sub-zone.
  const byZone = Object.fromEntries(SUB_ZONES.map(z => [z, []]));
  (data?.batches ?? []).forEach(b => {
    if (b.sub_zone_id && byZone[b.sub_zone_id]) byZone[b.sub_zone_id].push(b);
  });

  // Bar color: vivid for open batches, muted for closed.
  function barColor(batch) {
    const open = !batch.closed_date;
    return batch.strain_type === 'auto'
      ? (open ? '#16a34a' : '#86efac')   // green-700 / green-300
      : (open ? '#7c3aed' : '#c4b5fd');  // violet-700 / violet-300
  }

  function daysOpen(batch) {
    const s = parseLocalDate(batch.sow_date);
    const e = batch.closed_date ? parseLocalDate(batch.closed_date) : today;
    return Math.round((e - s) / 86_400_000);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate('/applications')}
        className="text-sm text-gray-500 mb-4 hover:text-gray-700 flex items-center gap-1"
      >
        ← Applications
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Annual Batch Tracker
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Gantt view of all batches by sub-zone. Green&nbsp;=&nbsp;auto, purple&nbsp;=&nbsp;photo.
        Vivid&nbsp;=&nbsp;open, muted&nbsp;=&nbsp;closed. Click a bar to open the batch.
      </p>

      {/* Year picker */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setYear(y => y - 1)}
          style={{ minHeight: '44px', minWidth: '44px' }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 font-bold"
        >
          ‹
        </button>
        <span className="font-semibold text-xl tabular-nums w-16 text-center">{year}</span>
        <button
          onClick={() => setYear(y => y + 1)}
          style={{ minHeight: '44px', minWidth: '44px' }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 font-bold"
        >
          ›
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
          {error}
          <button
            onClick={() => { setLoading(true); setError(null); api.getAnnualTracker({ year }).then(d => { setData(d); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); }); }}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div style={{ minWidth: LABEL_W + totalW, position: 'relative' }}>

              {/* ── Month-label header ── */}
              <div style={{ display: 'flex', height: HEADER_H, borderBottom: '1px solid #e5e7eb' }}>
                {/* Label column spacer */}
                <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#f9fafb' }} />

                {/* Chart header */}
                <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                  {/* Week grid lines */}
                  {Array.from({ length: 53 }, (_, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      left: i * WEEK_W,
                      top: 0, bottom: 0, width: 1,
                      background: i % 4 === 0 ? '#d1d5db' : '#f3f4f6',
                    }} />
                  ))}

                  {/* Month labels */}
                  {monthTicks.map(({ label, left }, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      left,
                      top: 0, bottom: 0,
                      display: 'flex', alignItems: 'flex-end',
                      paddingBottom: 7, paddingLeft: 4,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                    </div>
                  ))}

                  {/* Today marker */}
                  {todayPx !== null && todayPx >= 0 && todayPx <= totalW && (
                    <div style={{
                      position: 'absolute',
                      left: todayPx, top: 0, bottom: 0,
                      width: 2, background: '#ef4444', opacity: 0.7,
                    }} />
                  )}
                </div>
              </div>

              {/* ── Sub-zone rows ── */}
              {SUB_ZONES.map((zoneId, zi) => {
                const batches = byZone[zoneId];
                return (
                  <div key={zoneId} style={{
                    display: 'flex',
                    height: ROW_H,
                    borderBottom: zi < SUB_ZONES.length - 1 ? '1px solid #f3f4f6' : 'none',
                    background: zi % 2 === 0 ? '#fafafa' : '#ffffff',
                  }}>
                    {/* Label */}
                    <div style={{
                      width: LABEL_W, flexShrink: 0,
                      borderRight: '1px solid #e5e7eb',
                      display: 'flex', alignItems: 'center',
                      paddingLeft: 12,
                      fontSize: 12, fontWeight: 700, color: '#374151',
                      fontFamily: 'JetBrains Mono, monospace',
                      letterSpacing: '0.02em',
                    }}>
                      {zoneId}
                    </div>

                    {/* Chart row */}
                    <div style={{ position: 'relative', flex: 1 }}>
                      {/* Week grid lines */}
                      {Array.from({ length: 53 }, (_, i) => (
                        <div key={i} style={{
                          position: 'absolute',
                          left: i * WEEK_W, top: 0, bottom: 0, width: 1,
                          background: i % 4 === 0 ? '#e5e7eb' : '#f9fafb',
                        }} />
                      ))}

                      {/* Today marker */}
                      {todayPx !== null && todayPx >= 0 && todayPx <= totalW && (
                        <div style={{
                          position: 'absolute',
                          left: todayPx, top: 4, bottom: 4,
                          width: 2, background: '#ef4444', opacity: 0.45, zIndex: 1,
                        }} />
                      )}

                      {/* Batch bars */}
                      {batches.map(batch => {
                        const bar = batchBar(batch);
                        if (!bar) return null;
                        const color = barColor(batch);
                        return (
                          <div
                            key={batch.batch_id}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/batches/${batch.batch_id}`)}
                            onKeyDown={e => e.key === 'Enter' && navigate(`/batches/${batch.batch_id}`)}
                            onMouseEnter={e => setTooltip({ batch, clientX: e.clientX, clientY: e.clientY })}
                            onMouseMove={e => setTooltip(t => t ? { ...t, clientX: e.clientX, clientY: e.clientY } : null)}
                            onMouseLeave={() => setTooltip(null)}
                            style={{
                              position: 'absolute',
                              left: bar.left, width: bar.width,
                              top: 7, bottom: 7,
                              background: color,
                              borderRadius: 4,
                              cursor: 'pointer',
                              zIndex: 2,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                              display: 'flex', alignItems: 'center',
                              paddingLeft: 5, overflow: 'hidden',
                              outline: 'none',
                            }}
                          >
                            {bar.width > 36 && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: 'white',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                maxWidth: bar.width - 10,
                                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                              }}>
                                {batch.strain_name}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-5 px-4 py-3 border-t border-gray-100 bg-gray-50">
              {[
                { color: '#16a34a', label: 'Auto (active)' },
                { color: '#86efac', label: 'Auto (closed)' },
                { color: '#7c3aed', label: 'Photo (active)' },
                { color: '#c4b5fd', label: 'Photo (closed)' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-gray-600">
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: color, flexShrink: 0 }} />
                  {label}
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div style={{ width: 2, height: 14, background: '#ef4444', flexShrink: 0 }} />
                Today
              </div>
            </div>
          </div>

          {/* Summary line */}
          {data?.batches && (
            <p className="text-xs text-gray-400 mt-3 text-right">
              {data.batches.length} batch{data.batches.length !== 1 ? 'es' : ''} in {year}
              {' · '}{daysInYear(year)} days
            </p>
          )}

          {data?.batches?.length === 0 && (
            <div className="text-sm text-gray-500 py-6 text-center">No batches found for {year}.</div>
          )}
        </>
      )}

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.clientX + 14,
          top: tooltip.clientY - 90,
          background: 'rgba(17,24,39,0.95)',
          color: 'white',
          padding: '9px 13px',
          borderRadius: 8,
          fontSize: 12,
          pointerEvents: 'none',
          zIndex: 9999,
          maxWidth: 220,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>{tooltip.batch.strain_name}</div>
          <div style={{ color: '#d1d5db' }}>
            {tooltip.batch.sub_zone_id} · {tooltip.batch.plant_count_initial} plants
          </div>
          <div style={{ color: '#d1d5db' }}>
            {tooltip.batch.sow_date} → {tooltip.batch.closed_date ?? 'open'}
            {' '}({daysOpen(tooltip.batch)}d)
          </div>
          <div style={{ color: '#9ca3af', marginTop: 2 }}>
            {STATUS_LABELS[tooltip.batch.status] ?? tooltip.batch.status}
            {' · '}{tooltip.batch.strain_type}
          </div>
          {tooltip.batch.metrc_plant_batch_uid && (
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
              METRC {tooltip.batch.metrc_plant_batch_uid}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
