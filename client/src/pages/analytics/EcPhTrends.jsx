import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Contiguous segments where the target range is constant — drives ReferenceArea bands
function computeTargetSegments(data, lowKey, highKey) {
  if (!data.length) return [];
  const segs = [];
  let segStart = 0;
  for (let i = 1; i <= data.length; i++) {
    const prev = data[i - 1];
    const curr = i < data.length ? data[i] : null;
    const sameTarget =
      curr != null &&
      curr[lowKey] === prev[lowKey] &&
      curr[highKey] === prev[highKey];
    if (!sameTarget) {
      if (prev[lowKey] != null && prev[highKey] != null) {
        segs.push({
          x1: data[segStart].applied_at,
          x2: prev.applied_at,
          y1: Number(prev[lowKey]),
          y2: Number(prev[highKey]),
        });
      }
      segStart = i;
    }
  }
  return segs;
}

// Find where recipe name or version changes between adjacent rows
function computeRecipeChanges(data) {
  const changes = [];
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    if (curr.recipe_name !== prev.recipe_name || curr.recipe_version !== prev.recipe_version) {
      changes.push({
        x: curr.applied_at,
        label: curr.recipe_name
          ? `${curr.recipe_name} v${curr.recipe_version ?? '?'}`
          : 'No recipe',
      });
    }
  }
  return changes;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const pt = item.payload;
  const isEc = item.dataKey === 'ec_measured';
  const measured = isEc ? pt.ec_measured : pt.ph_measured;
  const low = isEc ? pt.ec_target_low : pt.ph_target_low;
  const high = isEc ? pt.ec_target_high : pt.ph_target_high;
  const mid = low != null && high != null ? (Number(low) + Number(high)) / 2 : null;
  const deviation = mid != null && measured != null ? (Number(measured) - mid) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[130px]">
      <div className="font-semibold text-gray-600 mb-1">{fmtDate(pt.applied_at)}</div>
      {measured != null && (
        <div className="text-gray-900 font-bold text-sm">
          {isEc ? 'EC' : 'pH'}: {Number(measured).toFixed(2)}
        </div>
      )}
      {low != null && high != null && (
        <div className="text-gray-500 mt-0.5">Target: {low}–{high}</div>
      )}
      {deviation != null && (
        <div className={`mt-0.5 font-medium ${deviation > 0.01 ? 'text-amber-600' : deviation < -0.01 ? 'text-blue-600' : 'text-green-600'}`}>
          {deviation > 0 ? '+' : ''}{deviation.toFixed(3)} from mid
        </div>
      )}
      {pt.recipe_name && (
        <div className="text-gray-400 mt-1 border-t border-gray-100 pt-1">{pt.recipe_name} v{pt.recipe_version}</div>
      )}
    </div>
  );
}

export default function EcPhTrends() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getBatch(batchId), api.getEcPhTrends(batchId)])
      .then(([b, rows]) => { setBatch(b); setData(rows); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-6 text-gray-500 text-sm">Loading…</div>;
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      </div>
    );
  }

  const ecSegments = computeTargetSegments(data, 'ec_target_low', 'ec_target_high');
  const phSegments = computeTargetSegments(data, 'ph_target_low', 'ph_target_high');
  const recipeChanges = computeRecipeChanges(data);
  const tickInterval = data.length <= 14 ? 0 : Math.floor(data.length / 10);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => navigate(`/batches/${batchId}`)}
        className="text-sm text-green-700 font-medium mb-4 flex items-center gap-1 hover:text-green-900"
      >
        ← {batch?.strain_name ?? 'Batch'}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
        EC / pH Trends
      </h1>
      {batch && (
        <p className="text-sm text-gray-500 mb-5">
          {batch.strain_name} · {batch.sub_zone_id ?? 'No sub-zone'} · {data.length} fertigation application{data.length !== 1 ? 's' : ''}
        </p>
      )}

      {data.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-10 text-center text-gray-500 text-sm">
          No fertigation applications logged for this batch yet.
        </div>
      ) : (
        <>
          {/* ── EC Chart ──────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">EC (mS/cm)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="applied_at"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  interval={tickInterval}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  domain={['auto', 'auto']}
                  width={38}
                />
                <Tooltip content={CustomTooltip} />

                {ecSegments.map((seg, i) => (
                  <ReferenceArea
                    key={i}
                    x1={seg.x1}
                    x2={seg.x2}
                    y1={seg.y1}
                    y2={seg.y2}
                    fill="#93c5fd"
                    fillOpacity={0.28}
                    strokeOpacity={0}
                  />
                ))}

                {recipeChanges.map((chg, i) => (
                  <ReferenceLine
                    key={i}
                    x={chg.x}
                    stroke="#9ca3af"
                    strokeDasharray="4 2"
                    label={{ value: chg.label, position: 'insideTopLeft', fontSize: 9, fill: '#6b7280', offset: 4 }}
                  />
                ))}

                <Line
                  type="monotone"
                  dataKey="ec_measured"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  name="EC"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── pH Chart ──────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">pH</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="applied_at"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  interval={tickInterval}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  domain={['auto', 'auto']}
                  width={38}
                />
                <Tooltip content={CustomTooltip} />

                {phSegments.map((seg, i) => (
                  <ReferenceArea
                    key={i}
                    x1={seg.x1}
                    x2={seg.x2}
                    y1={seg.y1}
                    y2={seg.y2}
                    fill="#6ee7b7"
                    fillOpacity={0.32}
                    strokeOpacity={0}
                  />
                ))}

                {recipeChanges.map((chg, i) => (
                  <ReferenceLine
                    key={i}
                    x={chg.x}
                    stroke="#9ca3af"
                    strokeDasharray="4 2"
                    label={{ value: chg.label, position: 'insideTopLeft', fontSize: 9, fill: '#6b7280', offset: 4 }}
                  />
                ))}

                <Line
                  type="monotone"
                  dataKey="ph_measured"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#16a34a', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  name="pH"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 px-1 mb-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 bg-blue-600 rounded" />
              EC measured
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-3 bg-blue-300 rounded opacity-60" />
              EC target range
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 bg-green-600 rounded" />
              pH measured
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-3 bg-emerald-300 rounded opacity-70" />
              pH target range
            </span>
            {recipeChanges.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 border-t border-dashed border-gray-400" />
                Recipe change
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
