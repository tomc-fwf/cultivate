import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return String(str); }
}

function StatusChip({ status }) {
  const map = {
    germ: 'bg-gray-100 text-gray-600',
    seedling: 'bg-lime-100 text-lime-800',
    'cult-hoop': 'bg-yellow-100 text-yellow-800',
    'field-veg': 'bg-green-100 text-green-800',
    'field-flower': 'bg-purple-100 text-purple-700',
    flush: 'bg-blue-100 text-blue-700',
    harvest_window: 'bg-amber-100 text-amber-800',
    harvesting: 'bg-orange-100 text-orange-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status?.replace(/-/g, '‑') ?? '—'}
    </span>
  );
}

export default function PlantInventory() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPlantInventory()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/compliance')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Compliance
      </button>

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Plant Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Current active batches · inspector handoff view</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
            style={{ minHeight: '40px' }}
          >
            Print
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
      )}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Active Batches', value: data.total_active_batches },
              { label: 'Active Plants',  value: data.total_active_plants },
              { label: 'Tagged Plants',  value: data.total_tagged_plants },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-center">
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Generated: {new Date(data.generated_at).toLocaleString('en-US')}
          </p>

          {data.batches.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
              No active batches found.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-left">
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Batch / Strain</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Zone</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Status</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600 text-right">Plants</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600 text-right">Tagged</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Stage Days</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Sow Date</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">Recipe</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">METRC UID</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-600">REI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.batches.map(b => (
                      <tr
                        key={b.batch_id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/batches/${b.batch_id}`)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-gray-800">{b.strain_name}</div>
                          <div className="text-gray-400 font-mono">#{b.batch_id}</div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 font-mono">{b.sub_zone_id ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <StatusChip status={b.status} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold text-gray-800">{b.plant_count_current}</span>
                          <span className="text-gray-400">/{b.plant_count_initial}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {b.tagged_count > 0 ? (
                            <span className={b.tagged_count < b.plant_count_current ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold'}>
                              {b.tagged_count}
                            </span>
                          ) : (
                            <span className="text-red-600 font-semibold">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {b.days_in_stage != null ? `${b.days_in_stage}d` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(b.sow_date)}</td>
                        <td className="px-3 py-2.5 text-gray-600">{b.current_recipe ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          {b.metrc_uid_status === 'set' ? (
                            <span className="text-green-700 font-mono text-xs">{String(b.metrc_plant_batch_uid).slice(0, 10)}…</span>
                          ) : (
                            <span className="text-amber-600 font-semibold text-xs">Missing</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {b.has_active_rei ? (
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">ACTIVE</span>
                          ) : (
                            <span className="text-green-600 text-xs">Clear</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
