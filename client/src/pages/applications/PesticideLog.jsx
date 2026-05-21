import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const DATE_FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
];

const METHOD_LABELS = {
  foliar_spray: 'Foliar Spray',
  soil_drench: 'Soil Drench',
  granular: 'Granular',
  other: 'Other',
};

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return isoStr; }
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return isoStr; }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try { return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return isoStr.slice(0, 10); }
}

export default function PesticideLog() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState('today');
  const [showREIOnly, setShowREIOnly] = useState(false);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = showREIOnly ? { rei_active: '1' } : { date: dateFilter };
    api.getPesticideApplications(params)
      .then(data => { setApps(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFilter, showREIOnly]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const activeREIs = apps.filter(a => a.rei_active).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Pesticide Log
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        {apps.length > 0 && (
          <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full mt-1">
            {apps.length} {apps.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {/* REI active banner */}
      {activeREIs > 0 && !showREIOnly && (
        <button
          onClick={() => setShowREIOnly(true)}
          className="w-full mb-4 bg-red-600 text-white rounded-2xl px-4 py-3 flex items-center justify-between font-semibold text-sm"
          style={{ minHeight: '56px' }}
        >
          <span>⚠ {activeREIs} active REI{activeREIs > 1 ? 's' : ''} — tap to view</span>
          <span>→</span>
        </button>
      )}

      {/* Filter bar */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        <button
          onClick={() => setShowREIOnly(false)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${!showREIOnly ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          style={{ minHeight: '40px' }}
        >
          By Date
        </button>
        <button
          onClick={() => setShowREIOnly(true)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${showREIOnly ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          style={{ minHeight: '40px' }}
        >
          REI Active
        </button>
        {!showREIOnly && DATE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setDateFilter(f.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${dateFilter === f.value ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            style={{ minHeight: '40px' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Loading…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      ) : apps.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center mb-4">
          <div className="text-4xl mb-3">🛡</div>
          <div className="text-gray-500 text-sm font-medium">
            {showREIOnly ? 'No active REIs' : 'No pesticide applications logged'}
          </div>
          <div className="text-gray-400 text-xs mt-1">
            {showREIOnly ? 'All areas are clear.' : dateFilter === 'today' ? 'Nothing logged today.' : 'No entries in this period.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {apps.map(app => (
            <PesticideCard
              key={app.pesticide_app_id}
              app={app}
              showDate={!showREIOnly && dateFilter !== 'today'}
              onClearREI={() => {
                api.clearPesticideREI(app.pesticide_app_id).then(load).catch(() => {});
              }}
            />
          ))}
        </div>
      )}

      <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 pointer-events-none">
        <button
          onClick={() => navigate('/applications/pesticide/new')}
          className="pointer-events-auto w-full max-w-2xl bg-red-700 text-white font-semibold rounded-2xl shadow-lg hover:bg-red-800 active:bg-red-900 transition-colors flex items-center justify-center gap-2"
          style={{ minHeight: '64px', fontSize: '1rem' }}
        >
          <span className="text-xl leading-none">+</span>
          Log Pesticide Application
        </button>
      </div>
    </div>
  );
}

function PesticideCard({ app, showDate, onClearREI }) {
  const target = app.container_id ?? app.row_id ?? (app.batch_sub_zone_id ? `${app.batch_sub_zone_id} (zone)` : 'Full batch');
  const reiExpires = app.rei_expires_at ? new Date(app.rei_expires_at) : null;
  const reiActive = app.rei_active;

  return (
    <div className={`bg-white border-2 rounded-2xl p-4 ${reiActive ? 'border-red-300' : 'border-gray-200'}`}>
      {/* REI active banner */}
      {reiActive && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3 gap-2">
          <div>
            <div className="text-xs font-bold text-red-700 uppercase tracking-wide">REI Active</div>
            <div className="text-xs text-red-600 mt-0.5">
              Restricted until {formatDateTime(app.rei_expires_at)}
            </div>
          </div>
          <button
            onClick={onClearREI}
            className="text-xs bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700 flex-shrink-0"
            style={{ minHeight: '36px' }}
          >
            Clear REI
          </button>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>
              {app.batch_strain_name}
            </span>
            {app.batch_sub_zone_id && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{app.batch_sub_zone_id}</span>
            )}
            {app.phi_compliant === 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">PHI ⚠</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="font-semibold text-gray-700">{app.target_pest}</span>
            <span className="text-gray-400">·</span>
            <span className="bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded font-medium">
              {METHOD_LABELS[app.application_method] ?? app.application_method}
            </span>
            <span className="text-gray-400">{target}</span>
            {showDate && <span className="text-gray-400">{formatDate(app.applied_at)}</span>}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <span>{Number(app.rate_value).toFixed(2)} {app.rate_unit}</span>
            <span>{Number(app.ambient_temp_f).toFixed(0)}°F</span>
            <span>{Number(app.wind_speed_mph).toFixed(0)} mph</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-400">{formatTime(app.applied_at)}</div>
          {app.applicator_name && (
            <div className="text-xs text-gray-400 mt-0.5">{app.applicator_name}</div>
          )}
        </div>
      </div>

      {app.notes && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 italic">{app.notes}</div>
      )}
    </div>
  );
}
