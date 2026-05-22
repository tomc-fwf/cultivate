import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const DRAFT_KEY = 'cv_draft_planting_plan_new';

const SUB_ZONES = [
  'Z1A', 'Z1B', 'Z2A', 'Z2B', 'Z3A', 'Z3B', 'Z4A', 'Z4B',
];

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : 'bg-red-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl`}>
        {message}
      </div>
    </div>
  );
}

export default function PlantingPlanNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get('batch_id');

  const [batch, setBatch] = useState(null);
  const [batchLoading, setBatchLoading] = useState(!!batchId);
  const [summary, setSummary] = useState([]);

  const [subZoneId, setSubZoneId] = useState('');
  const [plantsToPlace, setPlantsToPlace] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const autoSaveTimer = useRef(null);

  useEffect(() => {
    api.getContainerSummary()
      .then(data => setSummary(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!batchId) return;
    setBatchLoading(true);
    api.getBatch(batchId)
      .then(data => {
        setBatch(data);
        setPlantsToPlace(String(data.plant_count_current ?? data.plant_count_initial ?? ''));
        setBatchLoading(false);
      })
      .catch(e => { setErr(e.message); setBatchLoading(false); });
  }, [batchId]);

  // Restore draft
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (draft) {
        if (draft.subZoneId) setSubZoneId(draft.subZoneId);
        if (draft.plantsToPlace) setPlantsToPlace(draft.plantsToPlace);
        if (draft.notes) setNotes(draft.notes);
      }
    } catch { /* ignore */ }
  }, []);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ subZoneId, plantsToPlace, notes, savedAt: Date.now() }));
    } catch { /* ignore */ }
  }, [subZoneId, plantsToPlace, notes]);

  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 3000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [saveDraft]);

  function validate() {
    const errors = {};
    if (!batchId) errors.batch = 'batch_id is required (navigate here from a batch)';
    if (!subZoneId) errors.subZoneId = 'Sub-zone is required';
    const count = Number(plantsToPlace);
    if (!plantsToPlace || isNaN(count) || count <= 0) errors.plantsToPlace = 'Plants to place must be a positive number';
    return errors;
  }

  async function handleSave() {
    const errors = validate();
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setSaving(true);
    setErr('');
    try {
      const plan = await api.createPlantingPlan({
        batch_id: Number(batchId),
        sub_zone_id: subZoneId,
        plants_to_place: Number(plantsToPlace),
        notes: notes || null,
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setToast({ message: 'Plan created ✓', type: 'success' });
      setTimeout(() => navigate(`/planting-plans/${plan.plan_id}`), 900);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  // Ready counts per sub-zone from summary
  const readyBySubZone = {};
  for (const sz of summary) {
    readyBySubZone[sz.sub_zone_id] = sz.counts?.ready ?? 0;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <button
        onClick={() => batchId ? navigate(`/batches/${batchId}`) : navigate('/planting-plans')}
        className="text-sm text-green-700 font-medium mb-5 flex items-center gap-1 hover:text-green-900"
      >
        ← {batchId ? 'Back to Batch' : 'Planting Plans'}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        New Planting Plan
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Select which sub-zone containers to fill and commit plants to field.
      </p>

      {/* Batch context */}
      {batchLoading ? (
        <div className="text-sm text-gray-400 mb-4">Loading batch…</div>
      ) : batch ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-6">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Batch</div>
          <div className="font-semibold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>{batch.strain_name}</div>
          <div className="text-xs text-green-700 mt-0.5">
            {batch.plant_count_current} plants · {batch.status}
          </div>
        </div>
      ) : batchId ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          Batch not found. {err}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 mb-6 text-sm">
          Navigate here from a batch to create a plan for it.
        </div>
      )}

      {err && !batchId && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{err}</div>
      )}

      {/* Sub-zone selector */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          Sub-zone <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {SUB_ZONES.map(sz => {
            const ready = readyBySubZone[sz] ?? 0;
            const selected = subZoneId === sz;
            return (
              <button
                key={sz}
                type="button"
                onClick={() => { setSubZoneId(sz); setFieldErrors(fe => ({ ...fe, subZoneId: undefined })); }}
                className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-colors text-center ${
                  selected
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-green-400'
                }`}
                style={{ minHeight: '72px' }}
              >
                <span className="font-bold text-sm font-mono">{sz}</span>
                <span className={`text-xs mt-1 ${selected ? 'text-green-200' : ready > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                  {ready} ready
                </span>
              </button>
            );
          })}
        </div>
        {fieldErrors.subZoneId && <p className="text-red-500 text-xs mt-1">{fieldErrors.subZoneId}</p>}
      </div>

      {/* Plants to place */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Plants to place <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-2">
          How many containers to fill. Defaults to current batch plant count.
        </p>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={plantsToPlace}
          onChange={e => { setPlantsToPlace(e.target.value); setFieldErrors(fe => ({ ...fe, plantsToPlace: undefined })); }}
          placeholder="e.g. 150"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          style={{ minHeight: '56px' }}
        />
        {fieldErrors.plantsToPlace && <p className="text-red-500 text-xs mt-1">{fieldErrors.plantsToPlace}</p>}
      </div>

      {/* Notes */}
      <div className="mb-8">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes about this planting plan…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
          rows={3}
        />
      </div>

      {err && batchId && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{err}</div>
      )}

      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-lg mx-auto">
        <button
          onClick={handleSave}
          disabled={saving || !batchId}
          className="w-full py-4 bg-green-800 text-white font-semibold rounded-2xl hover:bg-green-900 disabled:opacity-50 transition-colors shadow-lg text-base"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Creating plan…' : 'Create Draft Plan'}
        </button>
      </div>
    </div>
  );
}
