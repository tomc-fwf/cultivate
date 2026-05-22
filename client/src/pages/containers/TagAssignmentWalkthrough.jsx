import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

const METRC_TAG_RE = /^[A-Za-z0-9]{24}$/;

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <div className="bg-green-700 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2">
        ✓ {message}
      </div>
    </div>
  );
}

function ReassignModal({ conflict, targetContainerId, targetAssignmentId, onReassigned, onCancel }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleReassign() {
    if (!reason.trim()) { setError('Reason is required'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await api.reassignTag({
        metrc_plant_tag: conflict.metrc_plant_tag,
        from_assignment_id: conflict.existing_assignment.assignment_id,
        to_container_id: targetContainerId,
        to_assignment_id: targetAssignmentId ?? undefined,
        reason: reason.trim(),
      });
      onReassigned(result.to_assignment);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">⚠️</span>
          <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            Tag Already Assigned
          </h2>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Current assignment</div>
          <div className="font-mono text-sm text-amber-900 mb-1">
            …{conflict.metrc_plant_tag.slice(-8)}
          </div>
          <div className="text-sm text-amber-800">
            Container:{' '}
            <span className="font-bold font-mono">{conflict.existing_assignment.container_id}</span>
          </div>
          {conflict.existing_assignment.strain_name && (
            <div className="text-xs text-amber-700 mt-0.5">
              Batch: {conflict.existing_assignment.strain_name}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-700 mb-4">
          Moving this tag to{' '}
          <span className="font-bold font-mono">{targetContainerId}</span>{' '}
          will clear it from the current container.
        </p>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Reason for reassignment <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. Tag was scanned at wrong container, correcting mis-scan…"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleReassign}
            disabled={saving || !reason.trim()}
            className="flex-1 bg-amber-600 text-white font-bold py-4 rounded-2xl disabled:opacity-40 hover:bg-amber-700 active:bg-amber-800 transition-colors"
            style={{ minHeight: '56px' }}
          >
            {saving ? 'Reassigning…' : 'Reassign Tag'}
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-4 text-gray-600 font-semibold rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors"
            style={{ minHeight: '56px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PlacementRow({ placement, inputRefs, onAssigned }) {
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | done | conflict | error
  const [assignedTag, setAssignedTag] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isValid = METRC_TAG_RE.test(tagInput);

  async function doAssign(tag) {
    if (status === 'saving' || status === 'done') return;
    setStatus('saving');
    setErrorMsg('');
    const result = await api.assignTagRaw({
      container_id: placement.container_id,
      metrc_plant_tag: tag,
      assignment_id: placement.assignment_id,
    });
    if (result.ok) {
      setAssignedTag(tag);
      setStatus('done');
      setTagInput('');
      onAssigned(placement.assignment_id, tag);
    } else if (result.status === 409) {
      setConflict({
        metrc_plant_tag: tag,
        existing_assignment: result.data.existing_assignment,
        message: result.data.message,
      });
      setStatus('conflict');
    } else {
      setErrorMsg(result.data?.error || 'Assignment failed');
      setStatus('error');
    }
  }

  async function handleInputChange(e) {
    const val = e.target.value.replace(/\s/g, '').toUpperCase();
    setTagInput(val);
    if (METRC_TAG_RE.test(val)) {
      await doAssign(val);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && isValid) doAssign(tagInput);
  }

  function handleReassigned(toAssignment) {
    setAssignedTag(toAssignment.metrc_plant_tag);
    setStatus('done');
    setConflict(null);
    setTagInput('');
    onAssigned(placement.assignment_id, toAssignment.metrc_plant_tag);
  }

  return (
    <>
      {conflict && (
        <ReassignModal
          conflict={conflict}
          targetContainerId={placement.container_id}
          targetAssignmentId={placement.assignment_id}
          onReassigned={handleReassigned}
          onCancel={() => { setConflict(null); setStatus('idle'); setTagInput(''); }}
        />
      )}

      <div className={`border rounded-2xl p-4 mb-2 transition-colors ${
        status === 'done' ? 'bg-green-50 border-green-300' :
        status === 'conflict' || status === 'error' ? 'bg-red-50 border-red-200' :
        'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-sm font-bold text-gray-800 flex-1 min-w-0 truncate">
            {placement.container_id}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">Pos {placement.position}</span>
          {status === 'done' && (
            <span className="text-green-600 text-lg flex-shrink-0" aria-label="Tagged">✓</span>
          )}
        </div>

        {status === 'done' ? (
          <div className="text-sm text-green-800 font-mono">
            {assignedTag.slice(0, -4)}
            <span className="font-bold text-green-900">{assignedTag.slice(-4)}</span>
            <span className="text-xs text-green-600 font-sans ml-2">Tagged</span>
          </div>
        ) : (
          <>
            <input
              ref={el => { if (inputRefs) inputRefs.current[placement.assignment_id] = el; }}
              type="text"
              value={tagInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              maxLength={24}
              disabled={status === 'saving'}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="Scan or type 24-character METRC tag"
              className={`w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 transition-colors ${
                tagInput.length > 0 && tagInput.length < 24 ? 'border-amber-300 focus:ring-amber-300' :
                isValid ? 'border-green-400 focus:ring-green-300' :
                'border-gray-200 focus:ring-green-300'
              }`}
              style={{ minHeight: '52px' }}
            />
            <div className="flex items-center justify-between mt-1">
              {tagInput.length > 0 && !isValid ? (
                <span className="text-xs text-amber-600">
                  {tagInput.length}/24 — {24 - tagInput.length} more
                </span>
              ) : (
                <span />
              )}
              {status === 'saving' && (
                <span className="text-xs text-gray-400">Saving…</span>
              )}
              {errorMsg && (
                <span className="text-xs text-red-600">{errorMsg}</span>
              )}
              {status === 'conflict' && !conflict && (
                <button
                  onClick={() => setStatus('idle')}
                  className="text-xs text-amber-600 underline"
                >
                  Retry
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function TagAssignmentWalkthrough() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const batchIdParam = searchParams.get('batch_id') ?? '';

  const [rows, setRows] = useState([]);
  const [totalUntagged, setTotalUntagged] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(batchIdParam);

  const [completedCount, setCompletedCount] = useState(0);
  const [toast, setToast] = useState(null);

  const inputRefs = useRef({});

  function load(batchId) {
    setLoading(true);
    setLoadError('');
    setCompletedCount(0);
    const params = {};
    if (batchId) params.batch_id = batchId;
    api.getUntaggedAssignments(params)
      .then(d => {
        setRows(d.rows ?? []);
        setTotalUntagged(d.total_untagged ?? 0);
        setLoading(false);
      })
      .catch(e => { setLoadError(e.message); setLoading(false); });
  }

  useEffect(() => { load(selectedBatchId || undefined); }, [selectedBatchId]);

  useEffect(() => {
    api.getBatches()
      .then(d => setBatches((d ?? []).filter(b => b.status !== 'closed')))
      .catch(() => {});
  }, []);

  function handleAssigned(assignmentId, tag) {
    setCompletedCount(c => c + 1);
    // Auto-advance: focus the next input that isn't done
    const allIds = rows.flatMap(r => r.placements.map(p => p.assignment_id));
    const idx = allIds.indexOf(assignmentId);
    for (let i = idx + 1; i < allIds.length; i++) {
      const el = inputRefs.current[allIds[i]];
      if (el && !el.disabled) { el.focus(); break; }
    }
  }

  const totalPlacements = rows.reduce((sum, r) => sum + r.placements.length, 0);
  const allDone = totalPlacements > 0 && completedCount === totalPlacements;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <button
        onClick={() => navigate(-1)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        METRC Tag Assignment
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Tags auto-submit when 24 characters are entered. Conflicts show a Reassign option.
      </p>

      {/* Batch selector */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Batch</label>
        <select
          value={selectedBatchId}
          onChange={e => setSelectedBatchId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300"
          style={{ minHeight: '52px' }}
        >
          <option value="">All batches</option>
          {batches.map(b => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.strain_name} — {b.sub_zone_id ?? '(no sub-zone)'} ({b.status?.replace(/-/g, ' ')})
            </option>
          ))}
        </select>
      </div>

      {/* Progress */}
      {!loading && totalPlacements > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Progress</span>
            <span className={`text-sm font-bold font-mono ${allDone ? 'text-green-700' : 'text-gray-800'}`}>
              {completedCount} / {totalPlacements} tagged
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-green-600'}`}
              style={{ width: `${(completedCount / totalPlacements) * 100}%` }}
            />
          </div>
          {allDone && (
            <div className="text-sm text-green-700 font-semibold mt-2 text-center">
              All placements tagged!
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="text-gray-500 text-sm py-4">Loading untagged placements…</div>
      )}

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {loadError}
          <button
            onClick={() => load(selectedBatchId || undefined)}
            className="ml-2 underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && totalPlacements === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-6 text-center">
          <div className="text-3xl mb-2">✓</div>
          <div className="text-sm font-semibold text-green-800">
            {selectedBatchId ? 'All placements in this batch are tagged.' : 'No untagged placements found.'}
          </div>
        </div>
      )}

      {/* Row groups */}
      {rows.map(row => (
        <div key={row.row_id} className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-xs font-bold bg-green-800 text-white px-3 py-1.5 rounded-full">
              {row.row_id}
            </span>
            <span className="text-xs text-gray-500">{row.placements.length} untagged</span>
          </div>
          {row.placements.map(p => (
            <PlacementRow
              key={p.assignment_id}
              placement={p}
              inputRefs={inputRefs}
              onAssigned={handleAssigned}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
