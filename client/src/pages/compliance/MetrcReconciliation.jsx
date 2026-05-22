import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return String(str); }
}

function SyncCounts({ counts }) {
  if (!counts) return null;
  return (
    <div className="flex gap-3 text-xs flex-wrap">
      {['pending', 'failed', 'synced', 'not_required'].map(k =>
        counts[k] > 0 ? (
          <span key={k} className={`font-semibold ${k === 'failed' ? 'text-red-600' : k === 'pending' ? 'text-amber-600' : k === 'synced' ? 'text-green-700' : 'text-gray-400'}`}>
            {counts[k]} {k.replace('_', ' ')}
          </span>
        ) : null,
      )}
      {Object.values(counts).every(v => v === 0) && (
        <span className="text-gray-400">No records</span>
      )}
    </div>
  );
}

function RecordTable({ rows, columns }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-gray-400 px-4 py-3">No records</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            {columns.map(c => (
              <th key={c.key} className="px-4 py-2 font-semibold text-gray-500">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map(c => (
                <td key={c.key} className="px-4 py-2 text-gray-700 font-mono">
                  {c.format ? c.format(r[c.key]) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, data, note, pendingCols, failedCols }) {
  const [open, setOpen] = useState(false);
  const counts = data?.counts;
  const pendingCount = counts?.pending ?? 0;
  const failedCount = counts?.failed ?? 0;
  const hasIssues = pendingCount > 0 || failedCount > 0;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
        style={{ minHeight: '56px' }}
      >
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-800">{title}</div>
          {counts ? (
            <SyncCounts counts={counts} />
          ) : note ? (
            <span className="text-xs text-gray-400">{note}</span>
          ) : null}
        </div>
        {hasIssues && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${failedCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {failedCount > 0 ? `${failedCount} failed` : `${pendingCount} pending`}
          </span>
        )}
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50">
          {note && (
            <p className="px-4 py-2 text-xs text-gray-500 italic">{note}</p>
          )}
          {data?.pending?.length > 0 && (
            <div className="mb-2">
              <div className="px-4 py-1.5 text-xs font-bold text-amber-700 uppercase tracking-wide">
                Pending ({data.pending.length})
              </div>
              <RecordTable rows={data.pending} columns={pendingCols ?? [{ key: 'id', label: 'ID' }]} />
            </div>
          )}
          {data?.failed?.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-xs font-bold text-red-700 uppercase tracking-wide">
                Failed ({data.failed.length})
              </div>
              <RecordTable rows={data.failed} columns={failedCols ?? pendingCols ?? [{ key: 'id', label: 'ID' }]} />
            </div>
          )}
          {(!data?.pending?.length && !data?.failed?.length) && (
            <p className="px-4 py-3 text-xs text-gray-400">No pending or failed records.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MetrcReconciliation() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getMetrcReconciliation()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const { summary, by_type } = data ?? {};

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/compliance')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Compliance
      </button>

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            METRC Reconciliation
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Sync status across all event types</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
      )}

      {summary && (
        <>
          {/* Summary bar */}
          <div className={`rounded-2xl px-5 py-4 mb-5 ${summary.total_failed > 0 ? 'bg-red-700' : summary.total_pending > 0 ? 'bg-amber-600' : 'bg-green-800'} text-white`}>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="text-2xl font-bold">{summary.total_pending}</div>
                <div className="text-xs text-white/80">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.total_failed}</div>
                <div className="text-xs text-white/80">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.batches_missing_metrc_uid}</div>
                <div className="text-xs text-white/80">Batches missing UID</div>
              </div>
              {summary.oldest_pending_record && (
                <div className="ml-auto text-right">
                  <div className="text-xs text-white/80">Oldest pending</div>
                  <div className="text-sm font-semibold">{formatDate(summary.oldest_pending_record)}</div>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Generated: {new Date(data.generated_at).toLocaleString('en-US')}
          </p>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">

            {/* Plant batches */}
            <div className="border-b border-gray-100 px-4 py-3.5">
              <div className="font-semibold text-sm text-gray-800 mb-1">Plant Batches</div>
              {by_type?.plant_batches?.missing_uid > 0 ? (
                <span className="text-xs text-amber-600 font-semibold">
                  {by_type.plant_batches.missing_uid} active batch{by_type.plant_batches.missing_uid !== 1 ? 'es' : ''} missing METRC UID
                </span>
              ) : (
                <span className="text-xs text-green-700 font-semibold">All active batches have METRC UIDs</span>
              )}
              {by_type?.plant_batches?.note && (
                <p className="text-xs text-gray-400 mt-0.5 italic">{by_type.plant_batches.note}</p>
              )}
            </div>

            <Section
              title="Phase History"
              data={by_type?.phase_history}
              pendingCols={[
                { key: 'id', label: 'ID' },
                { key: 'batch_id', label: 'Batch' },
                { key: 'to_status', label: 'To Status' },
                { key: 'transitioned_at', label: 'Date', format: formatDate },
              ]}
            />

            <Section
              title="Location History"
              data={by_type?.location_history}
              pendingCols={[
                { key: 'id', label: 'ID' },
                { key: 'batch_id', label: 'Batch' },
                { key: 'to_location_id', label: 'To Location' },
                { key: 'moved_at', label: 'Date', format: formatDate },
              ]}
            />

            <Section
              title="Harvest Events"
              data={by_type?.harvest_events}
              pendingCols={[
                { key: 'id', label: 'ID' },
                { key: 'batch_id', label: 'Batch' },
                { key: 'event_type', label: 'Type' },
                { key: 'wet_weight', label: 'Weight' },
                { key: 'weight_unit', label: 'Unit' },
                { key: 'harvested_at', label: 'Date', format: formatDate },
              ]}
            />

            <Section
              title="Waste Trim Events"
              data={by_type?.waste_trim}
              pendingCols={[
                { key: 'id', label: 'ID' },
                { key: 'batch_id', label: 'Batch' },
                { key: 'trim_reason', label: 'Reason' },
                { key: 'wet_weight', label: 'Weight' },
                { key: 'waste_status', label: 'Status' },
                { key: 'trimmed_at', label: 'Date', format: formatDate },
              ]}
            />

            <Section
              title="Plant Loss Events"
              data={by_type?.plant_loss}
              pendingCols={[
                { key: 'id', label: 'ID' },
                { key: 'batch_id', label: 'Batch' },
                { key: 'loss_type', label: 'Type' },
                { key: 'plant_count', label: 'Count' },
                { key: 'occurred_at', label: 'Date', format: formatDate },
              ]}
            />

            <div className="px-4 py-3.5">
              <div className="font-semibold text-sm text-gray-800 mb-1">Additive Applications</div>
              {by_type?.additive_applications?.note && (
                <p className="text-xs text-gray-500 italic">{by_type.additive_applications.note}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
