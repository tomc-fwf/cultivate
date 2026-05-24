import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const TYPE_LABELS = {
  move:         { label: 'Move Plants',    color: 'bg-blue-100 text-blue-700'   },
  destroy:      { label: 'Destroy Plants', color: 'bg-red-100 text-red-700'     },
  phase_change: { label: 'Phase Change',   color: 'bg-purple-100 text-purple-700' },
  other:        { label: 'Other',          color: 'bg-gray-100 text-gray-600'   },
};

const LOSS_REASON_LABELS = {
  never_sprouted: 'Never sprouted',
  died:           'Died',
  damaged:        'Damaged',
  missing:        'Missing / unknown',
  other:          'Other',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MetrcTodos() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getMetrcTodos(filter ? { status: filter } : {})
      .then(data => { setTodos(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleToggle(todo) {
    setActionLoading(todo.todo_id);
    try {
      if (todo.status === 'pending') {
        await api.markMetrcTodoDone(todo.todo_id);
        setToast({ message: 'Marked done ✓', type: 'success' });
      } else {
        await api.reopenMetrcTodo(todo.todo_id);
        setToast({ message: 'Reopened', type: 'info' });
      }
      load();
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = todos.filter(t => t.status === 'pending').length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            METRC Actions
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Manual entries required in METRC</p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'pending', label: 'Pending' },
          { value: 'done',    label: 'Done'    },
          { value: '',        label: 'All'     },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-green-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Info banner for pending */}
      {filter === 'pending' && todos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 text-sm text-amber-800">
          These actions need to be entered manually in METRC. Tap <strong>Mark Done</strong> after completing each one.
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>
      ) : todos.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">✓</div>
          <div className="text-gray-500 text-sm">
            {filter === 'pending' ? 'No pending METRC actions' : 'No actions found'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {todos.map(todo => {
            const typeMeta = TYPE_LABELS[todo.todo_type] ?? TYPE_LABELS.other;
            const isDone = todo.status === 'done';
            return (
              <div
                key={todo.todo_id}
                className={`bg-white border rounded-2xl p-4 ${isDone ? 'border-gray-100 opacity-60' : 'border-amber-200'}`}
              >
                {/* Top row: type badge + batch name */}
                <div className="flex items-start gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${typeMeta.color}`}>
                    {typeMeta.label}
                  </span>
                  <button
                    onClick={() => navigate(`/batches/${todo.batch_id}`)}
                    className="text-xs text-green-700 font-medium hover:underline truncate"
                  >
                    {todo.batch_name || todo.strain_name || `Batch #${todo.batch_id}`}
                  </button>
                </div>

                {/* Description */}
                <p className="text-sm font-medium text-gray-900 mb-2">{todo.description}</p>

                {/* Location line */}
                {(todo.from_location || todo.to_location) && (
                  <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    {todo.from_location && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{todo.from_location}</span>}
                    {todo.from_location && todo.to_location && <span>→</span>}
                    {todo.to_location && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{todo.to_location}</span>}
                  </div>
                )}

                {/* Loss reason */}
                {todo.loss_reason && (
                  <div className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-xl mb-2">
                    Reason: {LOSS_REASON_LABELS[todo.loss_reason] ?? todo.loss_reason}
                    {todo.loss_notes ? ` — ${todo.loss_notes}` : ''}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">
                    {isDone
                      ? `Done ${formatDate(todo.completed_at)}${todo.completed_by_name ? ` by ${todo.completed_by_name}` : ''}`
                      : `Created ${formatDate(todo.created_at)}`}
                  </span>
                  <button
                    onClick={() => handleToggle(todo)}
                    disabled={actionLoading === todo.todo_id}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 ${
                      isDone
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-green-800 text-white hover:bg-green-900'
                    }`}
                    style={{ minHeight: '36px' }}
                  >
                    {actionLoading === todo.todo_id ? '…' : isDone ? 'Reopen' : 'Mark Done'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-2xl text-sm font-medium shadow-lg z-50 ${
          toast.type === 'success' ? 'bg-green-800 text-white'
          : toast.type === 'error' ? 'bg-red-600 text-white'
          : 'bg-gray-800 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
