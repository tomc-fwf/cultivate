import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { api } from '../../api';

const POSTPONE_REASONS = [
  { value: 'weather',   label: 'Weather' },
  { value: 'staffing',  label: 'No workers' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'priority',  label: 'Higher priority' },
  { value: 'other',     label: 'Other' },
];

const SNOOZE_OPTIONS = [
  { hours: 4,   label: 'Later today (4h)' },
  { hours: 24,  label: 'Tomorrow' },
  { hours: 48,  label: 'In 2 days' },
  { hours: 0,   label: 'Until I resume it' },
];

const TASK_TYPE_ICONS = {
  fertigation: '💧',
  observation: '🔍',
  foliar:      '🌿',
  amendment:   '🪱',
  record:      '📋',
};

function formatHoursAgo(hours) {
  if (hours == null) return 'Never done in this stage';
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isItemSatisfied(item, prog) {
  if (!prog) return false;
  const fieldType = item.field_type ?? 'boolean';
  if (fieldType === 'number') {
    const v = prog.value_saved;
    if (v == null || isNaN(Number(v))) return false;
    const n = Number(v);
    if (item.min_value != null && n < item.min_value) return false;
    if (item.max_value != null && n > item.max_value) return false;
    return true;
  }
  return !!prog.checked;
}

function rangeLabel(item) {
  if (item.min_value != null && item.max_value != null)
    return `${item.min_value}–${item.max_value}`;
  if (item.min_value != null) return `≥ ${item.min_value}`;
  if (item.max_value != null) return `≤ ${item.max_value}`;
  return null;
}

function ChecklistItem({ item, prog, onToggle, onValueChange, onValueBlur }) {
  const fieldType = item.field_type ?? 'boolean';
  const checked   = prog?.checked ?? false;

  if (fieldType === 'number') {
    const displayVal = prog?.value_display ?? '';
    const numVal  = displayVal !== '' ? parseFloat(displayVal) : null;
    const hasVal  = numVal != null && !isNaN(numVal);
    const inRange = hasVal &&
      (item.min_value == null || numVal >= item.min_value) &&
      (item.max_value == null || numVal <= item.max_value);
    const outOfRange = hasVal && !inRange;
    const range = rangeLabel(item);

    return (
      <div className="flex items-center gap-3 py-3 px-1 border-b border-gray-100 last:border-0" style={{ minHeight: '56px' }}>
        <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
          inRange ? 'bg-green-600 border-green-600' : 'border-gray-300'
        }`}>
          {inRange && <span className="text-white text-xs font-bold">✓</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm flex-1 min-w-0 leading-snug ${inRange ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {item.label}
              {item.required === 1 && !inRange && <span className="ml-1 text-red-400 text-xs">*</span>}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input
                type="number"
                inputMode="decimal"
                className={`w-20 text-right border rounded-lg px-2 py-1.5 text-sm font-mono ${
                  outOfRange ? 'border-red-400 bg-red-50 text-red-700' :
                  inRange    ? 'border-green-400 bg-green-50 text-green-800' :
                               'border-gray-300 bg-white'
                }`}
                value={displayVal}
                onChange={e => onValueChange(item.item_id, e.target.value)}
                onBlur={() => onValueBlur(item.item_id)}
                placeholder="—"
                style={{ minHeight: '40px' }}
              />
              {item.field_unit && (
                <span className="text-xs text-gray-500 w-10">{item.field_unit}</span>
              )}
            </div>
          </div>
          {outOfRange && range && (
            <p className="text-xs text-red-500 mt-0.5">
              Target: {range}{item.field_unit ? ` ${item.field_unit}` : ''}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Boolean (default)
  return (
    <button
      onClick={() => onToggle(item.item_id)}
      className={`w-full flex items-start gap-3 py-3 px-1 text-left border-b border-gray-100 last:border-0 transition-colors ${checked ? 'opacity-60' : ''}`}
      style={{ minHeight: '52px' }}
    >
      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        checked ? 'bg-green-600 border-green-600' : 'border-gray-400'
      }`}>
        {checked && <span className="text-white text-xs font-bold">✓</span>}
      </div>
      <span className={`text-sm flex-1 ${checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {item.label}
        {item.required === 1 && !checked && <span className="ml-1 text-red-400 text-xs">*</span>}
      </span>
    </button>
  );
}

function PostponeSheet({ task, onClose, onPostponed }) {
  const [reason, setReason] = useState('');
  const [notes,  setNotes]  = useState('');
  const [snooze, setSnooze] = useState(24);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  async function handlePostpone() {
    if (!reason) return;
    setSaving(true);
    setError(null);
    try {
      await api.postponeTask({
        protocol_id:  task.protocol_id,
        batch_id:     task.batch_id,
        reason,
        reason_notes: notes.trim() || null,
        snooze_hours: snooze,
      });
      onPostponed();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl px-4 pt-4 pb-24 max-h-[80vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <h3 className="text-base font-semibold text-gray-900 mb-1">Postpone task</h3>
        <p className="text-sm text-gray-500 mb-4">{task.title} · {task.batch_name ?? task.strain_name}</p>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reason</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {POSTPONE_REASONS.map(r => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${
                reason === r.value
                  ? 'bg-amber-600 border-amber-600 text-white'
                  : 'border-gray-300 text-gray-700 hover:border-amber-400'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-4"
          rows={2}
          placeholder="Additional notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resume after</p>
        <div className="flex flex-col gap-2 mb-5">
          {SNOOZE_OPTIONS.map(opt => (
            <button
              key={opt.hours}
              onClick={() => setSnooze(opt.hours)}
              className={`py-2.5 px-3 rounded-xl border text-sm text-left transition-colors ${
                snooze === opt.hours
                  ? 'bg-gray-800 border-gray-800 text-white'
                  : 'border-gray-300 text-gray-700 hover:border-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={handlePostpone}
          disabled={!reason || saving}
          className="w-full bg-amber-600 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-40"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Postponing…' : 'Confirm postpone'}
        </button>
      </div>
    </div>
  );
}

export default function TaskDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const protocolId = Number(searchParams.get('protocol_id'));
  const batchId    = Number(searchParams.get('batch_id'));

  const task = location.state?.task ?? null;

  const [protocol, setProtocol]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [sopExpanded, setSopExpanded]   = useState(false);
  const [showPostpone, setShowPostpone] = useState(false);

  // progress: { [item_id]: { checked, value_display, value_saved, checked_at } }
  const [progress, setProgress]   = useState({});
  const [resumedAt, setResumedAt] = useState(null); // most recent checked_at from saved progress
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current);
  }, []);

  useEffect(() => {
    if (!protocolId) { setError('Missing protocol_id'); setLoading(false); return; }

    Promise.all([
      api.getProtocol(protocolId),
      batchId ? api.getChecklistProgress(protocolId, batchId) : Promise.resolve([]),
    ])
      .then(([p, progressRows]) => {
        setProtocol(p);

        if (progressRows.length > 0) {
          const map = {};
          let latestAt = null;
          for (const row of progressRows) {
            map[row.item_id] = {
              checked:       !!row.checked,
              value_display: row.value_numeric != null ? String(row.value_numeric) : '',
              value_saved:   row.value_numeric ?? null,
              checked_at:    row.checked_at,
            };
            if (!latestAt || row.checked_at > latestAt) latestAt = row.checked_at;
          }
          setProgress(map);
          setResumedAt(latestAt);
        }

        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [protocolId, batchId]);

  // Save a single item's progress and flash the "Saved" indicator
  const saveProgress = useCallback((itemId, checked, valueNumeric) => {
    if (!batchId) return;
    api.saveChecklistProgress({
      protocol_id:   protocolId,
      batch_id:      batchId,
      item_id:       itemId,
      checked:       checked ? 1 : 0,
      value_numeric: valueNumeric ?? null,
    }).then(() => {
      setSavedFlash(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 1500);
    }).catch(console.error);
  }, [protocolId, batchId]);

  function toggleItem(itemId) {
    setProgress(prev => {
      const newChecked = !(prev[itemId]?.checked ?? false);
      saveProgress(itemId, newChecked, prev[itemId]?.value_saved ?? null);
      return { ...prev, [itemId]: { ...prev[itemId], checked: newChecked } };
    });
  }

  function handleValueChange(itemId, strVal) {
    setProgress(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], value_display: strVal },
    }));
  }

  function handleValueBlur(itemId) {
    const item = (protocol?.checklist_items ?? []).find(i => i.item_id === itemId);
    if (!item) return;
    const strVal  = progress[itemId]?.value_display ?? '';
    const numVal  = strVal !== '' ? parseFloat(strVal) : null;
    const hasVal  = numVal != null && !isNaN(numVal);
    const inRange = hasVal &&
      (item.min_value == null || numVal >= item.min_value) &&
      (item.max_value == null || numVal <= item.max_value);

    setProgress(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], value_saved: hasVal ? numVal : null, checked: inRange },
    }));
    saveProgress(itemId, inRange, hasVal ? numVal : null);
  }

  async function clearProgress() {
    if (!batchId) return;
    setProgress({});
    setResumedAt(null);
    api.clearChecklistProgress(protocolId, batchId).catch(console.error);
  }

  const checklistItems = protocol?.checklist_items ?? [];
  const requiredUnsatisfied = checklistItems.filter(
    item => item.required === 1 && !isItemSatisfied(item, progress[item.item_id])
  );
  const canStart    = requiredUnsatisfied.length === 0;
  const allDone     = checklistItems.length > 0 &&
    checklistItems.every(item => isItemSatisfied(item, progress[item.item_id]));

  const actionPath = task?.action_path ?? (protocol
    ? (() => {
        switch (protocol.task_type) {
          case 'fertigation': return `/applications/fertigation/new?batch_id=${batchId}`;
          case 'observation': return `/observations/new?batch_id=${batchId}`;
          case 'foliar':      return `/applications/foliar/new?batch_id=${batchId}`;
          case 'amendment':   return `/applications/amendments/new?batch_id=${batchId}`;
          case 'record':      return `/tasks/sampling/new?protocol_id=${protocolId}&batch_id=${batchId}`;
          default:            return `/batches/${batchId}`;
        }
      })()
    : null);

  if (loading) return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <p className="text-red-600">{error}</p>
      <button onClick={() => navigate(-1)} className="mt-3 text-sm text-gray-500">← Back</button>
    </div>
  );

  const icon       = TASK_TYPE_ICONS[protocol?.task_type] ?? '📋';
  const urgency    = task?.urgency;
  const batchLabel = task?.batch_name ?? task?.strain_name ?? `Batch ${batchId}`;
  const subZone    = task?.sub_zone_id;
  const resumeAgo  = formatTimeAgo(resumedAt);
  const hasResume  = resumedAt && Object.keys(progress).length > 0;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-32">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 mt-1">←</button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{icon}</span>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">{protocol?.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500">
            <span>{batchLabel}</span>
            {subZone && <><span>·</span><span>{subZone}</span></>}
            {task?.stage && <><span>·</span><span>{task.stage}</span></>}
            {task?.days_in_stage != null && <><span>·</span><span>Day {task.days_in_stage}</span></>}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            {urgency === 'overdue' && (
              <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">Overdue</span>
            )}
            {urgency === 'due' && (
              <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Due</span>
            )}
            {task?.hours_since != null && (
              <span className="text-xs text-gray-400">Last done {formatHoursAgo(task.hours_since)}</span>
            )}
            {task?.last_performed_at == null && (
              <span className="text-xs text-gray-400">Not yet done this stage</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowPostpone(true)}
          className="text-xs text-amber-600 border border-amber-300 rounded-lg px-2.5 py-1.5 hover:bg-amber-50 shrink-0 mt-0.5"
        >
          Postpone
        </button>
      </div>

      {/* Resume banner */}
      {hasResume && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <span>↩</span>
            <span>Resuming from {resumeAgo}</span>
          </div>
          <button
            onClick={clearProgress}
            className="text-xs text-blue-500 font-medium hover:text-blue-700 flex-shrink-0"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Description */}
      {protocol?.description && (
        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
          <p className="text-sm text-gray-700">{protocol.description}</p>
        </div>
      )}

      {/* SOP */}
      {protocol?.sop_text && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
          <button
            onClick={() => setSopExpanded(v => !v)}
            className="w-full flex items-center justify-between"
          >
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Standard Operating Procedure</p>
            <span className="text-blue-400 text-sm">{sopExpanded ? '▲' : '▼'}</span>
          </button>
          {sopExpanded && (
            <div className="mt-3 text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">
              {protocol.sop_text}
            </div>
          )}
          {!sopExpanded && (
            <p className="mt-1 text-xs text-blue-400">Tap to read</p>
          )}
        </div>
      )}

      {/* Checklist */}
      {checklistItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 mb-4">
          <div className="flex items-center justify-between pt-3 pb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
            <div className="flex items-center gap-2">
              <span
                className="text-xs text-green-600 font-medium transition-opacity duration-300"
                style={{ opacity: savedFlash ? 1 : 0 }}
              >
                ✓ Saved
              </span>
              {checklistItems.some(i => i.required === 1) && (
                <p className="text-xs text-gray-400"><span className="text-red-400">*</span> required to start</p>
              )}
            </div>
          </div>
          {checklistItems.map(item => (
            <ChecklistItem
              key={item.item_id}
              item={item}
              prog={progress[item.item_id]}
              onToggle={toggleItem}
              onValueChange={handleValueChange}
              onValueBlur={handleValueBlur}
            />
          ))}
          {allDone && (
            <p className="text-xs text-green-600 text-center py-2 font-medium">All items complete ✓</p>
          )}
        </div>
      )}

      {/* Required items warning */}
      {requiredUnsatisfied.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mb-4">
          <p className="text-xs text-red-600">
            Complete {requiredUnsatisfied.length} required item{requiredUnsatisfied.length > 1 ? 's' : ''} before starting
          </p>
        </div>
      )}

      {/* Actions — fixed at bottom */}
      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-xl mx-auto flex flex-col gap-2">
        <button
          onClick={() => navigate(actionPath)}
          disabled={!canStart || !actionPath}
          className="w-full bg-green-700 text-white rounded-xl py-4 text-base font-semibold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ minHeight: '56px' }}
        >
          {checklistItems.length > 0 && !allDone
            ? `Start task (${checklistItems.filter(i => isItemSatisfied(i, progress[i.item_id])).length}/${checklistItems.length} done)`
            : 'Start task →'
          }
        </button>
        {checklistItems.length > 0 && (
          <button
            onClick={() => navigate(-1)}
            className="w-full bg-white border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-medium shadow-sm"
            style={{ minHeight: '48px' }}
          >
            Save &amp; Exit — resume later
          </button>
        )}
      </div>

      {/* Postpone sheet */}
      {showPostpone && (
        <PostponeSheet
          task={{ ...task, protocol_id: protocolId, batch_id: batchId, title: protocol?.title }}
          onClose={() => setShowPostpone(false)}
          onPostponed={() => navigate('/', { replace: true })}
        />
      )}
    </div>
  );
}
