import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';

const STAGES = [
  { value: 'germ',           label: 'Germination' },
  { value: 'seedling',       label: 'Seedlings' },
  { value: 'cult-hoop',      label: 'Cult-Hoop' },
  { value: 'field-veg',      label: 'Field — Veg' },
  { value: 'field-flower',   label: 'Field — Flower' },
  { value: 'flush',          label: 'Flush' },
  { value: 'harvest_window', label: 'Harvest Window' },
  { value: 'harvesting',     label: 'Harvesting' },
];

const TASK_TYPES = [
  { value: 'fertigation', label: 'Fertigation', icon: '💧' },
  { value: 'observation', label: 'Observation',  icon: '🔍' },
  { value: 'foliar',      label: 'Foliar',       icon: '🌿' },
  { value: 'amendment',   label: 'Amendment',    icon: '🪱' },
];

const TASK_TYPE_COLORS = {
  fertigation: 'bg-blue-100 text-blue-800',
  observation: 'bg-yellow-100 text-yellow-800',
  foliar:      'bg-green-100 text-green-800',
  amendment:   'bg-orange-100 text-orange-800',
};

const BLANK_FORM = {
  stage: 'germ',
  task_type: 'fertigation',
  title: '',
  frequency_days: 1,
  day_min: '',
  day_max: '',
  description: '',
  order_index: 0,
  active: 1,
};

