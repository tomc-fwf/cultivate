import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function BatchNew() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [strains, setStrains] = useState([]);
  const [strainsLoading, setStrainsLoading] = useState(true);

  const [strainId, setStrainId] = useState('');
  const [plantCount, setPlantCount] = useState('');
  const [sowDate, setSowDate] = useState(todayISO());
  const [metrcUid, setMetrcUid] = useState('');
  const [notes, setNotes] = useState('');

  const [showNewStrain, setShowNewStrain] = useState(false);
  const [newStrainName, setNewStrainName] = useState('');
  const [newStrainType, setNewStrainType] = useState('auto');
  const [newStrainGenetics, setNewStrainGenetics] = useState('');
  const [savingStrain, setSavingStrain] = useState(false);
  const [strainErr, setStrainErr] = useState('');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    api.getStrains()
      .then(data => { setStrains(data); setStrainsLoading(false); })
      .catch(() => setStrainsLoading(false));
  }, []);

  function validate() {
    const errors = {};
    if (metrcUid && !/^[A-Za-z0-9]{24}$/.test(metrcUid.trim()))
      errors.metrcUid = 'METRC UID must be exactly 24 alphanumeric characters';
    if (!strainId) errors.strain = 'Strain is required';
    if (!plantCount || isNaN(Number(plantCount)) || Number(plantCount) <= 0)
      errors.plantCount = 'Plant count must be a positive number';
    if (!sowDate) errors.sowDate = 'Sow date is required';
    return errors;
  }

  async function handleSave() {
    const errors = validate();
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setSaving(true);
    setErr('');
    try {
      const batch = await api.createBatch({
        strain_id: Number(strainId),
        plant_count_initial: Number(plantCount),
        sow_date: sowDate,
        metrc_plant_batch_uid: metrcUid || null,
        notes: notes || null,
        // sub_zone_id intentionally omitted — assigned when batch moves to Field
      });
      navigate(`/batches/${batch.batch_id}`);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  async function handleCreateStrain() {
    if (!newStrainName.trim()) { setStrainErr('Name is required'); return; }
    setSavingStrain(true);
    setStrainErr('');
    try {
      const strain = await api.createStrain({
        name: newStrainName.trim(),
        type: newStrainType,
        genetics: newStrainGenetics.trim() || null,
      });
      setStrains(prev => [...prev, strain]);
      setStrainId(String(strain.strain_id));
      setShowNewStrain(false);
      setNewStrainName('');
      setNewStrainType('auto');
      setNewStrainGenetics('');
    } catch (e) {
      setStrainErr(e.message);
    }
    setSavingStrain(false);
  }

  const selectedStrain = strains.find(s => String(s.strain_id) === strainId);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      <button
        onClick={() => navigate('/batches')}
        className="text-sm text-green-700 font-medium mb-5 flex items-center gap-1 hover:text-green-900"
      >
        ← Plant Batches
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        New Plant Batch
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Starts in <span className="font-semibold text-gray-700">Germ-01</span>. Sub-zone is assigned when the batch moves to Field.
      </p>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{err}</div>
      )}

      {/* METRC Plant Batch UID */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-1">METRC Plant Batch UID</label>
        <p className="text-xs text-gray-500 mb-2">
          The 24-character UID assigned by METRC. Required before harvest — can be added now or from the batch detail.
        </p>
        <input
          type="text"
          value={metrcUid}
          onChange={e => { setMetrcUid(e.target.value.trim()); setFieldErrors(fe => ({ ...fe, metrcUid: undefined })); }}
          placeholder="e.g. 1A4FF0300000222000001234"
          className={`w-full border rounded-xl px-4 py-3 text-base font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-600 ${
            fieldErrors.metrcUid ? 'border-red-400 bg-red-50'
              : metrcUid.length === 24 ? 'border-green-500 bg-green-50'
              : 'border-gray-300'
          }`}
          style={{ minHeight: '56px' }}
          maxLength={24}
          autoCapitalize="characters"
          spellCheck={false}
        />
        <div className="flex items-center justify-between mt-1">
          {fieldErrors.metrcUid ? (
            <p className="text-red-500 text-xs">{fieldErrors.metrcUid}</p>
          ) : metrcUid.length > 0 && metrcUid.length < 24 ? (
            <p className="text-amber-600 text-xs">{24 - metrcUid.length} characters remaining</p>
          ) : metrcUid.length === 24 ? (
            <p className="text-green-700 text-xs font-medium">✓ Valid format</p>
          ) : (
            <p className="text-gray-400 text-xs">Optional now</p>
          )}
          <span className="text-xs text-gray-400 font-mono">{metrcUid.length}/24</span>
        </div>
      </div>

      {/* Strain */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Strain <span className="text-red-500">*</span>
        </label>
        {strainsLoading ? (
          <div className="text-sm text-gray-400">Loading strains…</div>
        ) : (
          <>
            <select
              value={strainId}
              onChange={e => { setStrainId(e.target.value); setFieldErrors(fe => ({ ...fe, strain: undefined })); }}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
              style={{ minHeight: '56px' }}
            >
              <option value="">Select a strain…</option>
              {strains.map(s => (
                <option key={s.strain_id} value={s.strain_id}>
                  {s.name} ({s.type === 'auto' ? 'AUTO' : 'PHOTO'})
                </option>
              ))}
            </select>
            {selectedStrain && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  selectedStrain.type === 'auto' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {selectedStrain.type === 'auto' ? 'AUTO' : 'PHOTO'}
                </span>
                {selectedStrain.genetics && <span className="text-xs text-gray-500">{selectedStrain.genetics}</span>}
              </div>
            )}
            {fieldErrors.strain && <p className="text-red-500 text-xs mt-1">{fieldErrors.strain}</p>}

            {!showNewStrain ? (
              <button onClick={() => setShowNewStrain(true)} className="text-xs text-green-700 underline mt-2 hover:text-green-900">
                + Add new strain
              </button>
            ) : (
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">New Strain</p>
                <div className="flex flex-col gap-3">
                  <input type="text" placeholder="Strain name *" value={newStrainName}
                    onChange={e => { setNewStrainName(e.target.value); setStrainErr(''); }}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    {[['auto', 'AUTO', 'bg-green-800 border-green-800'], ['photo', 'PHOTO', 'bg-purple-700 border-purple-700']].map(([val, label, active]) => (
                      <button key={val} onClick={() => setNewStrainType(val)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          newStrainType === val ? `${active} text-white` : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                  <input type="text" placeholder="Genetics (optional)" value={newStrainGenetics}
                    onChange={e => setNewStrainGenetics(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  {strainErr && <p className="text-red-500 text-xs">{strainErr}</p>}
                  <div className="flex gap-2">
                    <button disabled={savingStrain} onClick={handleCreateStrain}
                      className="flex-1 py-2.5 bg-green-800 text-white rounded-xl text-sm font-semibold hover:bg-green-900 disabled:opacity-50"
                    >
                      {savingStrain ? 'Creating…' : 'Create & Select'}
                    </button>
                    <button onClick={() => { setShowNewStrain(false); setStrainErr(''); }}
                      className="py-2.5 px-3 text-sm text-gray-500 hover:text-gray-700"
                    >Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Plant count */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Plant count <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={plantCount}
          onChange={e => { setPlantCount(e.target.value); setFieldErrors(fe => ({ ...fe, plantCount: undefined })); }}
          placeholder="e.g. 150"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          style={{ minHeight: '56px' }}
        />
        {fieldErrors.plantCount && <p className="text-red-500 text-xs mt-1">{fieldErrors.plantCount}</p>}
      </div>

      {/* Sow date */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Sow date <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={sowDate}
          onChange={e => { setSowDate(e.target.value); setFieldErrors(fe => ({ ...fe, sowDate: undefined })); }}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          style={{ minHeight: '56px' }}
        />
        {fieldErrors.sowDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.sowDate}</p>}
      </div>

      {/* Notes */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes about this plant batch…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
          rows={3}
        />
      </div>

      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-lg mx-auto">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-green-800 text-white font-semibold rounded-2xl hover:bg-green-900 disabled:opacity-50 transition-colors shadow-lg text-base"
          style={{ minHeight: '56px' }}
        >
          {saving ? 'Creating plant batch…' : 'Create Plant Batch'}
        </button>
      </div>
    </div>
  );
}
