import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const DATE_FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
];

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return isoStr;
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return isoStr.slice(0, 10);
  }
}

export default function FertigationLog() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState('today');
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.getFertigationApplications({ date: dateFilter })
      .then(data => { setApps(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Fertigation Log
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        {apps.length > 0 && (
          <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full mt-1">
            {apps.length} {apps.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {/* Date filter strip */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {DATE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setDateFilter(f.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              dateFilter === f.value
                ? 'bg-green-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={{ minHeight: '40px' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Loading…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      ) : apps.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center mb-4">
          <div className="text-4xl mb-3">💧</div>
          <div className="text-gray-500 text-sm font-medium">No applications logged</div>
          <div className="text-gray-400 text-xs mt-1">
            {dateFilter === 'today' ? 'Nothing logged today yet.' : `No entries in this period.`}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {apps.map(app => (
            <ApplicationCard
              key={app.application_id}
              app={app}
              showDate={dateFilter !== 'today'}
              onEdit={() => navigate(`/applications/fertigation/new?batch_id=${app.batch_id}&edit_id=${app.application_id}`)}
            />
          ))}
        </div>
      )}

      {/* FAB / Log button — fixed at bottom in thumb zone */}
      <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 pointer-events-none">
        <button
          onClick={() => navigate('/applications/fertigation/new')}
          className="pointer-events-auto w-full max-w-2xl bg-green-800 text-white font-semibold rounded-2xl shadow-lg hover:bg-green-900 active:bg-green-950 transition-colors flex items-center justify-center gap-2"
          style={{ minHeight: '64px', fontSize: '1rem' }}
        >
          <span className="text-xl leading-none">+</span>
          Log Fertigation Application
        </button>
      </div>
    </div>
  );
}

function ApplicationCard({ app, showDate, onEdit }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {/* Left: batch info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>
              {app.batch_strain_name}
            </span>
            {app.batch_sub_zone_id && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                {app.batch_sub_zone_id}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="bg-green-50 text-green-800 px-2 py-0.5 rounded-full font-medium">
              {app.recipe_name} v{app.recipe_version}
            </span>
            {showDate && (
              <span className="text-gray-400">{formatDate(app.applied_at)}</span>
            )}
          </div>
        </div>

        {/* Right: metrics */}
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-400 mb-1">{formatTime(app.applied_at)}</div>
          <div className="font-mono text-sm text-gray-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <span className="text-green-800 font-semibold">EC {Number(app.ec_measured).toFixed(2)}</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-green-800 font-semibold">pH {Number(app.ph_measured).toFixed(1)}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {Number(app.volume_gallons).toFixed(1)} gal
          </div>
        </div>
      </div>

      {/* Edit / locked */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        {app.notes ? (
          <span className="text-xs text-gray-500 italic truncate max-w-[60%]">{app.notes}</span>
        ) : (
          <span />
        )}
        {app.editable ? (
          <button
            onClick={onEdit}
            className="text-xs text-green-700 font-medium hover:text-green-900 flex items-center gap-1"
            style={{ minHeight: '40px', minWidth: '56px' }}
          >
            ✏ Edit
          </button>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium">
            LOCKED
          </span>
        )}
      </div>
    </div>
  );
}
