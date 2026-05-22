import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const TABS = [
  { key: 'awaiting_collection', label: 'Awaiting Collection' },
  { key: 'at_lab', label: 'At Lab' },
  { key: 'results_received', label: 'Results In' },
];

const INTERPRETATION_COLOR = {
  deficient: 'bg-red-100 text-red-800',
  low: 'bg-amber-100 text-amber-800',
  optimal: 'bg-green-100 text-green-800',
  high: 'bg-orange-100 text-orange-800',
  excessive: 'bg-red-200 text-red-900',
  unknown: 'bg-gray-100 text-gray-600',
};

function daysSince(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  return Math.floor(diff / 86400000);
}

function AwaitingRow({ row }) {
  const days = daysSince(row.teardown_started_at);
  return (
    <Link
      to={`/containers/${encodeURIComponent(row.container_id)}`}
      className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-orange-300 transition-colors"
    >
      <div>
        <div className="font-mono font-semibold text-gray-900 text-sm">{row.container_id}</div>
        <div className="text-xs text-gray-500 mt-0.5">{row.sub_zone_id} · Teardown{days != null ? ` · ${days}d in teardown` : ''}</div>
      </div>
      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-800">
        No sample
      </span>
    </Link>
  );
}

function AtLabRow({ row }) {
  const days = Number(row.days_waiting ?? 0);
  const isLate = days > 14;
  return (
    <Link
      to={`/containers/${encodeURIComponent(row.container_id)}`}
      className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-300 transition-colors"
    >
      <div className="min-w-0 flex-1 mr-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-gray-900 text-sm">{row.container_id}</span>
          <span className="text-xs text-gray-500">{row.sub_zone_id}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">
          {row.sample_label}{row.lab_name ? ` · ${row.lab_name}` : ''}
        </div>
        {row.lab_sent_at && (
          <div className="text-xs text-gray-400 mt-0.5">
            Sent {new Date(row.lab_sent_at).toLocaleDateString()}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <span
          className={`text-xs font-bold px-2 py-1 rounded-full ${
            isLate ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {days}d
        </span>
        {isLate && (
          <div className="text-xs text-amber-600 font-medium mt-0.5">Overdue</div>
        )}
      </div>
    </Link>
  );
}

function ResultsRow({ row }) {
  const ph = row.key_results?.find(r => r.parameter === 'pH');
  const ec = row.key_results?.find(r => r.parameter === 'EC');

  return (
    <Link
      to={`/containers/${encodeURIComponent(row.container_id)}`}
      className="flex items-start justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-green-300 transition-colors"
    >
      <div className="min-w-0 flex-1 mr-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-gray-900 text-sm">{row.container_id}</span>
          <span className="text-xs text-gray-500">{row.sub_zone_id}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">
          {row.sample_label}{row.lab_name ? ` · ${row.lab_name}` : ''}
        </div>
        {row.lab_results_at && (
          <div className="text-xs text-gray-400 mt-0.5">
            Results {new Date(row.lab_results_at).toLocaleDateString()}
          </div>
        )}
        {(ph || ec) && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {ph && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${INTERPRETATION_COLOR[ph.interpretation] ?? 'bg-gray-100 text-gray-600'}`}>
                pH {Number(ph.value).toFixed(1)}
              </span>
            )}
            {ec && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${INTERPRETATION_COLOR[ec.interpretation] ?? 'bg-gray-100 text-gray-600'}`}>
                EC {Number(ec.value).toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800 mt-0.5">
        Done
      </span>
    </Link>
  );
}

export default function SoilSampleTracker() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('status') || 'awaiting_collection';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getGlobalSoilSamples({ status: activeTab })
      .then(rows => { setData(rows); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [activeTab]);

  function setTab(key) {
    setSearchParams({ status: key });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/containers" className="text-sm text-green-700 font-medium hover:text-green-900">
          ← Containers
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'Fraunces, serif' }}>
        Soil Sample Tracker
      </h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab descriptions */}
      {activeTab === 'awaiting_collection' && (
        <p className="text-sm text-gray-500 mb-4">
          Containers in teardown with no soil sample collected yet. Tap to open the container and log a sample.
        </p>
      )}
      {activeTab === 'at_lab' && (
        <p className="text-sm text-gray-500 mb-4">
          Samples sent to the lab awaiting results. Amber badge means more than 14 days have passed since submission.
        </p>
      )}
      {activeTab === 'results_received' && (
        <p className="text-sm text-gray-500 mb-4">
          Samples with results received in the last 90 days. Tap to open the container and enter results if not yet entered.
        </p>
      )}

      {loading && (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="text-sm text-gray-400 py-8 text-center">
          {activeTab === 'awaiting_collection' && 'No containers in teardown are missing a soil sample.'}
          {activeTab === 'at_lab' && 'No samples are currently at the lab.'}
          {activeTab === 'results_received' && 'No results received in the last 90 days.'}
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="flex flex-col gap-2">
          {activeTab === 'awaiting_collection' && data.map(row => (
            <AwaitingRow key={row.container_id} row={row} />
          ))}
          {activeTab === 'at_lab' && data.map(row => (
            <AtLabRow key={row.sample_id} row={row} />
          ))}
          {activeTab === 'results_received' && data.map(row => (
            <ResultsRow key={row.sample_id} row={row} />
          ))}
        </div>
      )}

      {!loading && !error && activeTab === 'at_lab' && data.length > 0 && (
        <div className="mt-4 text-xs text-gray-400 text-center">
          {data.length} sample{data.length !== 1 ? 's' : ''} at lab · amber = &gt;14 days waiting
        </div>
      )}
    </div>
  );
}
