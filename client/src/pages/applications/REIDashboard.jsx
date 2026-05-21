import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return isoStr; }
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return isoStr; }
}

function timeRemaining(isoExpiry) {
  const ms = new Date(isoExpiry).getTime() - Date.now();
  if (ms <= 0) return { label: 'EXPIRED', urgent: true };
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const urgent = ms < 3600000; // < 1 hour
  if (hours > 0) return { label: `${hours}h ${minutes}m remaining`, urgent };
  return { label: `${minutes}m remaining`, urgent: true };
}

function isToday(isoStr) {
  if (!isoStr) return false;
  return new Date(isoStr).toDateString() === new Date().toDateString();
}

export default function REIDashboard() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clearingId, setClearingId] = useState(null);
  const [clearError, setClearError] = useState('');

  // Re-render time-remaining every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.getPesticideApplications({ rei_active: '1' })
      .then(data => { setEntries(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleClearREI(id) {
    setClearingId(id);
    setClearError('');
    try {
      await api.clearPesticideREI(id);
      setEntries(prev => prev.filter(e => e.pesticide_app_id !== id));
    } catch (e) {
      setClearError(e.message);
    } finally {
      setClearingId(null);
    }
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">

      {/* Header */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-500 font-medium mb-4 flex items-center gap-1 hover:text-gray-700"
      >
        ← Back
      </button>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            REI Status
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        {entries.length > 0 && (
          <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full mt-1">
            {entries.length} active
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-5">
        Areas with active re-entry restrictions after pesticide application.
      </p>

      {clearError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {clearError}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      ) : entries.length === 0 ? (
        <AllClearState />
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map(entry => {
            const { label: remaining, urgent } = timeRemaining(entry.rei_expires_at);
            const area = entry.container_id ?? entry.row_id ?? entry.batch_sub_zone_id ?? '—';
            return (
              <REICard
                key={entry.pesticide_app_id}
                entry={entry}
                area={area}
                remaining={remaining}
                urgent={urgent}
                clearing={clearingId === entry.pesticide_app_id}
                onClear={() => handleClearREI(entry.pesticide_app_id)}
              />
            );
          })}
        </div>
      )}

      {/* Link to log a new pesticide application */}
      <div className="mt-6 text-center">
        <button
          onClick={() => navigate('/applications/pesticide/new')}
          className="text-sm text-red-700 font-semibold hover:text-red-900 underline"
        >
          + Log pesticide application
        </button>
      </div>
    </div>
  );
}

function AllClearState() {
  return (
    <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-8 text-center">
      <div className="text-5xl mb-4">✓</div>
      <div className="text-xl font-bold text-green-800 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        All Clear
      </div>
      <div className="text-sm text-green-700">
        No active re-entry restrictions. All areas are safe to enter.
      </div>
    </div>
  );
}

function REICard({ entry, area, remaining, urgent, clearing, onClear }) {
  const appliedToday = isToday(entry.applied_at);

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${urgent ? 'border-red-500' : 'border-red-300'}`}>

      {/* Top bar */}
      <div className={`px-4 py-2 flex items-center justify-between ${urgent ? 'bg-red-600' : 'bg-red-500'}`}>
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <span>⚠</span>
          <span>REI ACTIVE</span>
        </div>
        <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urgent ? 'bg-red-800 text-red-100' : 'bg-red-400 text-white'}`}>
          {remaining}
        </div>
      </div>

      {/* Body */}
      <div className="bg-white px-4 py-4">

        {/* Area — the most important field */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="font-mono font-bold text-2xl text-gray-900 tracking-tight" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {area}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {entry.batch_strain_name && (
                <span className="text-sm font-medium text-gray-700">{entry.batch_strain_name}</span>
              )}
              {entry.batch_sub_zone_id && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                  {entry.batch_sub_zone_id}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClear}
            disabled={clearing}
            className="flex-shrink-0 bg-green-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-green-800 active:bg-green-900 disabled:opacity-50 transition-colors"
            style={{ minHeight: '48px', minWidth: '100px' }}
          >
            {clearing ? (
              <span className="flex items-center gap-1.5 justify-center">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                Clearing…
              </span>
            ) : 'Clear REI ✓'}
          </button>
        </div>

        {/* Pest and method */}
        <div className="flex items-center gap-2 flex-wrap text-sm mb-3">
          <span className="font-semibold text-gray-800">{entry.target_pest}</span>
          {entry.application_method && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium capitalize">
              {entry.application_method.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Timestamps */}
        <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
          <div>
            <div className="text-gray-400 font-medium mb-0.5">Applied</div>
            <div className="font-medium text-gray-700">
              {appliedToday ? `Today ${formatTime(entry.applied_at)}` : formatDateTime(entry.applied_at)}
            </div>
          </div>
          <div>
            <div className="text-gray-400 font-medium mb-0.5">REI expires</div>
            <div className={`font-semibold ${urgent ? 'text-red-600' : 'text-gray-700'}`}>
              {formatDateTime(entry.rei_expires_at)}
            </div>
          </div>
        </div>

        {/* Applicator */}
        {entry.applicator_name && (
          <div className="text-xs text-gray-400 mt-2">
            Applied by <span className="font-medium">{entry.applicator_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
