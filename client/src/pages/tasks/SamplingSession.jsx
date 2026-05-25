import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFields(recordFieldsJson) {
  if (!recordFieldsJson) return [];
  try { return JSON.parse(recordFieldsJson); } catch { return []; }
}

function computeAggregates(samples, fields) {
  return fields.map(f => {
    const nums = samples
      .map(s => parseFloat(s.values[f.key]))
      .filter(n => !isNaN(n));
    if (nums.length === 0) return { ...f, count: 0, avg: null, min: null, max: null };
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return {
      ...f,
      count: nums.length,
      avg: parseFloat(avg.toFixed(2)),
      min: Math.min(...nums),
      max: Math.max(...nums),
    };
  });
}

function fmt(n, unit) {
  if (n == null) return '—';
  return unit ? `${n} ${unit}` : String(n);
}

// ── sub-components ────────────────────────────────────────────────────────────

function SampleSlot({ index, total, fields, containerLabel, values, suggestions,
                      onLabelChange, onValueChange, onSuggestAnother }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
          Sample {index + 1} of {total}
        </span>
        <div className="flex-1 flex items-center gap-1">
          <input
            className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm text-gray-700 bg-gray-50"
            placeholder="Container (e.g. R3-C12)"
            value={containerLabel}
            onChange={e => onLabelChange(e.target.value)}
          />
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={onSuggestAnother}
              title="Suggest another container"
              className="text-xs text-blue-600 hover:text-blue-800 px-1.5"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {fields.map(f => (
          <div key={f.key} className="flex items-center gap-2">
            <label className="text-sm text-gray-600 w-36 shrink-0">
              {f.label}
              {f.unit && <span className="text-gray-400 ml-1">({f.unit})</span>}
            </label>
            {f.type === 'text' ? (
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={values[f.key] ?? ''}
                onChange={e => onValueChange(f.key, e.target.value)}
                placeholder="—"
              />
            ) : (
              <input
                type="number"
                inputMode="decimal"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={values[f.key] ?? ''}
                onChange={e => onValueChange(f.key, e.target.value)}
                placeholder="—"
                step="any"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AggregateRow({ agg }) {
  if (agg.count === 0) return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 w-36 shrink-0">{agg.label}</span>
      <span className="text-sm text-gray-400 italic">no data</span>
    </div>
  );

  if (agg.type === 'text') return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700 font-medium w-36 shrink-0">{agg.label}</span>
      <span className="text-sm text-gray-500">{agg.count} readings</span>
    </div>
  );

  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-gray-700 font-medium w-36 shrink-0">{agg.label}</span>
        <span className="text-base font-bold text-gray-900">
          {fmt(agg.avg, agg.unit)}
        </span>
        <span className="text-xs text-gray-400">avg</span>
      </div>
      <div className="ml-36 mt-0.5 flex gap-4 text-xs text-gray-500">
        <span>min {fmt(agg.min, agg.unit)}</span>
        <span>max {fmt(agg.max, agg.unit)}</span>
        <span>{agg.count}/{agg.count} recorded</span>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function SamplingSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const protocolId = Number(searchParams.get('protocol_id'));
  const batchId    = Number(searchParams.get('batch_id'));

  const [protocol, setProtocol] = useState(null);
  const [batch, setBatch]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Pool of suggested containers — app picks from here for each slot
  const [containerPool, setContainerPool] = useState([]);
  const [poolUsed, setPoolUsed]           = useState({}); // index → container_id

  // Samples: array of { containerLabel, values: { [key]: string } }
  const [samples, setSamples]   = useState([]);
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedId, setSavedId]   = useState(null);

  const fields = useMemo(
    () => protocol ? parseFields(protocol.record_fields) : [],
    [protocol],
  );

  const aggregates = useMemo(
    () => computeAggregates(samples, fields),
    [samples, fields],
  );

  const hasAnyData = samples.some(s => Object.values(s.values).some(v => v !== ''));

  // ── init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!protocolId || !batchId) { setError('Missing protocol_id or batch_id'); setLoading(false); return; }

    Promise.all([
      api.getProtocol(protocolId),
      api.getBatch(batchId),
    ]).then(([p, b]) => {
      setProtocol(p);
      setBatch(b);
      const count = p.sample_count ?? 3;

      // Build empty samples
      setSamples(Array.from({ length: count }, () => ({ containerLabel: '', values: {} })));

      // Fetch container suggestions
      return api.getSamplingContainerSuggestions(batchId, count * 3); // fetch extra for re-roll
    }).then(suggestions => {
      setContainerPool(suggestions ?? []);
      // Pre-assign first N suggestions to slots
      setSamples(prev => prev.map((s, i) => ({
        ...s,
        containerLabel: suggestions?.[i] ?? '',
      })));
    }).catch(e => {
      setError(e.message);
    }).finally(() => setLoading(false));
  }, [protocolId, batchId]);

  // ── handlers ─────────────────────────────────────────────────────────────

  const updateLabel = useCallback((i, label) => {
    setSamples(prev => prev.map((s, j) => j === i ? { ...s, containerLabel: label } : s));
  }, []);

  const updateValue = useCallback((i, key, val) => {
    setSamples(prev => prev.map((s, j) => j === i ? { ...s, values: { ...s.values, [key]: val } } : s));
  }, []);

  function suggestAnother(slotIndex) {
    // Find an unused suggestion from the pool
    const used = new Set(samples.map(s => s.containerLabel).filter(Boolean));
    const fresh = containerPool.find(c => !used.has(c));
    if (fresh) updateLabel(slotIndex, fresh);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        protocol_id: protocolId,
        batch_id: batchId,
        notes: notes.trim() || null,
        samples: samples.map(s => ({
          container_label: s.containerLabel.trim() || null,
          values: fields.map(f => ({
            field_key:     f.key,
            field_label:   f.label,
            field_unit:    f.unit || null,
            value_numeric: f.type !== 'text' && s.values[f.key] !== ''
              ? parseFloat(s.values[f.key])
              : null,
            value_text:    f.type === 'text' ? (s.values[f.key] ?? null) : null,
          })),
        })),
      };
      const result = await api.createSamplingSession(payload);
      setSavedId(result.session_id);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <p className="text-red-600">{error}</p>
      <button onClick={() => navigate(-1)} className="mt-3 text-sm text-gray-500">← Back</button>
    </div>
  );

  // ── saved confirmation ────────────────────────────────────────────────────
  if (savedId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Session saved</h2>
        <p className="text-sm text-gray-500 mb-1">{protocol?.title}</p>
        <p className="text-sm text-gray-500 mb-8">{batch?.name ?? batch?.strain_name}</p>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 text-left px-4 mb-6">
          {aggregates.map(agg => <AggregateRow key={agg.key} agg={agg} />)}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(`/batches/${batchId}`)}
            className="w-full bg-green-700 text-white rounded-xl py-3 font-medium"
          >
            Back to batch
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full border border-gray-300 rounded-xl py-3 text-sm text-gray-600"
          >
            Today's tasks
          </button>
        </div>
      </div>
    );
  }

  // ── entry form ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 mt-0.5">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900">{protocol?.title}</h1>
          <p className="text-sm text-gray-500">
            {batch?.name ?? batch?.strain_name}
            {batch?.sub_zone_id && <span className="ml-1.5">· {batch.sub_zone_id}</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {samples.length} container{samples.length !== 1 ? 's' : ''} to sample
            {fields.length > 0 && ` · ${fields.map(f => f.label).join(', ')}`}
          </p>
        </div>
      </div>

      {fields.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
          No record fields defined on this protocol. Edit the protocol to add fields.
        </div>
      )}

      {/* Samples */}
      {samples.map((sample, i) => (
        <SampleSlot
          key={i}
          index={i}
          total={samples.length}
          fields={fields}
          containerLabel={sample.containerLabel}
          values={sample.values}
          suggestions={containerPool}
          onLabelChange={label => updateLabel(i, label)}
          onValueChange={(key, val) => updateValue(i, key, val)}
          onSuggestAnother={() => suggestAnother(i)}
        />
      ))}

      {/* Live summary — only shown when there's data */}
      {hasAnyData && aggregates.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 mb-1">Running summary</p>
          {aggregates.map(agg => <AggregateRow key={agg.key} agg={agg} />)}
        </div>
      )}

      {/* Notes */}
      <div className="mb-4">
        <textarea
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
          rows={2}
          placeholder="Notes (optional) — observations, decisions, follow-up actions"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {saveError && (
        <div className="mb-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {saveError}
        </div>
      )}

      {/* Save */}
      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-xl mx-auto">
        <button
          onClick={handleSave}
          disabled={saving || fields.length === 0}
          className="w-full bg-green-700 text-white rounded-xl py-4 text-base font-semibold shadow-lg disabled:opacity-50"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Saving…' : 'Save Session'}
        </button>
      </div>
    </div>
  );
}
