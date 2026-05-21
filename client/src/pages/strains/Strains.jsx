import { useEffect, useState } from 'react';
import { useAuth } from '../../App';
import { api } from '../../api';

export default function Strains() {
  const { user } = useAuth();
  const [strains, setStrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');
  const isAdmin = user && user.role === 'admin';

  function load() {
    setLoading(true);
    api.getStrains()
      .then(data => { setStrains(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(strain) {
    if (!confirm(`Delete strain "${strain.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteStrain(strain.strain_id);
      setStrains(prev => prev.filter(s => s.strain_id !== strain.strain_id));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Strains
        </h1>
        {isSupervisor && !showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="bg-green-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-green-900 transition-colors"
            style={{ minHeight: '44px' }}
          >
            + New Strain
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {/* New strain inline form */}
      {showNew && (
        <StrainForm
          onSave={async (data) => {
            const s = await api.createStrain(data);
            setStrains(prev => [...prev, { ...s, batch_count: 0 }]);
            setShowNew(false);
          }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : strains.length === 0 && !showNew ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-2">No strains yet.</p>
          {isSupervisor && (
            <button onClick={() => setShowNew(true)} className="text-green-700 underline text-sm">
              Add the first strain
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {strains.map(strain => (
            editingId === strain.strain_id ? (
              <StrainForm
                key={strain.strain_id}
                initial={strain}
                onSave={async (data) => {
                  const updated = await api.updateStrain(strain.strain_id, data);
                  setStrains(prev => prev.map(s => s.strain_id === strain.strain_id ? { ...s, ...updated } : s));
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <StrainRow
                key={strain.strain_id}
                strain={strain}
                isSupervisor={isSupervisor}
                isAdmin={isAdmin}
                onEdit={() => setEditingId(strain.strain_id)}
                onDelete={() => handleDelete(strain)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

function StrainRow({ strain, isSupervisor, isAdmin, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            {strain.name}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            strain.type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
          }`}>
            {strain.type === 'auto' ? 'AUTO' : 'PHOTO'}
          </span>
          {strain.batch_count > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {strain.batch_count} active {strain.batch_count === 1 ? 'batch' : 'batches'}
            </span>
          )}
        </div>
        {strain.genetics && (
          <div className="text-xs text-gray-500 mt-0.5">{strain.genetics}</div>
        )}
      </div>
      {isSupervisor && (
        <button
          onClick={onEdit}
          className="text-sm text-green-700 font-medium hover:text-green-900 px-2 py-1"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          Edit
        </button>
      )}
      {isAdmin && strain.batch_count === 0 && (
        <button
          onClick={onDelete}
          className="text-sm text-red-500 hover:text-red-700 px-2 py-1"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          Delete
        </button>
      )}
    </div>
  );
}

function StrainForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'auto');
  const [genetics, setGenetics] = useState(initial?.genetics ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit() {
    if (!name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave({ name: name.trim(), type, genetics: genetics.trim() || null, notes: notes.trim() || null });
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-2">
      <h3 className="font-semibold text-green-900 text-sm mb-4">
        {initial ? 'Edit Strain' : 'New Strain'}
      </h3>
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setErr(''); }}
            placeholder="e.g. Northern Lights Auto"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white"
            style={{ minHeight: '44px' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
          <div className="flex gap-2">
            <button
              onClick={() => setType('auto')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                type === 'auto' ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              Autoflower
            </button>
            <button
              onClick={() => setType('photo')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                type === 'photo' ? 'bg-purple-700 text-white border-purple-700' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              Photoperiod
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Genetics</label>
          <input
            type="text"
            value={genetics}
            onChange={e => setGenetics(e.target.value)}
            placeholder="e.g. Ruderalis × Northern Lights"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white"
            style={{ minHeight: '44px' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes about this strain…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white resize-none"
            rows={2}
          />
        </div>
        {err && <p className="text-red-600 text-xs">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button
            disabled={saving}
            onClick={handleSubmit}
            className="flex-1 py-3 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 disabled:opacity-50"
            style={{ minHeight: '56px' }}
          >
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Strain'}
          </button>
          <button
            onClick={onCancel}
            className="py-3 px-4 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
