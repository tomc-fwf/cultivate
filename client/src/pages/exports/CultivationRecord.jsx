import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function CultivationRecord() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getBatches({ status: 'all' })
      .then(data => setBatches(data))
      .catch(() => {});
  }, []);

  const load = () => {
    if (!selectedBatchId) { setError('Select a batch first.'); return; }
    setLoading(true);
    setError('');
    api.getCultivationRecord(selectedBatchId)
      .then(data => { setRecord(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  const downloadJson = () => {
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const batchName = record.data?.batch?.metrc_batch_name ?? `batch-${record.batch_id}`;
    a.download = `cultivation-record-${batchName.replace(/[^a-zA-Z0-9-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = record?.data ? {
    fertigation: record.data.applications?.fertigation?.length ?? 0,
    foliar: record.data.applications?.foliar?.length ?? 0,
    pesticide: record.data.applications?.pesticide?.length ?? 0,
    amendments: record.data.applications?.amendments?.length ?? 0,
    observations: record.data.observations?.length ?? 0,
    harvests: record.data.harvest?.harvest_events?.length ?? 0,
    wasteTrim: record.data.harvest?.waste_trim_events?.length ?? 0,
    plantAssignments: record.data.plant_assignments?.length ?? 0,
    plantLosses: record.data.plant_losses?.length ?? 0,
  } : null;

  const batch = record?.data?.batch;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Cultivation Record
      </h1>
      <p className="text-sm text-gray-500 mb-5">Full per-batch compliance record · MN Statute 342.25</p>

      {/* Batch picker */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Select Batch</label>
        <select
          value={selectedBatchId}
          onChange={e => { setSelectedBatchId(e.target.value); setRecord(null); setError(''); }}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3"
          style={{ minHeight: '44px' }}
        >
          <option value="">— choose a batch —</option>
          {batches.map(b => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.metrc_batch_name ?? `Batch #${b.batch_id}`} — {b.strain_name} ({b.status})
            </option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={loading || !selectedBatchId}
          className="w-full bg-green-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          style={{ minHeight: '44px' }}
        >
          {loading ? 'Loading…' : 'Load Record'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {record && stats && (
        <div>
          {/* Batch header */}
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
            <div className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Batch</div>
            <div className="font-bold text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {batch?.metrc_batch_name ?? `Batch #${record.batch_id}`}
            </div>
            <div className="text-sm text-gray-600 mt-0.5">
              {batch?.strain_name} · {batch?.sub_zone_id ?? 'no sub-zone'} · Status: {batch?.status}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Generated {new Date(record.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} · record_version {record.record_version}
            </div>
          </div>

          {/* Statistics */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Summary</h2>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Fertigation', value: stats.fertigation, color: 'bg-blue-50 text-blue-800' },
              { label: 'Foliar', value: stats.foliar, color: 'bg-green-50 text-green-800' },
              { label: 'Pesticide', value: stats.pesticide, color: 'bg-red-50 text-red-800' },
              { label: 'Amendments', value: stats.amendments, color: 'bg-amber-50 text-amber-800' },
              { label: 'Observations', value: stats.observations, color: 'bg-purple-50 text-purple-800' },
              { label: 'Harvest Events', value: stats.harvests, color: 'bg-orange-50 text-orange-800' },
              { label: 'Waste Trim', value: stats.wasteTrim, color: 'bg-gray-100 text-gray-700' },
              { label: 'Plant Tags', value: stats.plantAssignments, color: 'bg-indigo-50 text-indigo-800' },
              { label: 'Plant Losses', value: stats.plantLosses, color: 'bg-red-50 text-red-700' },
            ].map(s => (
              <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Download */}
          <button
            onClick={downloadJson}
            className="w-full bg-gray-800 text-white rounded-2xl py-3.5 text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
            style={{ minHeight: '56px' }}
          >
            ↓ Download JSON Record
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">PDF export will be available in Phase 3.</p>
        </div>
      )}
    </div>
  );
}
