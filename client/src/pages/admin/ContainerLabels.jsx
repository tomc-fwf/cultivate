import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../../api';

const SUB_ZONES = ['Z1A','Z1B','Z2A','Z2B','Z3A','Z3B','Z4A','Z4B'];

const ZONE_COLORS = {
  Z1: '#2d6a2d', // green
  Z2: '#1a4a7a', // blue
  Z3: '#c06010', // orange
  Z4: '#5a1a7a', // purple
};

function zoneColor(containerId) {
  const m = containerId.match(/^(Z\d)/);
  return ZONE_COLORS[m?.[1]] ?? '#333';
}

async function generatePrintWindow(containers) {
  // Generate all QR codes as data URLs
  const qrDataUrls = await Promise.all(
    containers.map(c =>
      QRCode.toDataURL(c.container_id, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 200,
        color: { dark: '#000000', light: '#ffffff' },
      })
    )
  );

  const labels = containers.map((c, i) => {
    const color = zoneColor(c.container_id);
    return `
      <div class="label">
        <div class="stripe" style="background:${color}"></div>
        <div class="qr-wrap">
          <img src="${qrDataUrls[i]}" alt="${c.container_id}" />
        </div>
        <div class="id-text">${c.container_id}</div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Container QR Labels</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600&display=swap');
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'JetBrains Mono', monospace; background: white; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .label {
    width: 2.625in;
    height: 1in;
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px 4px 0;
    page-break-inside: avoid;
  }
  .stripe {
    width: 8px;
    height: 100%;
    flex-shrink: 0;
  }
  .qr-wrap {
    flex-shrink: 0;
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr-wrap img {
    width: 72px;
    height: 72px;
    display: block;
  }
  .id-text {
    font-size: 11px;
    font-weight: 600;
    color: #111;
    line-height: 1.3;
    word-break: break-all;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="grid">${labels}</div>
<script>window.addEventListener('load', () => window.print());<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print labels.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

export default function ContainerLabels() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all'); // 'all' | sub_zone id | 'custom'
  const [customId, setCustomId] = useState('');
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filter !== 'all' && filter !== 'custom') params.sub_zone_id = filter;
        const data = await api.getContainers(params);
        let list = Array.isArray(data) ? data : (data.containers ?? []);
        if (filter === 'custom' && customId.trim()) {
          const search = customId.trim().toUpperCase();
          list = list.filter(c => c.container_id.includes(search));
        }
        setContainers(list);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter, customId]);

  async function handlePrint() {
    if (containers.length === 0) return;
    setGenerating(true);
    try {
      await generatePrintWindow(containers);
    } finally {
      setGenerating(false);
    }
  }

  const pageCount = Math.ceil(containers.length / 30);

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-800 text-sm">← Back</button>
        <h1 className="text-xl font-bold text-gray-900">Container QR Label Printing</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Filter Containers</label>
        <select
          value={filter}
          onChange={e => { setFilter(e.target.value); setCustomId(''); }}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-base mb-3"
        >
          <option value="all">All Containers (1,180)</option>
          {SUB_ZONES.map(sz => (
            <option key={sz} value={sz}>{sz}</option>
          ))}
          <option value="custom">Search by Container ID</option>
        </select>

        {filter === 'custom' && (
          <input
            type="text"
            value={customId}
            onChange={e => setCustomId(e.target.value)}
            placeholder="e.g. Z1-A-R3 or Z1-A-R3-C12"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-base font-mono uppercase mb-3"
            autoCapitalize="characters"
            autoCorrect="off"
          />
        )}

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="bg-gray-50 rounded-xl p-3 mb-4">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading containers…</p>
          ) : (
            <>
              <p className="text-gray-900 font-semibold text-base">{containers.length} labels</p>
              <p className="text-gray-500 text-sm">
                {pageCount} {pageCount === 1 ? 'page' : 'pages'} · Avery 5160 compatible (3 × 10 per page, 1" × 2.625")
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {['Z1','Z2','Z3','Z4'].map(z => {
                  const count = containers.filter(c => c.container_id.startsWith(z)).length;
                  if (!count) return null;
                  return (
                    <span
                      key={z}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs text-white font-semibold"
                      style={{ backgroundColor: ZONE_COLORS[z] }}
                    >
                      {z}: {count}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <button
          onClick={handlePrint}
          disabled={containers.length === 0 || generating || loading}
          className="w-full py-4 rounded-xl bg-green-800 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? 'Generating…' : `Print ${containers.length} Labels`}
        </button>
      </div>

      {/* Zone color legend */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Zone Color Stripes</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(ZONE_COLORS).map(([zone, color]) => (
            <div key={zone} className="flex items-center gap-3">
              <div className="w-5 h-8 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <div>
                <p className="text-sm font-semibold text-gray-900">{zone}</p>
                <p className="text-xs text-gray-500">Sub-zones {zone}A + {zone}B</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4 leading-relaxed">
          Labels use the JetBrains Mono font for container IDs. Each label encodes the container ID
          as a QR code for camera scanning. Print on weatherproof Avery 5160 label sheets.
        </p>
      </div>
    </div>
  );
}
