import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

const STATUS_LABELS = {
  'germ':         'Germination',
  'seedling':     'Seedlings',
  'cult-hoop':    'Cult-Hoop',
  'field-veg':    'Field — Veg',
  'field-flower': 'Field — Flower',
  'flush':        'Flush',
  'harvest':      'Harvest',
  'closed':       'Closed',
};

const STATUS_CHIP = {
  'germ':         'bg-gray-100 text-gray-700',
  'seedling':     'bg-lime-100 text-lime-700',
  'cult-hoop':    'bg-green-100 text-green-700',
  'field-veg':    'bg-green-100 text-green-800',
  'field-flower': 'bg-purple-100 text-purple-700',
  'flush':        'bg-amber-100 text-amber-700',
  'harvest':      'bg-orange-100 text-orange-700',
  'closed':       'bg-gray-100 text-gray-400',
};

const LIFECYCLE_ORDER = ['germ', 'seedling', 'cult-hoop', 'field-veg', 'field-flower', 'flush', 'harvest', 'closed'];

const NEXT_STATUS = {
  'germ':         'seedling',
  'seedling':     'cult-hoop',
  'cult-hoop':    'field-veg',
  'field-veg':    'field-flower',
  'field-flower': 'flush',
  'flush':        'harvest',
  'harvest':      'closed',
};

const DATE_FOR_STATUS = {
  'seedling':     'transplant_date',
  'field-veg':    'field_move_date',
  'harvest':      'harvest_date',
  'closed':       'closed_date',
};

// Statuses where date is tracked on the batch record
const STAGE_DATES = {
  'germ':         s => s.sow_date,
  'seedling':     s => s.transplant_date,
  'cult-hoop':    s => s.transplant_date,
  'field-veg':    s => s.field_move_date,
  'field-flower': s => s.field_move_date,
  'flush':        s => s.harvest_date,
  'harvest':      s => s.harvest_date,
  'closed':       s => s.closed_date,
};

