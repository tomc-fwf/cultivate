import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import { useCurrentConditions, SensorBadge } from '../../hooks/useCurrentConditions.jsx';

function fmtDate(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ts.slice(0, 10); }
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : type === 'warning' ? 'bg-amber-600' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto`}>
        {type === 'success' ? '✓ ' : type === 'warning' ? '⚠ ' : '✗ '}{message}
      </div>
    </div>
  );
}

const HB_STATUS_CHIP = {
  in_progress:  'bg-green-100 text-green-800 border-green-200',
  completed:    'bg-gray-100 text-gray-500',
  force_closed: 'bg-red-100 text-red-700',
};
const HB_STATUS_LABEL = {
  in_progress:  'In Progress',
  completed:    'Completed',
  force_closed: 'Force Closed',
};

export default function HarvestDashboard() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  const [batch, setBatch] = useState(null);
  const [harvestData, setHarvestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [toast, setToast] = useState(null);

  // Harvest batch conditions
  const [hbAmbientTemp, setHbAmbientTemp] = useState('');
  const [hbAmbientRh, setHbAmbientRh] = useState('');
  const [hbWindSpeed, setHbWindSpeed] = useState('');
  const [hbTempEdited, setHbTempEdited] = useState(false);
  const [hbRhEdited, setHbRhEdited] = useState(false);
  const [showConditions, setShowConditions] = useState(false);

  // Sensor auto-fill for harvest batch conditions
  const { conditions: sensorConditions } = useCurrentConditions(null, batch?.sub_zone_id ?? null);
  const [sensorReadingUsed, setSensorReadingUsed] = useState(null);

  useEffect(() => {
    if (!sensorConditions || !sensorConditions.temp_f) return;
    if (hbAmbientTemp === '' && hbAmbientRh === '') {
      setHbAmbientTemp(String(sensorConditions.temp_f.toFixed(1)));
      setHbAmbientRh(String(Math.round(sensorConditions.humidity_rh)));
      setSensorReadingUsed(sensorConditions);
      setHbTempEdited(false);
      setHbRhEdited(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorConditions, batch?.sub_zone_id]);

  function load() {
    setLoading(true);
    setError('');
    Promise.all([api.getBatch(batchId), api.getHarvestStatus(batchId)])
      .then(([batchData, harvestStatus]) => {
        setBatch(batchData);
        setHarvestData(harvestStatus);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [batchId]);

  // Group all assignments by container
  const assignmentsByContainer = useMemo(() => {
    if (!harvestData?.plant_assignments) return {};
    const map = {};
    for (const a of harvestData.plant_assignments) {
      if (!map[a.container_id]) map[a.container_id] = [];
      map[a.container_id].push(a);
    }
    return map;
  }, [harvestData]);

  const allAssignments = harvestData?.plant_assignments ?? [];
  const activeAssignments = allAssignments.filter(a => a.unassigned_at === null);
  const finalHarvestedCount = allAssignments.filter(a => a.has_final_harvest).length;

  // In-progress harvest batches by type
  const activeHB = harvestData?.harvest_batches?.find(hb => hb.status === 'in_progress' && hb.batch_type === 'harvest');
  const activeMB = harvestData?.harvest_batches?.find(hb => hb.status === 'in_progress' && hb.batch_type === 'manicure'); // 'manicure' is the API batch_type; UI uses "Partial Harvest Batch"

  async function handleCreateBatch(batchType) {
    if (creating) return;
    setCreating(true);
    setCreateError('');
    try {
      await api.createHarvestBatch({
        batch_id: Number(batchId),
        batch_type: batchType,
        ambient_temp_f: hbAmbientTemp !== '' ? parseFloat(hbAmbientTemp) : null,
        ambient_rh: hbAmbientRh !== '' ? parseFloat(hbAmbientRh) : null,
        wind_speed_mph: hbWindSpeed !== '' ? parseFloat(hbWindSpeed) : null,
      });
      load();
      setToast({ message: `${batchType === 'harvest' ? 'Harvest Batch (HB)' : 'Partial Harvest Batch (PHB)'} created`, type: 'success' });
    } catch (e) {
      setCreateError(e.message || 'Failed to create harvest batch');
    }
    setCreating(false);
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-6 text-gray-500 text-sm">Loading harvest data…</div>;
  }

  if (error || !batch) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error || 'Batch not found'}</div>
      </div>
    );
  }

  const containerIds = Object.keys(assignmentsByContainer).sort();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-10">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Back */}
      <button
        onClick={() => navigate(`/batches/${batchId}`)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
        style={{ minHeight: '44px' }}
      >
        ← Batch Detail
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'Fraunces, serif' }}>
            Harvest Dashboard
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-semibold text-green-900">{batch.strain_name}</span>
            {batch.sub_zone_id && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{batch.sub_zone_id}</span>
            )}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              batch.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
            }`}>
              {batch.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0 bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <div className="text-2xl font-bold text-green-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {finalHarvestedCount}/{allAssignments.length}
          </div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">final harvested</div>
        </div>
      </div>

      {/* METRC name */}
      {batch.metrc_batch_name && (
        <button
          onClick={() => navigator.clipboard?.writeText(batch.metrc_batch_name)}
          className="w-full text-left bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-4 hover:bg-gray-100 transition-colors"
          title="Tap to copy"
        >
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">METRC Plant Batch</div>
          <div className="font-mono text-sm font-bold text-gray-800">{batch.metrc_batch_name}</div>
        </button>
      )}

      {/* ── Harvest Batches ── */}
      <div className="mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Harvest Batches</h2>

        {/* Create buttons — supervisor only */}
        {isSupervisor && (
          <>
            {/* Conditions for new harvest batch */}
            <div className="mb-3">
              <button
                onClick={() => setShowConditions(s => !s)}
                className="flex items-center gap-1.5 text-xs text-gray-500 font-medium hover:text-gray-700 mb-2"
                style={{ minHeight: '36px' }}
              >
                <span className={`transition-transform text-[10px] ${showConditions ? 'rotate-90' : ''}`}>▶</span>
                Harvest conditions {hbAmbientTemp ? `(${hbAmbientTemp}°F / ${hbAmbientRh}% RH)` : '(optional)'}
              </button>
              {showConditions && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ambient temp (°F)</label>
                      <input
                        type="number" inputMode="decimal" step="0.1" placeholder="—"
                        value={hbAmbientTemp}
                        onChange={e => { setHbAmbientTemp(e.target.value); setHbTempEdited(true); }}
                        className="w-full border border-gray-300 rounded-xl px-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                        style={{ minHeight: '48px', fontFamily: 'JetBrains Mono, monospace' }}
                      />
                      {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={hbTempEdited} />}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Wind speed (mph)</label>
                      <input
                        type="number" inputMode="decimal" step="0.1" placeholder="—"
                        value={hbWindSpeed}
                        onChange={e => setHbWindSpeed(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                        style={{ minHeight: '48px', fontFamily: 'JetBrains Mono, monospace' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">RH (%)</label>
                    <input
                      type="number" inputMode="decimal" step="1" min="0" max="100" placeholder="—"
                      value={hbAmbientRh}
                      onChange={e => { setHbAmbientRh(e.target.value); setHbRhEdited(true); }}
                      className="w-full border border-gray-300 rounded-xl px-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                      style={{ minHeight: '48px', fontFamily: 'JetBrains Mono, monospace' }}
                    />
                    {sensorReadingUsed && <SensorBadge reading={sensorReadingUsed} manual={hbRhEdited} />}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => handleCreateBatch('harvest')}
                disabled={creating || !!activeHB}
                className={`flex-1 py-3 rounded-2xl text-sm font-semibold border-2 transition-colors ${
                  activeHB
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-green-600 bg-green-50 text-green-900 hover:bg-green-100 active:bg-green-200'
                }`}
                style={{ minHeight: '56px' }}
              >
                {creating ? '…' : activeHB ? '✓ HB Active' : '+ Create Harvest Batch (HB)'}
              </button>
              <button
                onClick={() => handleCreateBatch('manicure')}
                disabled={creating || !!activeMB}
                className={`flex-1 py-3 rounded-2xl text-sm font-semibold border-2 transition-colors ${
                  activeMB
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-purple-600 bg-purple-50 text-purple-900 hover:bg-purple-100 active:bg-purple-200'
                }`}
                style={{ minHeight: '56px' }}
              >
                {creating ? '…' : activeMB ? '✓ PHB Active' : '+ Create Partial Harvest Batch (PHB)'}
              </button>
            </div>
          </>
        )}

        {createError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 mb-3">{createError}</div>
        )}

        {/* Batch cards */}
        {harvestData?.harvest_batches?.length > 0 ? (
          <div className="flex flex-col gap-2">
            {harvestData.harvest_batches.map(hb => {
              const chipClass = HB_STATUS_CHIP[hb.status] ?? 'bg-gray-100 text-gray-500';
              const label = HB_STATUS_LABEL[hb.status] ?? hb.status;
              return (
                <div
                  key={hb.harvest_batch_id}
                  className={`bg-white rounded-2xl p-4 border ${hb.status === 'in_progress' ? 'border-green-300 shadow-sm' : 'border-gray-200'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Fraunces, serif' }}>
                          {hb.batch_type === 'harvest' ? 'Harvest Batch (HB)' : 'Partial Harvest Batch (PHB)'}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">#{hb.sequence_number}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chipClass}`}>{label}</span>
                      </div>
                      {hb.metrc_name && (
                        <div className="font-mono text-xs text-gray-500 mb-1">{hb.metrc_name}</div>
                      )}
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>Started {fmtDate(hb.started_at)}</span>
                        {hb.final_harvest_count > 0 && <span>{hb.final_harvest_count} final</span>}
                        {hb.partial_harvest_count > 0 && <span>{hb.partial_harvest_count} partial</span>}
                      </div>
                    </div>
                    {hb.status === 'in_progress' && isSupervisor && (
                      <button
                        onClick={() => navigate(`/harvest/batches/${hb.harvest_batch_id}/force-close?batch_id=${batchId}`)}
                        className="text-xs text-red-600 font-semibold border border-red-200 rounded-xl px-3 py-2 hover:bg-red-50 flex-shrink-0 transition-colors"
                        style={{ minHeight: '40px' }}
                      >
                        Force Close
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            No harvest batches yet. Create an HB before recording final harvests, or a PHB for partial harvests.
          </div>
        )}
      </div>

      {/* Waste Trim */}
      <div className="mb-5">
        <Link
          to={`/harvest/waste-trim/new?batch_id=${batchId}`}
          className="flex items-center justify-between w-full bg-amber-50 border-2 border-amber-200 text-amber-900 font-semibold rounded-2xl px-5 hover:border-amber-400 transition-colors"
          style={{ minHeight: '56px', textDecoration: 'none' }}
        >
          <span className="flex items-center gap-2"><span>✂️</span>Record Waste Trim</span>
          <span className="text-amber-500">→</span>
        </Link>
      </div>

      {/* ── Plant List ── */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
          Plants — {activeAssignments.length} active · {finalHarvestedCount} final harvested
        </h2>

        {!activeHB && !activeMB && harvestData?.harvest_batches?.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 mb-3">
            Create an HB to enable Final Harvest, or a PHB to enable Partial Harvest.
          </div>
        )}

        {containerIds.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-500 text-center">
            No plant assignments found for this batch.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {containerIds.map(cid => {
              const assignments = assignmentsByContainer[cid];
              return (
                <div key={cid} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm font-bold text-gray-800">{cid}</span>
                    {assignments.length > 1 && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold">
                        {assignments.length} plants
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {assignments.map(a => {
                      const isActive = a.unassigned_at === null;
                      const isHarvested = a.has_final_harvest === 1;
                      const tagLast4 = a.metrc_plant_tag ? a.metrc_plant_tag.slice(-4) : null;
                      return (
                        <div
                          key={a.assignment_id}
                          className={`rounded-xl p-3 ${isHarvested ? 'bg-gray-50 opacity-75' : isActive ? 'bg-green-50' : 'bg-amber-50'}`}
                        >
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            {tagLast4 ? (
                              <span className="font-mono text-sm text-gray-700">
                                …<span className="font-bold text-green-800 text-base">{tagLast4}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-amber-600 font-medium italic">No METRC tag assigned</span>
                            )}
                            {isHarvested && (
                              <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-semibold">Final Harvested ✓</span>
                            )}
                            {!isActive && !isHarvested && (
                              <span className="text-xs bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Unassigned</span>
                            )}
                          </div>

                          {isActive && !isHarvested && (
                            <div className="flex gap-2">
                              {activeMB ? (
                                <Link
                                  to={`/harvest/${batchId}/partial?harvest_batch_id=${activeMB.harvest_batch_id}&assignment_id=${a.assignment_id}`}
                                  className="flex-1 text-center text-xs font-semibold bg-purple-50 border border-purple-300 text-purple-800 rounded-xl hover:bg-purple-100 transition-colors flex items-center justify-center"
                                  style={{ minHeight: '44px', textDecoration: 'none' }}
                                >
                                  Partial Harvest
                                </Link>
                              ) : (
                                <div
                                  className="flex-1 text-center text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center"
                                  style={{ minHeight: '44px' }}
                                  title="Create a Partial Harvest Batch (PHB) first"
                                >
                                  No PHB active
                                </div>
                              )}
                              {activeHB ? (
                                <Link
                                  to={`/harvest/${batchId}/final?harvest_batch_id=${activeHB.harvest_batch_id}&assignment_id=${a.assignment_id}`}
                                  className="flex-1 text-center text-xs font-semibold bg-red-50 border border-red-300 text-red-800 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center"
                                  style={{ minHeight: '44px', textDecoration: 'none' }}
                                >
                                  Final Harvest
                                </Link>
                              ) : (
                                <div
                                  className="flex-1 text-center text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center"
                                  style={{ minHeight: '44px' }}
                                  title="Create a Harvest Batch (HB) first"
                                >
                                  No HB active
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
