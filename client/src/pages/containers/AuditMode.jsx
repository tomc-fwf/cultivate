import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const ACTIVE_STATUSES = ['germ', 'seedling', 'cult-hoop', 'field-veg', 'field-flower', 'flush', 'harvest_window', 'harvesting'];
const SUB_ZONES = ['Z1A', 'Z1B', 'Z2A', 'Z2B', 'Z3A', 'Z3B', 'Z4A', 'Z4B'];

const OUTCOMES = {
  verified: { label: 'Verified ✓',    bgBtn: 'bg-green-600 border-green-700', bgBadge: 'bg-green-50 text-green-700' },
  missing:  { label: 'Tag Missing ✗', bgBtn: 'bg-red-600 border-red-700',     bgBadge: 'bg-red-50 text-red-700' },
  mismatch: { label: 'Mismatch ⚠',   bgBtn: 'bg-amber-500 border-amber-600', bgBadge: 'bg-amber-50 text-amber-700' },
};

// ── Step 1: Setup ────────────────────────────────────────────────────────────

function SetupStep({ onStart }) {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [subZone, setSubZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getBatches()
      .then(data => {
        const list = Array.isArray(data) ? data : (data.batches ?? []);
        setBatches(list.filter(b => ACTIVE_STATUSES.includes(b.status)));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const selectedBatch = batches.find(b => String(b.batch_id) === batchId);

  function handleStart() {
    if (!batchId) return;
    onStart({
      batchId: Number(batchId),
      subZoneId: subZone || null,
      batchName: selectedBatch?.metrc_batch_name ?? selectedBatch?.name ?? `Batch ${batchId}`,
    });
  }

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading batches…</div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Batch *</label>
            <select
              value={batchId}
              onChange={e => { setBatchId(e.target.value); setSubZone(''); }}
              className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
              style={{ minHeight: '56px' }}
            >
              <option value="">Select a batch…</option>
              {batches.map(b => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.strain_name ?? '—'} · {b.sub_zone_id ?? 'no zone'} · {b.status}
                </option>
              ))}
            </select>
            {batches.length === 0 && !loading && (
              <p className="text-xs text-amber-600 mt-1">No active batches found.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sub-zone (optional — filters to batch zone when selected)</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSubZone('')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${subZone === '' ? 'bg-green-800 text-white border-green-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                style={{ minHeight: '44px' }}
              >
                All zones
              </button>
              {(selectedBatch?.sub_zone_id ? [selectedBatch.sub_zone_id] : SUB_ZONES).map(sz => (
                <button
                  key={sz}
                  onClick={() => setSubZone(sz)}
                  className={`px-3 py-2 rounded-lg text-sm font-mono font-semibold border transition-colors ${subZone === sz ? 'bg-green-800 text-white border-green-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  style={{ minHeight: '44px' }}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={!batchId}
            className="w-full bg-green-800 text-white font-bold rounded-2xl py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed active:brightness-90 transition-all"
            style={{ minHeight: '64px' }}
          >
            Start Audit →
          </button>
        </>
      )}
    </div>
  );
}

// ── Step 2: Walk ─────────────────────────────────────────────────────────────

function WalkStep({ setup, onContainersLoaded, onFinish }) {
  const [containers, setContainers] = useState([]);
  const [results, setResults] = useState({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = { batch_id: setup.batchId };
    if (setup.subZoneId) params.sub_zone_id = setup.subZoneId;
    api.getTagAssignments(params)
      .then(data => {
        const tagged = (data.assignments ?? []).filter(a => a.metrc_plant_tag);
        setContainers(tagged);
        onContainersLoaded(tagged);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [setup]);

  const handleOutcome = useCallback((outcome) => {
    const c = containers[current];
    if (!c) return;
    const newResults = { ...results, [c.assignment_id]: outcome };
    setResults(newResults);
    // Auto-advance to next unreviewed
    for (let i = current + 1; i < containers.length; i++) {
      if (!newResults[containers[i].assignment_id]) { setCurrent(i); return; }
    }
    for (let i = 0; i < current; i++) {
      if (!newResults[containers[i].assignment_id]) { setCurrent(i); return; }
    }
  }, [containers, current, results]);

  if (loading) return <div className="text-center text-gray-400 py-20 text-sm">Loading assignments…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>;

  if (containers.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500 mb-4">No tagged plants found{setup.subZoneId ? ` in ${setup.subZoneId}` : ''} for this batch.</p>
        <button onClick={() => onFinish({})} className="px-5 py-3 bg-green-800 text-white rounded-2xl font-semibold text-sm" style={{ minHeight: '56px' }}>
          Finish
        </button>
      </div>
    );
  }

  const c = containers[current];
  const last4 = c.metrc_plant_tag ? String(c.metrc_plant_tag).slice(-4) : '—';
  const reviewed = Object.keys(results).length;
  const total = containers.length;

  return (
    <>
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>{reviewed} of {total} reviewed</span>
        <span className="font-mono">{c.sub_zone_id} · {c.row_id}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
        <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${(reviewed / total) * 100}%` }} />
      </div>

      {/* Container card */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 mb-5 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Container</span>
            <div className="text-2xl font-bold text-gray-900 font-mono mt-0.5">{c.container_id}</div>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Strain</span>
            <div className="text-sm font-semibold text-gray-700 mt-0.5">{c.strain_name ?? '—'}</div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-center mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">METRC Tag Last 4</span>
          <span className="text-5xl font-bold text-gray-900 font-mono tracking-widest">{last4}</span>
        </div>
        <p className="text-xs text-gray-400 text-center">Verify the physical tag matches these digits</p>

        {results[c.assignment_id] && (
          <div className={`mt-3 rounded-xl px-4 py-2 text-center text-sm font-semibold ${OUTCOMES[results[c.assignment_id]].bgBadge}`}>
            Marked: {OUTCOMES[results[c.assignment_id]].label}
          </div>
        )}
      </div>

      {/* Outcome buttons */}
      <div className="grid grid-cols-1 gap-3 mb-5">
        {Object.entries(OUTCOMES).map(([key, o]) => (
          <button
            key={key}
            onClick={() => handleOutcome(key)}
            className={`w-full ${o.bgBtn} text-white font-bold rounded-2xl py-4 text-base border-2 active:brightness-90 transition-all ${results[c.assignment_id] === key ? 'ring-4 ring-offset-1 ring-gray-400' : ''}`}
            style={{ minHeight: '64px' }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setCurrent(i => Math.max(0, i - 1))}
          disabled={current === 0}
          className="flex-1 border border-gray-300 text-gray-600 font-semibold rounded-2xl py-3 text-sm disabled:opacity-30"
          style={{ minHeight: '56px' }}
        >
          ← Previous
        </button>
        <button
          onClick={() => setCurrent(i => Math.min(containers.length - 1, i + 1))}
          disabled={current === containers.length - 1}
          className="flex-1 border border-gray-300 text-gray-600 font-semibold rounded-2xl py-3 text-sm disabled:opacity-30"
          style={{ minHeight: '56px' }}
        >
          Next →
        </button>
      </div>

      <button
        onClick={() => onFinish(results)}
        className="w-full border-2 border-green-800 text-green-800 font-bold rounded-2xl py-4 text-base active:bg-green-50 transition-colors"
        style={{ minHeight: '64px' }}
      >
        Finish Audit ({reviewed}/{total} reviewed)
      </button>
    </>
  );
}

// ── Step 3: Report ───────────────────────────────────────────────────────────

function ReportStep({ setup, containers, results, onReset, onDone }) {
  const verified   = containers.filter(c => results[c.assignment_id] === 'verified');
  const missing    = containers.filter(c => results[c.assignment_id] === 'missing');
  const mismatch   = containers.filter(c => results[c.assignment_id] === 'mismatch');
  const unreviewed = containers.filter(c => !results[c.assignment_id]);
  const discrepancies = [...missing, ...mismatch];

  function downloadCsv() {
    const rows = [
      ['Container', 'METRC Tag', 'Last 4', 'Strain', 'Row', 'Sub-zone', 'Issue', 'Audit Date'],
      ...discrepancies.map(c => [
        c.container_id,
        c.metrc_plant_tag ?? '',
        c.metrc_plant_tag ? String(c.metrc_plant_tag).slice(-4) : '',
        c.strain_name ?? '',
        c.row_id ?? '',
        c.sub_zone_id ?? '',
        results[c.assignment_id] === 'missing' ? 'Tag Missing' : 'Mismatch',
        new Date().toISOString().slice(0, 10),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-discrepancies-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <p className="text-sm text-gray-500 mb-5">
        {setup.batchName}{setup.subZoneId ? ` · ${setup.subZoneId}` : ''} ·{' '}
        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: 'Verified',      count: verified.length,   cls: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Tag Missing',   count: missing.length,    cls: missing.length > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500' },
          { label: 'Mismatch',      count: mismatch.length,   cls: mismatch.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-500' },
          { label: 'Not Reviewed',  count: unreviewed.length, cls: unreviewed.length > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-500' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border-2 px-4 py-3 text-center ${s.cls}`}>
            <div className="text-3xl font-bold">{s.count}</div>
            <div className="text-xs font-semibold mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Discrepancy list */}
      {discrepancies.length > 0 ? (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700">Discrepancies ({discrepancies.length})</h2>
            <button
              onClick={downloadCsv}
              className="text-xs font-semibold text-green-800 border border-green-800 rounded-lg px-3 py-1.5 hover:bg-green-50 transition-colors"
              style={{ minHeight: '36px' }}
            >
              ↓ Export CSV
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {discrepancies.map((c, i) => (
              <div key={c.assignment_id} className={`px-4 py-3 flex items-center gap-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 font-mono">{c.container_id}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.strain_name ?? '—'} · Tag …{c.metrc_plant_tag ? String(c.metrc_plant_tag).slice(-4) : '—'}
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${results[c.assignment_id] === 'missing' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {results[c.assignment_id] === 'missing' ? 'MISSING' : 'MISMATCH'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : unreviewed.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-center mb-5">
          <div className="text-2xl mb-1">✓</div>
          <div className="text-sm font-semibold text-green-800">All tags verified — no discrepancies</div>
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex-1 border-2 border-gray-300 text-gray-700 font-bold rounded-2xl py-4 text-sm active:bg-gray-50"
          style={{ minHeight: '64px' }}
        >
          New Audit
        </button>
        <button
          onClick={onDone}
          className="flex-1 bg-green-800 text-white font-bold rounded-2xl py-4 text-sm active:brightness-90"
          style={{ minHeight: '64px' }}
        >
          Done
        </button>
      </div>
    </>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function AuditMode() {
  const navigate = useNavigate();
  const [step, setStep] = useState('setup');
  const [setup, setSetup] = useState(null);
  const [containers, setContainers] = useState([]);
  const [results, setResults] = useState({});

  const title = step === 'report' ? 'Audit Report' : 'METRC Tag Audit';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28">
      {/* Back / breadcrumb */}
      <button
        onClick={() => step === 'report' ? setStep('setup') : navigate('/applications')}
        className="text-sm text-gray-500 flex items-center gap-1 mb-4"
        style={{ minHeight: '44px' }}
      >
        ← {step === 'report' ? 'New Audit' : 'Applications'}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        {title}
      </h1>
      {step === 'setup' && (
        <p className="text-sm text-gray-500 mb-6">Walk the rows and visually verify each METRC tag.</p>
      )}

      {step === 'setup' && (
        <SetupStep
          onStart={s => { setSetup(s); setResults({}); setContainers([]); setStep('walk'); }}
        />
      )}
      {step === 'walk' && setup && (
        <WalkStep
          setup={setup}
          onContainersLoaded={setContainers}
          onFinish={r => { setResults(r); setStep('report'); }}
        />
      )}
      {step === 'report' && setup && (
        <ReportStep
          setup={setup}
          containers={containers}
          results={results}
          onReset={() => { setSetup(null); setStep('setup'); }}
          onDone={() => navigate('/')}
        />
      )}
    </div>
  );
}
