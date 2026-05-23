import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const d = s.includes('T') ? new Date(s) : new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDT(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/Chicago',
  });
}

function buildPrintHtml(record) {
  const batch = record.data?.batch ?? {};
  const apps = record.data?.applications ?? {};
  const fertigation = apps.fertigation ?? [];
  const foliar = apps.foliar ?? [];
  const pesticide = apps.pesticide ?? [];
  const amendments = apps.amendments ?? [];
  const observations = record.data?.observations ?? [];
  const harvestEvents = record.data?.harvest?.harvest_events ?? [];
  const wasteTrimEvents = record.data?.harvest?.waste_trim_events ?? [];

  function section(title, items, thead, rowFn) {
    const count = items.length;
    const badge = `<span class="count">${count}</span>`;
    if (count === 0) {
      return `<div class="section"><h2>${esc(title)} ${badge}</h2><p class="empty">No records.</p></div>`;
    }
    const rows = items.map(rowFn).join('');
    return `<div class="section">
      <h2>${esc(title)} ${badge}</h2>
      <table><thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  function th(label) { return `<th>${esc(label)}</th>`; }
  function td(val, mono) {
    const cls = mono ? ' class="mono"' : '';
    return `<td${cls}>${val == null ? '—' : esc(String(val))}</td>`;
  }
  function tdRaw(html) { return `<td>${html}</td>`; }

  const fertigSection = section(
    'Fertigation Applications', fertigation,
    [th('Date / Time'), th('Recipe'), th('EC'), th('pH'), th('Volume'), th('Applicator')].join(''),
    (a) => {
      const ings = (a.ingredients ?? []).map(ing =>
        `<span class="ing-chip">${esc(ing.rate_value)} ${esc(ing.rate_unit)} · input #${esc(ing.input_id)}</span>`
      ).join('');
      const ingRow = ings
        ? `<tr class="ing-row"><td colspan="6"><span class="ing-lbl">Ingredients:</span>${ings}</td></tr>`
        : '';
      return `<tr>
        ${td(fmtDT(a.applied_at), true)}
        ${tdRaw(`${esc(a.recipe_name ?? '—')} <span class="ver">v${esc(a.recipe_version ?? '')}</span>`)}
        ${td(a.ec_measured != null ? a.ec_measured : null, true)}
        ${td(a.ph_measured != null ? a.ph_measured : null, true)}
        ${td(a.volume_gallons != null ? `${a.volume_gallons} gal` : null, true)}
        ${td(a.applicator_name, false)}
      </tr>${ingRow}`;
    }
  );

  const foliarSection = section(
    'Foliar Applications', foliar,
    [th('Date / Time'), th('Product / Recipe'), th('Rate'), th('Purpose'), th('Applicator')].join(''),
    (a) => `<tr>
      ${td(fmtDT(a.applied_at), true)}
      ${td(a.product_name_snapshot ?? a.recipe_name, false)}
      ${td(a.rate_value != null ? `${a.rate_value} ${a.rate_unit ?? ''}` : null, true)}
      ${td(a.purpose, false)}
      ${td(a.applicator_name, false)}
    </tr>`
  );

  const pesticideSection = section(
    'Pesticide Applications', pesticide,
    [th('Date / Time'), th('Product'), th('EPA Reg #'), th('Lot'), th('Rate'), th('Target Pest'), th('Temp'), th('Wind'), th('REI Expires'), th('PHI ✓'), th('Applicator')].join(''),
    (a) => `<tr>
      ${td(fmtDT(a.applied_at), true)}
      ${td(a.product_name_snapshot, false)}
      ${td(a.epa_reg_no_snapshot, true)}
      ${td(a.input_lot_id, true)}
      ${td(a.rate_value != null ? `${a.rate_value} ${a.rate_unit ?? ''}` : null, true)}
      ${td(a.target_pest, false)}
      ${td(a.ambient_temp_f != null ? `${a.ambient_temp_f}°F` : null, true)}
      ${td(a.wind_speed_mph != null ? `${a.wind_speed_mph} mph` : null, true)}
      ${td(a.rei_expires_at ? fmtDT(a.rei_expires_at) : null, true)}
      ${td(a.phi_compliant === 1 ? 'Yes' : a.phi_compliant === 0 ? 'No' : null, false)}
      ${td(a.applicator_name, false)}
    </tr>`
  );

  const amendSection = section(
    'Container Amendments', amendments,
    [th('Date / Time'), th('Container'), th('Product / Type'), th('Quantity'), th('Purpose'), th('Applicator')].join(''),
    (a) => `<tr>
      ${td(fmtDT(a.applied_at), true)}
      ${td(a.container_id, true)}
      ${td(a.product_name_snapshot ?? a.amendment_type, false)}
      ${td(a.quantity != null ? `${a.quantity} ${a.quantity_unit ?? ''}` : null, true)}
      ${td(a.purpose, false)}
      ${td(a.applicator_name, false)}
    </tr>`
  );

  const obsSection = section(
    'Observations', observations,
    [th('Date / Time'), th('Location'), th('Category'), th('Severity'), th('Note'), th('Observer')].join(''),
    (o) => `<tr>
      ${td(fmtDT(o.observed_at), true)}
      ${td(o.container_id ?? o.row_id, true)}
      ${td(o.category, false)}
      ${td(o.severity, false)}
      ${td(o.note, false)}
      ${td(o.observer_name, false)}
    </tr>`
  );

  const harvestSection = section(
    'Harvest Events', harvestEvents,
    [th('Date / Time'), th('Type'), th('Container'), th('Product Type'), th('Wet Weight'), th('Applicator')].join(''),
    (h) => `<tr>
      ${td(fmtDT(h.harvested_at), true)}
      ${td(h.event_type, false)}
      ${td(h.container_id, true)}
      ${td(h.product_type, false)}
      ${td(h.wet_weight != null ? `${h.wet_weight} ${h.weight_unit ?? ''}` : null, true)}
      ${td(h.applicator_name, false)}
    </tr>`
  );

  const wasteSection = section(
    'Waste Trim Events', wasteTrimEvents,
    [th('Date / Time'), th('Location'), th('Reason'), th('Wet Weight'), th('Status'), th('Applicator')].join(''),
    (w) => `<tr>
      ${td(fmtDT(w.trimmed_at), true)}
      ${td(w.container_id ?? w.row_id, true)}
      ${td(w.trim_reason, false)}
      ${td(w.wet_weight != null ? `${w.wet_weight} ${w.weight_unit ?? ''}` : null, true)}
      ${td(w.waste_status, false)}
      ${td(w.applicator_name, false)}
    </tr>`
  );

  const exportTs = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/Chicago',
  });

  const batchName = esc(batch.metrc_batch_name ?? `Batch #${record.batch_id}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Cultivation Record — ${batchName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
<style>
@page { size: letter; margin: 0.75in; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #faf6ed; color: #1f3320; font-family: Fraunces, serif; font-size: 11px; line-height: 1.5; }
.doc-header { border-bottom: 3px solid #a04727; padding-bottom: 14px; margin-bottom: 22px; }
.doc-header h1 { font-size: 26px; font-weight: 700; }
.doc-header .sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #a04727; margin-top: 3px; }
.meta { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 14px;
  background: #1f3320; border-radius: 6px; padding: 12px 16px; color: #faf6ed; }
.meta-item .lbl { font-size: 8px; letter-spacing: .08em; text-transform: uppercase; opacity: .65; }
.meta-item .val { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; margin-top: 2px; word-break: break-all; }
.section { margin-bottom: 24px; }
.section h2 { font-size: 14px; font-weight: 700; border-bottom: 2px solid #a04727; padding-bottom: 4px; margin-bottom: 8px; }
.count { font-family: 'JetBrains Mono', monospace; font-size: 10px; background: #a04727; color: #faf6ed;
  border-radius: 3px; padding: 1px 5px; font-weight: 600; margin-left: 5px; }
.empty { color: #a08070; font-style: italic; font-size: 10px; padding: 2px 0; }
table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
th { text-align: left; padding: 4px 6px; font-size: 8.5px; text-transform: uppercase;
  letter-spacing: .06em; color: #a04727; border-bottom: 1px solid #c9b99a; font-weight: 700; }
td { padding: 5px 6px; border-bottom: 1px solid #e5dcc8; vertical-align: top; }
tr:last-child td { border-bottom: none; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; }
.ver { font-family: 'JetBrains Mono', monospace; font-size: 8px; opacity: .65; }
.ing-row td { background: #f0ece2; padding: 2px 6px 5px 20px; font-size: 8.5px; color: #5a4a3a; }
.ing-lbl { font-weight: 700; margin-right: 6px; }
.ing-chip { display: inline-block; background: #c9b99a; border-radius: 2px; padding: 1px 4px;
  margin-right: 3px; font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #1f3320; }
.doc-footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #c9b99a;
  font-size: 8.5px; color: #a04727; display: flex; justify-content: space-between; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .section { page-break-inside: auto; }
  .section h2 { page-break-after: avoid; }
  tr { page-break-inside: avoid; }
}
</style>
</head>
<body>

<div class="doc-header">
  <h1>Cultivation Record</h1>
  <div class="sub">MN Statute 342.25 &mdash; ${batchName}</div>
  <div class="meta">
    <div class="meta-item"><div class="lbl">Batch / METRC Name</div><div class="val">${batchName}</div></div>
    <div class="meta-item"><div class="lbl">Strain</div><div class="val">${esc(batch.strain_name ?? '—')}</div></div>
    <div class="meta-item"><div class="lbl">Sub-Zone</div><div class="val">${esc(batch.sub_zone_id ?? '—')}</div></div>
    <div class="meta-item"><div class="lbl">Sow Date</div><div class="val">${esc(fmtDate(batch.sow_date))}</div></div>
    <div class="meta-item"><div class="lbl">METRC Plant Batch UID</div><div class="val">${esc(batch.metrc_plant_batch_uid ?? 'Not assigned')}</div></div>
    <div class="meta-item"><div class="lbl">Plant Count</div><div class="val">${batch.plant_count_current ?? batch.plant_count_initial ?? '—'}</div></div>
  </div>
</div>

${fertigSection}
${foliarSection}
${pesticideSection}
${amendSection}
${obsSection}
${harvestSection}
${wasteSection}

<div class="doc-footer">
  <span>Cultivate &middot; Fairwater Farm &middot; MN Statute 342.25 cultivation record</span>
  <span>Exported ${esc(exportTs)} CT</span>
</div>

<script>window.addEventListener('load', () => window.print());<\/script>
</body>
</html>`;
}

