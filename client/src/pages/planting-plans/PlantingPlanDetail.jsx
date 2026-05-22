import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const STATUS_CHIP = {
  draft:      'bg-amber-100 text-amber-700',
  active:     'bg-green-100 text-green-800',
  superseded: 'bg-gray-100 text-gray-500',
  cancelled:  'bg-red-100 text-red-600',
};

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-green-700' : type === 'error' ? 'bg-red-600' : 'bg-amber-600';
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className={`${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl`}>
        {message}
      </div>
    </div>
  );
}

function ContainerCell({ container, item, canEdit, selected, onAdd, onRemove, onSelect }) {
  const isReady = container.current_state === 'ready';
  const isDraft = item?.status === 'draft';
  const isCommitted = item?.status === 'committed';

  let cellClass;
  let clickable = false;

  if (isDraft) {
    cellClass = selected
      ? 'bg-blue-700 text-white ring-2 ring-offset-1 ring-blue-400'
      : 'bg-blue-500 text-white hover:bg-blue-600';
    clickable = canEdit;
  } else if (isCommitted) {
    cellClass = 'bg-amber-400 text-amber-900 cursor-default';
  } else if (isReady) {
    cellClass = canEdit
      ? 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200 cursor-pointer'
      : 'bg-green-100 text-green-700 border border-green-200 cursor-default';
    clickable = canEdit;
  } else {
    cellClass = 'bg-gray-100 text-gray-300 cursor-default';
  }

  function handleClick() {
    if (!clickable) return;
    if (isDraft) onSelect?.();
    else if (isReady) onAdd?.();
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        disabled={!clickable && !isDraft}
        onClick={handleClick}
        title={`${container.container_id} — ${container.current_state}${item ? ` (${item.status})` : ''}`}
        className={`w-11 h-11 rounded-lg text-xs font-bold flex items-center justify-center transition-colors ${cellClass}`}
      >
        {container.position}
      </button>
      {isDraft && (
        <span className="absolute -top-1 -right-1 bg-blue-700 text-white text-[8px] leading-none px-1 py-px rounded-full font-bold pointer-events-none">
          {item.plants_count}
        </span>
      )}
    </div>
  );
}