export default function BatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [showSubZoneForm, setShowSubZoneForm] = useState(false);

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'admin');

  function load() {
    setLoading(true);
    api.getBatch(id)
      .then((data) => { setBatch(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error || 'Batch not found'}
        </div>
      </div>
    );
  }

  const nextStatus = NEXT_STATUS[batch.status];
  const currentStatusIdx = LIFECYCLE_ORDER.indexOf(batch.status);
  const needsSubZone = nextStatus === 'field-veg' && !batch.sub_zone_id;
  const confirmRequired = nextStatus === 'harvest' || nextStatus === 'closed';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {/* Back + Header */}
      <button
        onClick={() => navigate('/batches')}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← Batches
      </button>

      <div className="flex items-start gap-3 flex-wrap mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'Fraunces, serif' }}>
            {batch.strain_name}
          </h1>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              batch.strain_type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
            }`}>
              {batch.strain_type === 'auto' ? 'AUTO' : 'PHOTO'}
            </span>
            {batch.sub_zone_id && (
              <>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                  {batch.sub_zone_id}
                </span>
                <button
                  onClick={() => navigate(`/containers?sub_zone_id=${batch.sub_zone_id}`)}
                  className="text-xs text-green-700 font-medium hover:text-green-900 underline"
                >
                  View Containers
                </button>
              </>
            )}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[batch.status] ?? batch.status}
            </span>
          </div>
        </div>
        {batch.metrc_plant_batch_uid && (
          <button
            onClick={() => { navigator.clipboard?.writeText(batch.metrc_plant_batch_uid); }}
            className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 font-mono hover:text-gray-600 transition-colors"
            title="Copy METRC UID"
          >
            {batch.metrc_plant_batch_uid.slice(0, 8)}…
          </button>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricCard label={`Day ${batch.days_in_stage ?? 0}`} sub={STATUS_LABELS[batch.status] ?? batch.status} />
        <MetricCard label={`${batch.plant_count_current}`} sub="plants" />
        <MetricCard label={batch.sow_date} sub="sow date" mono />
      </div>

      {/* METRC UID edit link */}
      {batch.status !== 'closed' && isSupervisor && (
        <MetrcEditInline batch={batch} onSaved={(updated) => setBatch(b => ({ ...b, ...updated }))} />
      )}

      {/* Current recipe card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Fertigation Recipe</h2>
          {isSupervisor && batch.status !== 'closed' && (
            <button
              onClick={() => setShowRecipeModal(true)}
              className="text-xs text-green-700 font-medium hover:text-green-900"
            >
              {batch.active_recipe_id ? 'Change' : 'Assign'}
            </button>
          )}
        </div>
        {batch.active_recipe_id ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>
                {batch.active_recipe_name}
              </span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                v{batch.active_recipe_version}
              </span>
            </div>
            <div className="flex gap-4 text-sm text-gray-600">
              {(batch.active_recipe_ec_low != null || batch.active_recipe_ec_high != null) && (
                <span>EC {batch.active_recipe_ec_low ?? '?'}–{batch.active_recipe_ec_high ?? '?'} mS/cm</span>
              )}
              {(batch.active_recipe_ph_low != null || batch.active_recipe_ph_high != null) && (
                <span>pH {batch.active_recipe_ph_low ?? '?'}–{batch.active_recipe_ph_high ?? '?'}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-amber-600 font-medium">No fertigation recipe assigned</span>
          </div>
        )}
      </div>

      {/* Lifecycle timeline + advance */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-4">Lifecycle</h2>
        <div className="flex flex-col gap-2 mb-4">
          {LIFECYCLE_ORDER.map((status, idx) => {
            const done = idx < currentStatusIdx;
            const active = idx === currentStatusIdx;
            const dateGetter = STAGE_DATES[status];
            const date = dateGetter ? dateGetter(batch) : null;
            return (
              <div key={status} className={`flex items-center gap-3 text-sm ${
                done ? 'text-green-700' : active ? 'text-gray-900 font-semibold' : 'text-gray-400'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  done ? 'bg-green-600 text-white' : active ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done ? '✓' : idx + 1}
                </span>
                <span className="flex-1">{STATUS_LABELS[status]}</span>
                {date && <span className="text-xs text-gray-400 font-mono">{date.slice(0, 10)}</span>}
              </div>
            );
          })}
        </div>

        {/* Advance button */}
        {nextStatus && isSupervisor && batch.status !== 'closed' && (
          <div>
            {needsSubZone && !showSubZoneForm ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                <p className="text-sm text-amber-700 mb-3">
                  Sub-zone must be assigned before moving to field.
                </p>
                <button
                  onClick={() => setShowSubZoneForm(true)}
                  className="text-sm text-amber-700 font-semibold underline"
                >
                  Assign sub-zone
                </button>
              </div>
            ) : needsSubZone && showSubZoneForm ? (
              <SubZoneAssignForm
                batch={batch}
                onSaved={(updated) => { setBatch(b => ({ ...b, ...updated })); setShowSubZoneForm(false); }}
                onCancel={() => setShowSubZoneForm(false)}
              />
            ) : null}

            {!needsSubZone && (
              <button
                onClick={() => {
                  if (confirmRequired) {
                    setShowTransitionModal(true);
                  } else {
                    handleTransition(nextStatus, null);
                  }
                }}
                className="w-full py-4 bg-green-800 text-white font-semibold rounded-xl hover:bg-green-900 transition-colors text-sm"
                style={{ minHeight: '56px' }}
              >
                Advance to {STATUS_LABELS[nextStatus]}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Application counts */}
      {(batch.application_counts?.fertigation > 0 || batch.application_counts?.foliar > 0 || batch.application_counts?.pesticide > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Applications</h2>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <div className="text-lg font-bold text-green-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {batch.application_counts.fertigation}
              </div>
              <div className="text-xs text-gray-500">Fertigation</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {batch.application_counts.foliar}
              </div>
              <div className="text-xs text-gray-500">Foliar</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-800" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {batch.application_counts.pesticide}
              </div>
              <div className="text-xs text-gray-500">Pesticide</div>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {batch.notes && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{batch.notes}</p>
        </div>
      )}

      {/* Modals */}
      {showRecipeModal && (
        <RecipeModal
          batch={batch}
          onClose={() => setShowRecipeModal(false)}
          onAssigned={(updated) => { setBatch(b => ({ ...b, ...updated })); setShowRecipeModal(false); load(); }}
        />
      )}

      {showTransitionModal && (
        <TransitionModal
          nextStatus={nextStatus}
          nextLabel={STATUS_LABELS[nextStatus]}
          onClose={() => setShowTransitionModal(false)}
          onConfirm={(notes) => {
            setShowTransitionModal(false);
            handleTransition(nextStatus, notes);
          }}
        />
      )}
    </div>
  );

  async function handleTransition(toStatus, notes) {
    try {
      const updated = await api.transitionBatch(id, { to_status: toStatus, notes });
      setBatch(b => ({ ...b, ...updated }));
      load();
    } catch (e) {
      setError(e.message);
    }
  }
}

function MetricCard({ label, sub, mono }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <div className={`text-lg font-bold text-gray-900 ${mono ? 'font-mono text-base' : ''}`}
        style={mono ? { fontFamily: 'JetBrains Mono, monospace' } : {}}>
        {label}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function MetrcEditInline({ batch, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(batch.metrc_plant_batch_uid ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (!editing) {
    return (
      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className="text-gray-500">METRC UID:</span>
        <span className={`font-mono ${batch.metrc_plant_batch_uid ? 'text-gray-700' : 'text-amber-600 italic'}`}>
          {batch.metrc_plant_batch_uid || 'Not set — required before harvest'}
        </span>
        <button onClick={() => setEditing(true)} className="text-xs text-green-700 underline hover:text-green-900">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <input
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono flex-1 min-w-0"
        placeholder="24-character METRC UID"
        value={value}
        onChange={e => { setValue(e.target.value); setErr(''); }}
        maxLength={64}
      />
      {err && <span className="text-red-600 text-xs w-full">{err}</span>}
      <button
        onClick={async () => {
          setSaving(true);
          try {
            const updated = await api.updateBatch(batch.batch_id, { metrc_plant_batch_uid: value || null });
            onSaved(updated);
            setEditing(false);
          } catch (e) { setErr(e.message); }
          setSaving(false);
        }}
        disabled={saving}
        className="bg-green-800 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-green-900 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => { setEditing(false); setValue(batch.metrc_plant_batch_uid ?? ''); }} className="text-sm text-gray-500 hover:text-gray-700">
        Cancel
      </button>
    </div>
  );
}

function SubZoneAssignForm({ batch, onSaved, onCancel }) {
  const SUB_ZONES = ['Z1A','Z1B','Z2A','Z2B','Z3A','Z3B','Z4A','Z4B'];
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
      <p className="text-sm font-medium text-amber-800 mb-3">Assign sub-zone before moving to field:</p>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {SUB_ZONES.map(sz => (
          <button
            key={sz}
            onClick={() => setSelected(sz)}
            className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
              selected === sz
                ? 'bg-green-800 text-white border-green-800'
                : 'bg-white text-gray-700 border-gray-200 hover:border-green-400'
            }`}
          >
            {sz}
          </button>
        ))}
      </div>
      {err && <p className="text-red-600 text-xs mb-2">{err}</p>}
      <div className="flex gap-2">
        <button
          disabled={!selected || saving}
          onClick={async () => {
            setSaving(true);
            try {
              const updated = await api.updateBatch(batch.batch_id, { sub_zone_id: selected });
              onSaved(updated);
            } catch (e) { setErr(e.message); }
            setSaving(false);
          }}
          className="flex-1 py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Sub-zone'}
        </button>
        <button onClick={onCancel} className="py-2.5 px-4 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}

function RecipeModal({ batch, onClose, onAssigned }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getFertigationRecipes()
      .then(data => { setRecipes(data.filter(r => r.recipe_id != null)); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-10 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            {batch.active_recipe_id ? 'Change Recipe' : 'Assign Recipe'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Loading recipes…</div>
        ) : recipes.length === 0 ? (
          <div className="text-amber-600 text-sm">No active recipes found. Create a recipe first.</div>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {recipes.map(recipe => (
              <button
                key={recipe.recipe_id}
                onClick={() => setSelected(recipe)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  selected?.recipe_id === recipe.recipe_id
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
                style={{ minHeight: '56px' }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-900" style={{ fontFamily: 'Fraunces, serif' }}>
                    {recipe.name}
                  </span>
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                    v{recipe.version}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {recipe.ec_target_low != null ? `EC ${recipe.ec_target_low}–${recipe.ec_target_high}` : ''}
                  {recipe.ph_target_low != null ? ` · pH ${recipe.ph_target_low}–${recipe.ph_target_high}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why this recipe is being assigned…"
            />
          </div>
        )}

        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

        <button
          disabled={!selected || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api.assignBatchRecipe(batch.batch_id, { recipe_id: selected.recipe_id, notes: notes || null });
              onAssigned({
                active_recipe_id: selected.recipe_id,
                active_recipe_name: selected.name,
                active_recipe_version: selected.version,
                active_recipe_ec_low: selected.ec_target_low,
                active_recipe_ec_high: selected.ec_target_high,
                active_recipe_ph_low: selected.ph_target_low,
                active_recipe_ph_high: selected.ph_target_high,
              });
            } catch (e) { setErr(e.message); }
            setSaving(false);
          }}
          className="w-full py-4 bg-green-800 text-white rounded-xl font-semibold text-sm hover:bg-green-900 disabled:opacity-50 transition-colors"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Assigning…' : 'Assign Recipe'}
        </button>
      </div>
    </div>
  );
}

function TransitionModal({ nextLabel, onClose, onConfirm }) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-gray-900 text-lg mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
          Advance to {nextLabel}?
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          This will move the batch to the next stage. This action is logged and cannot be undone.
        </p>
        <textarea
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none mb-4"
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes about this transition…"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notes || null)}
            className="flex-1 py-3 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900"
            style={{ minHeight: '56px' }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
