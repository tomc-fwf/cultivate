import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const DATE_FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
];

const AMENDMENT_TYPE_LABELS = {
  top_dress: 'Top Dress',
  mix_in: 'Mix In',
  drench: 'Drench',
  inoculation: 'Inoculation',
  media_replacement: 'Media Replacement',
  correction: 'Correction',
  removal: 'Removal',
  amendment: 'Amendment',
  other: 'Other',
};

const AMENDMENT_TYPE_COLOR = {
  top_dress:         'bg-green-100 text-green-800',
  mix_in:            'bg-teal-100 text-teal-800',
  drench:            'bg-blue-100 text-blue-800',
  inoculation:       'bg-purple-100 text-purple-800',
  media_replacement: 'bg-orange-100 text-orange-800',
  correction:        'bg-amber-100 text-amber-800',
  removal:           'bg-red-100 text-red-800',
  amendment:         'bg-lime-100 text-lime-800',
  other:             'bg-gray-100 text-gray-700',
};

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return isoStr; }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return isoStr.slice(0, 10); }
}

export default function AmendmentLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const containerFilter = searchParams.get('container_id');

  const [dateFilter, setDateFilter] = useState('today');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = { date: dateFilter };
    if (containerFilter) params.container_id = containerFilter;
    api.getContainerAmendments(params)
      .then(data => { setEntries(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateFilter, containerFilter]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            {containerFilter ? `Amendments — ${containerFilter}` : 'Amendment Log'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        {entries.length > 0 && (
          <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full mt-1">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {containerFilter && (
        <button
          onClick={() => navigate(`/containers/${encodeURIComponent(containerFilter)}`)}
          className="text-xs text-green-700 font-medium hover:text-green-900 mb-4 flex items-center gap-1"
        >
          ← Back to container
        </button>
      )}

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {DATE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setDateFilter(f.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              dateFilter === f.value ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
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
      ) : entries.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center mb-4">
          <div className="text-4xl mb-3">🌱</div>
          <div className="text-gray-500 text-sm font-medium">No amendments logged</div>
          <div className="text-gray-400 text-xs mt-1">
            {dateFilter === 'today' ? 'Nothing logged today yet.' : 'No entries in this period.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {entries.map(entry => (
            <AmendmentCard
              key={entry.amendment_id}
              entry={entry}
              showDate={dateFilter !== 'today'}
              showContainer={!containerFilter}
            />
          ))}
        </div>
      )}

      <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 pointer-events-none">
        <button
          onClick={() => navigate(
            containerFilter
              ? `/applications/amendments/new?container_id=${encodeURIComponent(containerFilter)}`
              : '/applications/amendments/new'
          )}
          className="pointer-events-auto w-full max-w-2xl bg-green-800 text-white font-semibold rounded-2xl shadow-lg hover:bg-green-900 active:bg-green-950 transition-colors flex items-center justify-center gap-2"
          style={{ minHeight: '64px', fontSize: '1rem' }}
        >
          <span className="text-xl leading-none">+</span>
          Log Amendment
        </button>
      </div>
    </div>
  );
}

function AmendmentCard({ entry, showDate, showContainer }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {showContainer && (
              <span className="font-mono font-semibold text-gray-900 text-sm" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {entry.container_id}
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${AMENDMENT_TYPE_COLOR[entry.amendment_type] ?? 'bg-gray-100 text-gray-700'}`}>
              {AMENDMENT_TYPE_LABELS[entry.amendment_type] ?? entry.amendment_type}
            </span>
            {entry.batch_strain_name && (
              <span className="text-xs text-gray-500">{entry.batch_strain_name}</span>
            )}
          </div>

          {entry.purpose && (
            <div className="text-xs text-gray-500 italic mt-0.5 truncate">{entry.purpose}</div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400 mt-1 flex-wrap">
            {entry.quantity != null && (
              <span className="font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {Number(entry.quantity).toFixed(1)} {entry.quantity_unit ?? ''}
              </span>
            )}
            {entry.application_method && (
              <span className="bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                {entry.application_method.replace(/_/g, ' ')}
              </span>
            )}
            {showDate && <span>{formatDate(entry.applied_at)}</span>}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-400">{formatTime(entry.applied_at)}</div>
          {entry.applicator_name && (
            <div className="text-xs text-gray-400 mt-0.5">{entry.applicator_name}</div>
          )}
        </div>
      </div>

      {entry.notes && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 italic">{entry.notes}</div>
      )}
    </div>
  );
}