export default function PlantingPlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor' || user?.role === 'admin';

  const [plan, setPlan] = useState(null);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  async function loadPlan() {
    try {
      const p = await api.getPlantingPlan(id);
      setPlan(p);
      const c = await api.getContainers({ sub_zone_id: p.sub_zone_id });
      setContainers(c.containers ?? []);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  useEffect(() => { loadPlan(); }, [id]);

  const itemsByContainer = useMemo(() => {
    if (!plan) return new Map();
    return new Map((plan.items ?? []).map(item => [item.container_id, item]));
  }, [plan]);

  const containersByRow = useMemo(() => {
    const m = new Map();
    for (const c of containers) {
      if (!m.has(c.row_number)) m.set(c.row_number, []);
      m.get(c.row_number).push(c);
    }
    return m;
  }, [containers]);

  const draftItems = useMemo(() => (plan?.items ?? []).filter(i => i.status === 'draft'), [plan]);

  const canEdit = isSupervisor && plan && ['draft', 'active'].includes(plan.status);

  async function handleAdd(container) {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const updated = await api.addPlantingPlanItem(plan.plan_id, {
        container_id: container.container_id,
        plants_count: plan.batch_plants_per_container ?? 1,
      });
      setPlan(updated);
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    } finally { setBusy(false); }
  }

  async function handleRemove(itemId) {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      await api.removePlantingPlanItem(plan.plan_id, itemId);
      setPlan(prev => ({
        ...prev,
        items: prev.items.filter(i => i.item_id !== itemId),
        draft_count: Math.max(0, (prev.draft_count ?? 0) - 1),
      }));
      setSelectedItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    } finally { setBusy(false); }
  }

  async function handleCommit(itemIds) {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const body = itemIds?.length ? { item_ids: itemIds } : {};
      const updated = await api.commitPlantingPlan(plan.plan_id, body);
      setPlan(updated);
      setSelectedItems(new Set());
      const count = itemIds?.length ?? draftItems.length;
      setToast({ message: `Committed ${count} container${count !== 1 ? 's' : ''} ✓`, type: 'success' });
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    } finally { setBusy(false); }
  }

  async function handleSupersede() {
    if (!isSupervisor || busy) return;
    setBusy(true);
    try {
      const newPlan = await api.supersedePlantingPlan(plan.plan_id, {});
      setToast({ message: 'New version created ✓', type: 'success' });
      setTimeout(() => navigate(`/planting-plans/${newPlan.plan_id}`), 900);
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!isSupervisor || busy) return;
    if (!window.confirm('Cancel this planting plan? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.cancelPlantingPlan(plan.plan_id);
      navigate('/planting-plans');
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
      setBusy(false);
    }
  }

  function toggleItem(itemId) {
    setSelectedItems(prev => {
      const s = new Set(prev);
      if (s.has(itemId)) s.delete(itemId);
      else s.add(itemId);
      return s;
    });
  }

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-6 text-gray-500 text-sm">Loading plan…</div>;
  if (error || !plan) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error || 'Plan not found'}</div>
      </div>
    );
  }

  const rowNums = Array.from(containersByRow.keys()).sort((a, b) => a - b);
  const totalDraft = plan.draft_count ?? 0;
  const totalCommitted = plan.committed_count ?? 0;
  const selectedCount = selectedItems.size;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-36">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <button
        onClick={() => navigate('/planting-plans')}
        className="text-sm text-green-700 font-medium mb-5 flex items-center gap-1 hover:text-green-900"
      >
        ← Planting Plans
      </button>

      {/* Plan header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
              {plan.strain_name}
              <span className="text-gray-400 font-normal ml-2 text-base">— {plan.sub_zone_id}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_CHIP[plan.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {plan.status}
              </span>
              <span className="text-xs text-gray-500">v{plan.version}</span>
              {plan.pot_size_gal && (
                <span className="text-xs text-gray-400">{plan.pot_size_gal} gal pots</span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-bold text-green-800 font-mono">
              {totalCommitted}
              <span className="text-sm font-normal text-gray-400"> / {plan.plants_to_place}</span>
            </div>
            <div className="text-xs text-gray-500">{totalDraft} draft · {totalCommitted} committed</div>
          </div>
        </div>
        {plan.notes && (
          <p className="text-sm text-gray-600 mt-3 border-t border-gray-100 pt-3">{plan.notes}</p>
        )}
        <div className="mt-3 border-t border-gray-100 pt-3 flex items-center gap-4">
          <Link
            to={`/batches/${plan.batch_id}`}
            className="text-xs text-green-700 font-medium hover:text-green-900"
            style={{ textDecoration: 'none' }}
          >
            ← View Batch
          </Link>
          <span className="text-xs text-gray-400">Plan #{plan.plan_id}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-3 flex-wrap text-xs text-gray-600">
        <span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Legend:</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-green-100 border border-green-300" />Ready</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-blue-500" />Draft</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-amber-400" />Committed</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-gray-100" />N/A</span>
        {canEdit && <span className="text-gray-400 ml-auto">Tap green to add · Tap blue to select</span>}
      </div>

      {/* Container grid */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">
          Containers — {plan.sub_zone_id}
          {plan.sub_zone_container_count && (
            <span className="font-normal ml-2">({plan.sub_zone_container_count} total)</span>
          )}
        </h2>
        {containers.length === 0 ? (
          <div className="text-sm text-gray-400">No containers found for {plan.sub_zone_id}.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {rowNums.map(rowNum => {
              const rowContainers = containersByRow.get(rowNum) ?? [];
              return (
                <div key={rowNum}>
                  <div className="text-xs font-mono font-semibold text-gray-400 mb-1.5">
                    Row {rowNum}
                    <span className="font-normal ml-1.5">({rowContainers.length} containers)</span>
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {rowContainers.map(c => {
                      const item = itemsByContainer.get(c.container_id);
                      return (
                        <ContainerCell
                          key={c.container_id}
                          container={c}
                          item={item}
                          canEdit={canEdit && !busy}
                          selected={item ? selectedItems.has(item.item_id) : false}
                          onAdd={() => handleAdd(c)}
                          onRemove={() => item && handleRemove(item.item_id)}
                          onSelect={() => item && toggleItem(item.item_id)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Draft items list */}
      {draftItems.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
          <h2 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-3">
            Draft ({draftItems.length})
            {selectedCount > 0 && (
              <span className="ml-2 normal-case font-normal text-blue-600">— {selectedCount} selected</span>
            )}
          </h2>
          <div className="flex flex-col gap-2">
            {draftItems.map(item => (
              <div key={item.item_id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.item_id)}
                  onChange={() => toggleItem(item.item_id)}
                  className="w-4 h-4 rounded accent-blue-600 flex-shrink-0"
                />
                <span className="font-mono text-xs text-gray-700 flex-1">{item.container_id}</span>
                <span className="text-xs text-gray-500">{item.plants_count}×</span>
                {canEdit && (
                  <button
                    onClick={() => handleRemove(item.item_id)}
                    disabled={busy}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 flex-shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supersede / Cancel secondary actions */}
      {isSupervisor && plan.status === 'active' && (
        <div className="mb-4">
          <button
            disabled={busy}
            onClick={handleSupersede}
            className="w-full py-3 border border-gray-200 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            style={{ minHeight: '56px' }}
          >
            New Version (supersede current plan) →
          </button>
        </div>
      )}

      {isSupervisor && plan.status === 'draft' && (
        <div className="mb-4 flex gap-2">
          <button
            disabled={busy}
            onClick={handleSupersede}
            className="flex-1 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            style={{ minHeight: '56px' }}
          >
            New Version →
          </button>
          <button
            disabled={busy}
            onClick={handleCancel}
            className="flex-1 py-3 border border-red-200 text-red-600 font-medium rounded-xl text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
            style={{ minHeight: '56px' }}
          >
            Cancel Plan
          </button>
        </div>
      )}

      {/* Fixed bottom action bar — commit actions */}
      {canEdit && draftItems.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 max-w-5xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-3 flex gap-2">
            {selectedCount > 0 && (
              <button
                disabled={busy}
                onClick={() => handleCommit(Array.from(selectedItems))}
                className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                style={{ minHeight: '56px' }}
              >
                {busy ? '…' : `Commit Selected (${selectedCount})`}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => handleCommit([])}
              className="flex-1 py-3 bg-green-800 text-white font-semibold rounded-xl text-sm hover:bg-green-900 disabled:opacity-50 transition-colors"
              style={{ minHeight: '56px' }}
            >
              {busy ? '…' : `Commit All (${draftItems.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
