import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';


function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return String(str); }
}

export default function TagVerification() {
  const navigate = useNavigate();
  const [subZones, setSubZones] = useState([]);
  const [subZone, setSubZone] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getContainerSummary()
      .then(d => setSubZones(d.map(sz => sz.sub_zone_id).sort()))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (subZone) params.sub_zone_id = subZone;
    api.getTagVerification(params)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [subZone]);

  useEffect(() => { load(); }, [load]);

  // Group assignments by sub_zone → row
  const grouped = data ? data.assignments.reduce((acc, a) => {
    const sz = a.sub_zone_id ?? 'Unknown';
    const row = a.row_id ?? 'Unknown';
    if (!acc[sz]) acc[sz] = {};
    if (!acc[sz][row]) acc[sz][row] = [];
    acc[sz][row].push(a);
    return acc;
  }, {}) : {};

  const downloadCsv = () => {
    const params = {};
    if (subZone) params.sub_zone_id = subZone;
    api.downloadTagVerificationCsv(params);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/compliance')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Compliance
      </button>

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Tag Verification
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Active plant-to-container tag mapping · walkthrough sheet</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
            style={{ minHeight: '40px' }}
          >
            Print Sheet
          </button>
          <button
            onClick={downloadCsv}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
            style={{ minHeight: '40px' }}
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sub-zone filter</label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSubZone('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${subZone === '' ? 'bg-green-800 text-white border-green-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            All zones
          </button>
          {subZones.map(sz => (
            <button
              key={sz}
              onClick={() => setSubZone(sz)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${subZone === sz ? 'bg-green-800 text-white border-green-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
      )}

      {data && !loading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total Assigned', value: data.total_assigned },
              { label: 'Tagged', value: data.total_tagged, color: 'text-green-700' },
              { label: 'Untagged', value: data.total_untagged, color: data.total_untagged > 0 ? 'text-amber-600' : 'text-gray-600' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-center">
                <div className={`text-2xl font-bold ${s.color ?? 'text-gray-900'}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Generated: {new Date(data.generated_at).toLocaleString('en-US')}
            {data.filter_sub_zone ? ` · filtered to ${data.filter_sub_zone}` : ''}
          </p>

          {data.assignments.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
              No active plant assignments found.
            </div>
          ) : (
            Object.keys(grouped).sort().map(sz => (
              <div key={sz} className="mb-5">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Sub-zone {sz}</h2>
                {Object.keys(grouped[sz]).sort().map(rowId => (
                  <div key={rowId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-2">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                      <span className="text-xs font-bold text-gray-600 uppercase font-mono">{rowId}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-50 text-left">
                            <th className="px-3 py-2 font-semibold text-gray-500">Container</th>
                            <th className="px-3 py-2 font-semibold text-gray-500">METRC Tag</th>
                            <th className="px-3 py-2 font-semibold text-gray-500">Last 4</th>
                            <th className="px-3 py-2 font-semibold text-gray-500">Strain</th>
                            <th className="px-3 py-2 font-semibold text-gray-500">Tagged</th>
                            <th className="px-3 py-2 font-semibold text-gray-500">Verified ☐</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {grouped[sz][rowId].map(a => (
                            <tr key={a.assignment_id} className={a.tagged ? '' : 'bg-amber-50'}>
                              <td className="px-3 py-2 font-mono text-gray-800">{a.container_id}</td>
                              <td className="px-3 py-2 font-mono text-gray-600 text-xs">
                                {a.metrc_plant_tag ? (
                                  <>
                                    <span className="text-gray-400">{String(a.metrc_plant_tag).slice(0, -4)}</span>
                                    <span className="font-bold text-gray-800">{String(a.metrc_plant_tag).slice(-4)}</span>
                                  </>
                                ) : (
                                  <span className="text-amber-600 font-semibold">Untagged</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono font-bold text-gray-800">
                                {a.last_4 ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{a.strain_name}</td>
                              <td className="px-3 py-2">
                                {a.tagged ? (
                                  <span className="text-green-600 font-semibold">Yes</span>
                                ) : (
                                  <span className="text-amber-600 font-semibold">No</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-300">☐</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
