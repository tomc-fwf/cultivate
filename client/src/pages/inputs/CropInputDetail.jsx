import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from '../../api';

function Field({ label, value, mono }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span
        className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}
        style={mono ? { fontFamily: 'JetBrains Mono, monospace' } : {}}
      >
        {value || <span className="text-gray-400">—</span>}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {children}
      </div>
    </div>
  );
}

function SignalWordBadge({ word }) {
  if (!word) return <span className="text-gray-400 text-sm">—</span>;
  const map = {
    DANGER: 'bg-red-100 text-red-800',
    WARNING: 'bg-amber-100 text-amber-800',
    CAUTION: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${map[word] || 'bg-gray-100 text-gray-700'}`}>
      {word}
    </span>
  );
}

function ExpiryRow({ lot }) {
  const today = new Date();
  const exp = lot.expiry_date ? new Date(lot.expiry_date) : null;
  const diffDays = exp ? Math.ceil((exp - today) / 86400000) : null;
  let rowClass = '';
  if (diffDays !== null && diffDays < 0) rowClass = 'bg-red-50';
  else if (diffDays !== null && diffDays <= 90) rowClass = 'bg-amber-50';
  return (
    <tr className={`border-t border-gray-100 ${rowClass}`}>
      <td className="py-2.5 pr-3 text-sm text-gray-900 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {lot.lot_number || <span className="text-gray-400">—</span>}
      </td>
      <td className="py-2.5 pr-3 text-sm text-gray-800 font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {Number(lot.quantity).toFixed(2)} {lot.unit}
      </td>
      <td className="py-2.5 pr-3 text-sm text-gray-600">{lot.location_name || '—'}</td>
      <td className="py-2.5 pr-3 text-sm text-gray-600">
        {lot.expiry_date || <span className="text-gray-400">—</span>}
      </td>
      <td className="py-2.5 text-sm text-gray-600">
        {lot.received_date || <span className="text-gray-400">—</span>}
      </td>
    </tr>
  );
}

export default function CropInputDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getInventoryItem(id)
      .then((data) => { setItem(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="h-4 bg-gray-200 rounded w-24 mb-6 animate-pulse" />
        <div className="h-7 bg-gray-200 rounded w-1/2 mb-4 animate-pulse" />
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-green-800 font-medium mb-6"
        >
          <ArrowLeft size={16} />
          Crop Inputs
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error || 'Item not found'}
        </div>
      </div>
    );
  }

  const isPest = item.category_code === 'PEST';
  const lots = item.lots || [];
  const totalOnHand = lots.reduce((sum, l) => sum + Number(l.quantity), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-green-800 font-medium mb-5"
        style={{ minHeight: '44px' }}
      >
        <ArrowLeft size={16} />
        Crop Inputs
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1
            className="text-2xl font-semibold text-gray-900 leading-tight"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            {item.name}
          </h1>
          <a
            href="https://farmstock.hatstak.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-700 font-medium hover:border-green-400 hover:text-green-800 transition-colors shrink-0"
            style={{ minHeight: '44px' }}
          >
            Manage in FarmStock
            <ExternalLink size={14} />
          </a>
        </div>

        {/* Category chip + badges */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: item.category_color ? item.category_color + '22' : '#e5e7eb',
              color: item.category_color || '#374151',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: item.category_color || '#9ca3af' }}
            />
            {item.category_name}
          </span>
          {item.epa_reg_number && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700">EPA</span>
          )}
          {item.omri_listed === 1 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-700">OMRI</span>
          )}
          {item.restricted_use === 1 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-700 text-white">RUP</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Registration & Compliance */}
        <Section title="Registration & Compliance">
          <Field label="EPA Reg #" value={item.epa_reg_number} mono />
          <Field label="MN Reg #" value={item.mda_registration} mono />
          <Field label="OMRI #" value={item.omri_no} mono />
        </Section>

        {/* Pesticide Details — only for PEST category */}
        {isPest && (
          <Section title="Pesticide Details">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Signal Word</span>
              <div className="mt-0.5">
                <SignalWordBadge word={item.signal_word} />
              </div>
            </div>
            <Field
              label="Restricted Use"
              value={item.restricted_use === 1 ? 'Yes' : 'No'}
            />
            <Field label="Active Ingredients" value={item.active_ingredients} />
            <Field label="Target Organisms" value={item.target_organisms} />
            <Field
              label="PHI (Label)"
              value={item.phi_days != null ? `${item.phi_days} days` : null}
              mono
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                PHI (Operational)
              </span>
              {item.phi_days_operational != null ? (
                <div>
                  <span
                    className="text-sm text-gray-900"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {item.phi_days_operational} days
                  </span>
                  {item.phi_notes && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.phi_notes}</p>
                  )}
                </div>
              ) : (
                <span className="text-gray-400 text-sm">—</span>
              )}
            </div>
            <Field
              label="REI"
              value={item.rei_hours != null ? `${item.rei_hours} hours` : null}
              mono
            />
          </Section>
        )}

        {/* Product Info */}
        <Section title="Product Info">
          <Field label="Manufacturer" value={item.manufacturer} />
          <Field label="Form" value={item.form} />
          <Field
            label="Shelf Life"
            value={item.shelf_life_months != null ? `${item.shelf_life_months} months` : null}
          />
          <div className="col-span-2 sm:col-span-3 flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Storage Notes</span>
            <span className="text-sm text-gray-900">{item.storage_notes || <span className="text-gray-400">—</span>}</span>
          </div>
          {item.sds_url && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">SDS</span>
              <a
                href={item.sds_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-green-800 font-medium hover:underline"
                style={{ minHeight: '44px' }}
              >
                View SDS <ExternalLink size={13} />
              </a>
            </div>
          )}
        </Section>

        {/* Lots on Hand */}
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Lots on Hand
          </h2>
          {lots.length === 0 ? (
            <p className="text-sm text-gray-400">
              No lots on hand — receive stock in FarmStock
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[400px]">
                  <thead>
                    <tr>
                      {['Lot #', 'Qty', 'Location', 'Expires', 'Received'].map((h) => (
                        <th
                          key={h}
                          className="pb-2 text-xs font-medium uppercase tracking-wide text-gray-500 pr-3"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot) => (
                      <ExpiryRow key={lot.stock_id} lot={lot} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p
                className="text-sm text-gray-700 font-semibold mt-4 pt-3 border-t border-gray-100"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                Total on hand: {totalOnHand.toFixed(2)} {item.unit}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
