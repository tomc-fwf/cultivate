import { useEffect, useState } from 'react';
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

function ChecklistItem({ label, required, checked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-start gap-3 py-3 px-1 text-left border-b border-gray-100 last:border-0 transition-colors ${checked ? 'opacity-60' : ''}`}
      style={{ minHeight: '52px' }}
    >
      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        checked ? 'bg-green-600 border-green-600' : 'border-gray-400'
      }`}>
        {checked && <span className="text-white text-xs font-bold">✓</span>}
      </div>
      <span className={`text-sm flex-1 ${checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {label}
        {required === 1 && !checked && <span className="ml-1 text-red-400 text-xs">*</span>}
      </span>
    </button>
  );
}

function PostponeSheet({ task, onClose, onPostponed }) {
  const [reason, setReason]     = useState('');
  const [notes, setNotes]       = useState('');
  const [snooze, setSnooze]     = useState(24);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

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
      <div className="relative bg-white rounded-t-2xl px-4 pt-4 pb-10 max-h-[80vh] overflow-y-auto">
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

  // Task data passed via router state from Today screen
  const task = location.state?.task ?? null;

  const [protocol, setProtocol]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [sopExpanded, setSopExpanded] = useState(false);
  const [checked, setChecked]       = useState({});
  const [showPostpone, setShowPostpone] = useState(false);

  useEffect(() => {
    if (!protocolId) { setError('Missing protocol_id'); setLoading(false); return; }
    api.getProtocol(protocolId)
      .then(p => { setProtocol(p); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [protocolId]);

  function toggleItem(itemId) {
    setChecked(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  const checklistItems = protocol?.checklist_items ?? [];
  const requiredUnchecked = checklistItems.filter(
    item => item.required === 1 && !checked[item.item_id]
  );
  const canStart = requiredUnchecked.length === 0;
  const allChecked = checklistItems.length > 0 &&
    checklistItems.every(item => checked[item.item_id]);

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

  const icon = TASK_TYPE_ICONS[protocol?.task_type] ?? '📋';
  const urgency = task?.urgency;
  const batchLabel = task?.batch_name ?? task?.strain_name ?? `Batch ${batchId}`;
  const subZone = task?.sub_zone_id;

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
            {checklistItems.some(i => i.required === 1) && (
              <p className="text-xs text-gray-400"><span className="text-red-400">*</span> required to start</p>
            )}
          </div>
          {checklistItems.map(item => (
            <ChecklistItem
              key={item.item_id}
              label={item.label}
              required={item.required}
              checked={!!checked[item.item_id]}
              onToggle={() => toggleItem(item.item_id)}
            />
          ))}
          {allChecked && (
            <p className="text-xs text-green-600 text-center py-2 font-medium">All items checked ✓</p>
          )}
        </div>
      )}

      {/* Required items warning */}
      {requiredUnchecked.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mb-4">
          <p className="text-xs text-red-600">
            Complete {requiredUnchecked.length} required item{requiredUnchecked.length > 1 ? 's' : ''} before starting
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
          {checklistItems.length > 0 && !allChecked
            ? `Start task (${Object.values(checked).filter(Boolean).length}/${checklistItems.length} checked)`
            : 'Start task →'
          }
        </button>
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
