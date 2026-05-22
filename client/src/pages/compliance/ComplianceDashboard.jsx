import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

// VPD optimal ranges by batch stage (kPa)
const VPD_RANGES = {
  'germ':           { low: 0.4, high: 0.8 },
  'seedling':       { low: 0.4, high: 0.8 },
  'cult-hoop':      { low: 0.6, high: 1.0 },
  'field-veg':      { low: 0.8, high: 1.2 },
  'field-flower':   { low: 1.0, high: 1.5 },
  'flush':          { low: 1.0, high: 2.0 },
  'harvest_window': { low: 1.0, high: 2.0 },
  'harvesting':     { low: 1.0, high: 2.0 },
};

function StatusDot({ status }) {
  const colors = { green: 'bg-green-500', amber: 'bg-amber-400', red: 'bg-red-500' };
  return <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${colors[status] ?? 'bg-gray-400'}`} />;
}

function StatusBadge({ status }) {
  const styles = {
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red:   'bg-red-50 text-red-800 border-red-200',
  };
  const labels = { green: 'GREEN', amber: 'AMBER', red: 'RED' };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${styles[status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {labels[status] ?? status?.toUpperCase()}
    </span>
  );
}

function formatRelative(isoStr) {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatExpiry(isoStr) {
  if (!isoStr) return '—';
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function Panel({ title, panel, children, action, onAction }) {
  if (!panel) return null;
  const borderColors = { green: 'border-green-200', amber: 'border-amber-300', red: 'border-red-300' };
  const bgColors = { green: 'bg-green-50', amber: 'bg-amber-50', red: 'bg-red-50' };
  const status = panel.status;

  return (
    <div className={`rounded-2xl border-2 ${borderColors[status] ?? 'border-gray-200'} overflow-hidden`}>
      <div className={`${bgColors[status] ?? 'bg-gray-50'} px-4 py-3 flex items-center gap-2`}>
        <StatusDot status={status} />
        <span className="font-bold text-sm text-gray-800">{title}</span>
        <span className="ml-auto font-mono text-sm font-bold text-gray-700">
          {panel.count ?? 0}
        </span>
      </div>
      {children && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 text-xs text-gray-600">
          {children}
        </div>
      )}
      {action && (
        <button
          onClick={onAction}
          className="w-full px-4 py-2.5 text-xs font-semibold text-gray-600 border-t border-gray-100 bg-white hover:bg-gray-50 text-left flex items-center justify-between transition-colors"
          style={{ minHeight: '44px' }}
        >
          <span>{action}</span>
          <span>→</span>
        </button>
      )}
    </div>
  );
}

export default function ComplianceDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [envAlerts, setEnvAlerts] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.getComplianceDashboard(),
      api.getCurrentConditions().catch(() => []),
      api.getBatches({ status: 'active', limit: '20' }).catch(() => []),
    ]).then(([dashboard, conditions, batches]) => {
      setData(dashboard);
      setLastRefresh(new Date());
      setLoading(false);

      // Build sub_zone → batch stage map
      const stageByZone = {};
      for (const b of (Array.isArray(batches) ? batches : [])) {
        if (b.sub_zone_id) stageByZone[b.sub_zone_id] = b.status;
      }

      // Compute environmental alerts
      const alerts = [];
      const readings = Array.isArray(conditions) ? conditions : [];
      for (const r of readings) {
        const lbl = r.label ?? r.sub_zone_id ?? r.location_name ?? r.sensor_id;
        const ageSec = r.age_seconds;
        // Offline: no reading in 30+ min
        if (ageSec == null || ageSec > 1800) {
          const hoursAgo = ageSec != null ? Math.round(ageSec / 3600) : null;
          alerts.push({
            level: 'amber',
            message: `Sensor offline: ${lbl}${hoursAgo != null ? ` — last seen ${hoursAgo}h ago` : ''}`,
          });
          continue;
        }
        // VPD out of range
        if (r.vpd_kpa != null && r.sub_zone_id) {
          const stage = stageByZone[r.sub_zone_id];
          const range = stage ? VPD_RANGES[stage] : null;
          if (range) {
            const margin = (range.high - range.low) * 0.2;
            if (r.vpd_kpa < range.low - margin || r.vpd_kpa > range.high + margin) {
              const dir = r.vpd_kpa < range.low ? 'low' : 'high';
              const stageLabel = stage.replace(/-/g, ' ').replace(/_/g, ' ');
              alerts.push({
                level: r.vpd_kpa > range.high + margin ? 'red' : 'amber',
                message: `VPD alert: ${r.sub_zone_id} ${r.vpd_kpa.toFixed(2)} kPa (${dir} for ${stageLabel})`,
              });
            }
          }
        }
        // Low battery (< 20%)
        if (r.battery_pct != null && r.battery_pct < 20) {
          alerts.push({ level: 'amber', message: `Low battery: ${lbl} (${r.battery_pct}%)` });
        }
      }
      setEnvAlerts(alerts);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const { panels } = data ?? {};

  const overallBg = {
    green: 'bg-green-800',
    amber: 'bg-amber-600',
    red:   'bg-red-700',
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>

      {/* Header */}
      <div className={`${overallBg[data?.status] ?? 'bg-gray-700'} text-white rounded-2xl px-5 py-4 mb-5`}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold" style={{ fontFamily: 'Fraunces, serif' }}>
            OCM Compliance Status
          </h1>
          {data?.status && <StatusBadge status={data.status} />}
        </div>
        <div className="flex items-center gap-3 text-sm text-white/80">
          <span>
            {lastRefresh ? `Updated ${formatRelative(lastRefresh.toISOString())}` : 'Loading…'}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="text-white/80 hover:text-white text-xs font-semibold underline transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={() => window.print()}
            className="text-white/80 hover:text-white text-xs font-semibold underline transition-colors ml-auto"
          >
            Print Checklist
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {loading && !data && (
        <div className="text-center text-gray-400 py-12 text-sm">Loading compliance status…</div>
      )}

      {panels && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">

            {/* Active REIs */}
            <Panel
              title="Active REIs"
              panel={panels.active_reis}
              action="REI Dashboard →"
              onAction={() => navigate('/rei')}
            >
              {panels.active_reis.count === 0 ? (
                <span className="text-green-700 font-semibold">No active re-entry intervals</span>
              ) : (
                <ul className="space-y-1">
                  {(panels.active_reis.items ?? []).slice(0, 3).map(item => (
                    <li key={item.pesticide_app_id} className="flex items-center justify-between">
                      <span className="text-gray-700 font-mono">{item.container_id ?? item.row_id ?? item.sub_zone_id ?? '—'}</span>
                      <span className="text-red-600 font-semibold ml-2">expires in {formatExpiry(item.rei_expires_at)}</span>
                    </li>
                  ))}
                  {panels.active_reis.count > 3 && (
                    <li className="text-gray-400">…and {panels.active_reis.count - 3} more</li>
                  )}
                </ul>
              )}
            </Panel>

            {/* PHI Watch */}
            <Panel
              title="PHI Watch"
              panel={panels.phi_watch}
              action="View PHI details →"
              onAction={() => navigate('/compliance/plant-inventory')}
            >
              {panels.phi_watch.count === 0 ? (
                <span className="text-green-700 font-semibold">No PHI concerns on harvest-stage batches</span>
              ) : (
                <ul className="space-y-1">
                  {(panels.phi_watch.items ?? []).slice(0, 3).map(item => (
                    <li key={item.pesticide_app_id} className="flex items-center justify-between">
                      <span className="text-gray-700">{item.strain_name ?? '—'} ({item.sub_zone_id ?? '—'})</span>
                      <span className="ml-2 font-semibold capitalize text-amber-700">{item.status}</span>
                    </li>
                  ))}
                  {panels.phi_watch.count > 3 && (
                    <li className="text-gray-400">…and {panels.phi_watch.count - 3} more</li>
                  )}
                </ul>
              )}
            </Panel>

            {/* METRC Pending */}
            <Panel
              title="METRC Pending"
              panel={panels.metrc_pending}
              action="METRC Reconciliation →"
              onAction={() => navigate('/compliance/metrc-reconciliation')}
            >
              {panels.metrc_pending.count === 0 ? (
                <span className="text-green-700 font-semibold">All synced</span>
              ) : (
                <ul className="space-y-0.5">
                  {Object.entries(panels.metrc_pending.by_type ?? {}).map(([type, count]) =>
                    count > 0 ? (
                      <li key={type} className="flex justify-between">
                        <span className="text-gray-600 capitalize">{type.replace(/_/g, ' ')}</span>
                        <span className="font-semibold text-amber-700">{count}</span>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
            </Panel>

            {/* METRC Failed */}
            <Panel
              title="METRC Failed"
              panel={panels.metrc_failed}
              action="METRC Reconciliation →"
              onAction={() => navigate('/compliance/metrc-reconciliation')}
            >
              {panels.metrc_failed.count === 0 ? (
                <span className="text-green-700 font-semibold">No failed syncs</span>
              ) : (
                <div className="text-red-700 font-semibold">
                  {panels.metrc_failed.count} failed — manual investigation required
                </div>
              )}
            </Panel>

            {/* Untagged Plants */}
            <Panel
              title="Untagged Plants"
              panel={panels.untagged_plants}
              action="Tag Verification →"
              onAction={() => navigate('/compliance/tag-verification')}
            >
              {panels.untagged_plants.count === 0 ? (
                <span className="text-green-700 font-semibold">All active plants are METRC-tagged</span>
              ) : (
                <ul className="space-y-0.5">
                  {(panels.untagged_plants.items ?? []).slice(0, 4).map(item => (
                    <li key={item.assignment_id} className="font-mono text-gray-700">
                      {item.container_id} <span className="text-gray-400 text-xs">({item.sub_zone_id})</span>
                    </li>
                  ))}
                  {panels.untagged_plants.count > 4 && (
                    <li className="text-gray-400">…and {panels.untagged_plants.count - 4} more</li>
                  )}
                </ul>
              )}
            </Panel>

            {/* Batches without METRC UID */}
            <Panel
              title="Missing METRC Batch UIDs"
              panel={panels.batches_no_metrc_uid}
              action="Plant Inventory →"
              onAction={() => navigate('/compliance/plant-inventory')}
            >
              {panels.batches_no_metrc_uid.count === 0 ? (
                <span className="text-green-700 font-semibold">All active batches have METRC UIDs</span>
              ) : (
                <ul className="space-y-0.5">
                  {(panels.batches_no_metrc_uid.items ?? []).map(item => (
                    <li key={item.batch_id} className="flex justify-between text-gray-700">
                      <span>{item.strain_name ?? `Batch ${item.batch_id}`}</span>
                      <span className="text-gray-500 capitalize">{item.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Plant Losses Unsynced */}
            <Panel
              title="Plant Losses Unsynced"
              panel={panels.plant_losses_unsynced}
              action="METRC Reconciliation →"
              onAction={() => navigate('/compliance/metrc-reconciliation')}
            >
              {panels.plant_losses_unsynced.count === 0 ? (
                <span className="text-green-700 font-semibold">All losses reported to METRC</span>
              ) : (
                <span className="text-amber-700 font-semibold">
                  {panels.plant_losses_unsynced.count} loss event{panels.plant_losses_unsynced.count !== 1 ? 's' : ''} pending METRC entry
                </span>
              )}
            </Panel>

            {/* Waste Pending Disposal */}
            <Panel
              title="Waste Pending Disposal"
              panel={panels.waste_pending_disposal}
              action="View waste trim →"
              onAction={() => navigate('/harvest/waste-trim/new')}
            >
              {panels.waste_pending_disposal.count === 0 ? (
                <span className="text-green-700 font-semibold">No waste pending disposal</span>
              ) : (
                <span className="text-amber-700 font-semibold">
                  {panels.waste_pending_disposal.count} event{panels.waste_pending_disposal.count !== 1 ? 's' : ''} in collected/held status
                </span>
              )}
            </Panel>
          </div>

          {/* Environmental Alerts */}
          <div className="mb-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Environmental Alerts</h2>
            <div className={`rounded-2xl border-2 overflow-hidden ${envAlerts.length === 0 ? 'border-green-200' : envAlerts.some(a => a.level === 'red') ? 'border-red-300' : 'border-amber-300'}`}>
              <div className={`px-4 py-3 flex items-center gap-2 ${envAlerts.length === 0 ? 'bg-green-50' : envAlerts.some(a => a.level === 'red') ? 'bg-red-50' : 'bg-amber-50'}`}>
                <StatusDot status={envAlerts.length === 0 ? 'green' : envAlerts.some(a => a.level === 'red') ? 'red' : 'amber'} />
                <span className="font-bold text-sm text-gray-800">Environmental</span>
                <span className="ml-auto font-mono text-sm font-bold text-gray-700">{envAlerts.length}</span>
              </div>
              <div className="px-4 py-3 bg-white border-t border-gray-100 text-xs text-gray-600">
                {envAlerts.length === 0 ? (
                  <span className="text-green-700 font-semibold">All sensors reporting — no VPD or battery alerts</span>
                ) : (
                  <ul className="space-y-1.5">
                    {envAlerts.map((a, i) => (
                      <li key={i} className={`flex items-start gap-2 ${a.level === 'red' ? 'text-red-700' : 'text-amber-700'}`}>
                        <span className="flex-shrink-0 mt-0.5">{a.level === 'red' ? '🔴' : '🟡'}</span>
                        <span>{a.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => navigate('/admin/sensors')}
                className="w-full px-4 py-2.5 text-xs font-semibold text-gray-600 border-t border-gray-100 bg-white hover:bg-gray-50 text-left flex items-center justify-between transition-colors"
                style={{ minHeight: '44px' }}
              >
                <span>Sensor Management →</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Compliance Reports</h2>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {[
              { label: 'Plant Inventory', sub: 'All active batches · inspector handoff', href: '/compliance/plant-inventory' },
              { label: 'Tag Verification', sub: 'Container-to-METRC-tag walkthrough sheet', href: '/compliance/tag-verification' },
              { label: 'METRC Reconciliation', sub: 'Sync status across all event types', href: '/compliance/metrc-reconciliation' },
              { label: 'METRC Record Additives', sub: 'All four application types · JSON / CSV', href: '/exports/metrc' },
              { label: 'MDA Pesticide Report', sub: 'MN Statute 18B.37 format', href: '/exports/mda-pesticide' },
              { label: 'Cultivation Record', sub: 'Full per-batch audit record · MN 342.25', href: '/exports/cultivation-record' },
            ].map(link => (
              <button
                key={link.href}
                onClick={() => navigate(link.href)}
                className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
                style={{ minHeight: '56px' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{link.label}</div>
                  <div className="text-xs text-gray-500">{link.sub}</div>
                </div>
                <span className="text-gray-400 flex-shrink-0">→</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