function openPrintWindow(record) {
  const html = buildPrintHtml(record);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

export default function CultivationRecord() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getBatches({ status: 'all' })
      .then(data => setBatches(data))
      .catch(() => {});
  }, []);

  const load = () => {
    if (!selectedBatchId) { setError('Select a batch first.'); return; }
    setLoading(true);
    setError('');
    api.getCultivationRecord(selectedBatchId)
      .then(data => { setRecord(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  const downloadJson = () => {
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const batchName = record.data?.batch?.metrc_batch_name ?? `batch-${record.batch_id}`;
    a.download = `cultivation-record-${batchName.replace(/[^a-zA-Z0-9-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = record?.data ? {
    fertigation: record.data.applications?.fertigation?.length ?? 0,
    foliar: record.data.applications?.foliar?.length ?? 0,
    pesticide: record.data.applications?.pesticide?.length ?? 0,
    amendments: record.data.applications?.amendments?.length ?? 0,
    observations: record.data.observations?.length ?? 0,
    harvests: record.data.harvest?.harvest_events?.length ?? 0,
    wasteTrim: record.data.harvest?.waste_trim_events?.length ?? 0,
    plantAssignments: record.data.plant_assignments?.length ?? 0,
    plantLosses: record.data.plant_losses?.length ?? 0,
  } : null;

  const batch = record?.data?.batch;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <button onClick={() => navigate('/applications')} className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        ← Applications
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        Cultivation Record
      </h1>
      <p className="text-sm text-gray-500 mb-5">Full per-batch compliance record · MN Statute 342.25</p>

      {/* Batch picker */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Select Batch</label>
        <select
          value={selectedBatchId}
          onChange={e => { setSelectedBatchId(e.target.value); setRecord(null); setError(''); }}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3"
          style={{ minHeight: '44px' }}
        >
          <option value="">— choose a batch —</option>
          {batches.map(b => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.metrc_batch_name ?? `Batch #${b.batch_id}`} — {b.strain_name} ({b.status})
            </option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={loading || !selectedBatchId}
          className="w-full bg-green-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          style={{ minHeight: '44px' }}
        >
          {loading ? 'Loading…' : 'Load Record'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {record && stats && (
        <div>
          {/* Batch header */}
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
            <div className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Batch</div>
            <div className="font-bold text-gray-900" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {batch?.metrc_batch_name ?? `Batch #${record.batch_id}`}
            </div>
            <div className="text-sm text-gray-600 mt-0.5">
              {batch?.strain_name} · {batch?.sub_zone_id ?? 'no sub-zone'} · Status: {batch?.status}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Generated {new Date(record.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} · record_version {record.record_version}
            </div>
          </div>

          {/* Statistics */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Summary</h2>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Fertigation', value: stats.fertigation, color: 'bg-blue-50 text-blue-800' },
              { label: 'Foliar', value: stats.foliar, color: 'bg-green-50 text-green-800' },
              { label: 'Pesticide', value: stats.pesticide, color: 'bg-red-50 text-red-800' },
              { label: 'Amendments', value: stats.amendments, color: 'bg-amber-50 text-amber-800' },
              { label: 'Observations', value: stats.observations, color: 'bg-purple-50 text-purple-800' },
              { label: 'Harvest Events', value: stats.harvests, color: 'bg-orange-50 text-orange-800' },
              { label: 'Waste Trim', value: stats.wasteTrim, color: 'bg-gray-100 text-gray-700' },
              { label: 'Plant Tags', value: stats.plantAssignments, color: 'bg-indigo-50 text-indigo-800' },
              { label: 'Plant Losses', value: stats.plantLosses, color: 'bg-red-50 text-red-700' },
            ].map(s => (
              <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Export actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => openPrintWindow(record)}
              className="w-full bg-green-800 text-white rounded-2xl py-3.5 text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              style={{ minHeight: '56px' }}
            >
              ⎙ Print / Save as PDF
            </button>
            <button
              onClick={downloadJson}
              className="w-full bg-gray-700 text-white rounded-2xl py-3.5 text-sm font-semibold hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
              style={{ minHeight: '56px' }}
            >
              ↓ Download JSON Record
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