function parseIntOrNull(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function ProtocolForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      frequency_days: parseInt(form.frequency_days, 10) || 1,
      day_min: form.day_min === '' ? null : parseIntOrNull(form.day_min),
      day_max: form.day_max === '' ? null : parseIntOrNull(form.day_max),
      order_index: parseInt(form.order_index, 10) || 0,
      active: form.active ? 1 : 0,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
          <select
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.stage}
            onChange={e => set('stage', e.target.value)}
          >
            {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Task Type</label>
          <select
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.task_type}
            onChange={e => set('task_type', e.target.value)}
          >
            {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          required
          maxLength={100}
          placeholder="e.g. Daily fertigation"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Frequency (days)</label>
          <input
            type="number"
            inputMode="numeric"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.frequency_days}
            onChange={e => set('frequency_days', e.target.value)}
            min={1} max={30} required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Day min</label>
          <input
            type="number"
            inputMode="numeric"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.day_min}
            onChange={e => set('day_min', e.target.value)}
            min={0}
            placeholder="any"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Day max</label>
          <input
            type="number"
            inputMode="numeric"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.day_max}
            onChange={e => set('day_max', e.target.value)}
            min={0}
            placeholder="any"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          rows={2}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          maxLength={300}
          placeholder="Brief note on what to check or why"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 items-center">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Display order</label>
          <input
            type="number"
            inputMode="numeric"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.order_index}
            onChange={e => set('order_index', e.target.value)}
            min={0}
          />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id="form-active"
            checked={!!form.active}
            onChange={e => set('active', e.target.checked ? 1 : 0)}
            className="w-4 h-4"
          />
          <label htmlFor="form-active" className="text-sm text-gray-700">Active</label>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-green-700 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Protocol'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ProtocolRow({ protocol, canEdit, onEdit, onToggleActive, onDelete }) {
  const typeColor = TASK_TYPE_COLORS[protocol.task_type] ?? 'bg-gray-100 text-gray-700';
  const typeInfo = TASK_TYPES.find(t => t.value === protocol.task_type);

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 ${!protocol.active ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeColor}`}>
            {typeInfo?.icon} {typeInfo?.label ?? protocol.task_type}
          </span>
          <span className="text-sm font-medium text-gray-900 truncate">{protocol.title}</span>
          {!protocol.active && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">inactive</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span>Every {protocol.frequency_days}d</span>
          {(protocol.day_min != null || protocol.day_max != null) && (
            <span>Days {protocol.day_min ?? '0'}–{protocol.day_max ?? '∞'}</span>
          )}
          {protocol.description && <span className="truncate max-w-xs">{protocol.description}</span>}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleActive(protocol)}
            title={protocol.active ? 'Deactivate' : 'Activate'}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >
            {protocol.active ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => onEdit(protocol)}
            title="Edit"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(protocol)}
            title="Delete"
            className="p-1.5 rounded hover:bg-red-50 text-red-400"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProtocolsAdmin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'supervisor' || user?.role === 'admin';
  const canDelete = user?.role === 'admin';

  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null); // protocol_id or 'new'
  const [addingStage, setAddingStage] = useState(null); // stage value for inline add
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getProtocols();
      setProtocols(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStage = STAGES.map(s => ({
    ...s,
    protocols: protocols.filter(p => p.stage === s.value),
  }));

  async function handleSave(data) {
    setSaving(true);
    setFormError(null);
    try {
      if (editingId && editingId !== 'new') {
        await api.updateProtocol(editingId, data);
      } else {
        await api.createProtocol(data);
      }
      setEditingId(null);
      setAddingStage(null);
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(protocol) {
    try {
      await api.updateProtocol(protocol.protocol_id, { active: protocol.active ? 0 : 1 });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteProtocol(confirmDelete.protocol_id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  function startEdit(protocol) {
    setAddingStage(null);
    setEditingId(protocol.protocol_id);
    setFormError(null);
  }

  function startAdd(stageValue) {
    setEditingId('new');
    setAddingStage(stageValue);
    setFormError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setAddingStage(null);
    setFormError(null);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Stage Protocols</h1>
          <p className="text-sm text-gray-500">Define recurring tasks per batch stage</p>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          Show inactive
        </label>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Stages */}
      {!loading && byStage.map(stage => {
        const visible = showInactive
          ? stage.protocols
          : stage.protocols.filter(p => p.active);
        const isAdding = addingStage === stage.value;
        const editingProtocol = editingId && editingId !== 'new'
          ? stage.protocols.find(p => p.protocol_id === editingId)
          : null;

        return (
          <div key={stage.value} className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {stage.label}
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                  {stage.protocols.filter(p => p.active).length} active
                </span>
              </h2>
              {canEdit && !isAdding && (
                <button
                  onClick={() => startAdd(stage.value)}
                  className="text-xs text-green-700 hover:text-green-900 font-medium"
                >
                  + Add task
                </button>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 px-4">
              {visible.length === 0 && !isAdding && (
                <p className="text-xs text-gray-400 py-3 text-center">No active protocols</p>
              )}

              {visible.map(p => {
                if (editingId === p.protocol_id) {
                  return (
                    <div key={p.protocol_id} className="py-3 border-b border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-2">Editing: {p.title}</p>
                      <ProtocolForm
                        initial={{
                          stage: p.stage,
                          task_type: p.task_type,
                          title: p.title,
                          frequency_days: p.frequency_days,
                          day_min: p.day_min ?? '',
                          day_max: p.day_max ?? '',
                          description: p.description ?? '',
                          order_index: p.order_index ?? 0,
                          active: p.active,
                        }}
                        onSave={handleSave}
                        onCancel={cancelForm}
                        saving={saving}
                        error={formError}
                      />
                    </div>
                  );
                }
                return (
                  <ProtocolRow
                    key={p.protocol_id}
                    protocol={p}
                    canEdit={canEdit}
                    onEdit={startEdit}
                    onToggleActive={handleToggleActive}
                    onDelete={setConfirmDelete}
                  />
                );
              })}

              {isAdding && (
                <div className="py-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">New protocol for {stage.label}</p>
                  <ProtocolForm
                    initial={{ ...BLANK_FORM, stage: stage.value }}
                    onSave={handleSave}
                    onCancel={cancelForm}
                    saving={saving}
                    error={formError}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Protocol?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>{confirmDelete.title}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
