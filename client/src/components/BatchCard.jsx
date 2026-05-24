/**
 * Shared batch card components used across application forms and the Today screen.
 *
 * BatchPickerRow  — selectable row inside a picker list
 * BatchSummaryCard — locked/display card after a batch is selected
 */

const STATUS_LABELS = {
  'germ':           'Germination',
  'seedling':       'Seedlings',
  'cult-hoop':      'Cult-Hoop',
  'field-veg':      'Field — Veg',
  'field-flower':   'Field — Flower',
  'flush':          'Flush',
  'harvest_window': 'Harvest Window',
  'harvesting':     'Harvesting',
  'closed':         'Closed',
  'harvest':        'Harvest (legacy)',
};

const STATUS_CHIP = {
  'germ':           'bg-gray-100 text-gray-700',
  'seedling':       'bg-lime-100 text-lime-700',
  'cult-hoop':      'bg-green-100 text-green-700',
  'field-veg':      'bg-green-100 text-green-800',
  'field-flower':   'bg-purple-100 text-purple-700',
  'flush':          'bg-amber-100 text-amber-700',
  'harvest_window': 'bg-orange-100 text-orange-700',
  'harvesting':     'bg-red-100 text-red-700',
  'closed':         'bg-gray-100 text-gray-400',
  'harvest':        'bg-orange-100 text-orange-700',
};

/**
 * Selectable batch row for picker lists inside forms.
 *
 * Props:
 *   batch     — batch object
 *   selected  — boolean
 *   onSelect  — click handler
 *   accent    — 'green' (default) | 'red'  controls selected/hover colours
 *   children  — optional extra chips rendered inside the tag row (e.g. recipe chip)
 */
export function BatchPickerRow({ batch, selected, onSelect, accent = 'green', children }) {
  const selCls  = accent === 'red' ? 'border-red-500 bg-red-50'     : 'border-green-600 bg-green-50';
  const hoverCls = accent === 'red' ? 'hover:border-red-200'         : 'hover:border-green-300';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left w-full px-4 py-3 rounded-2xl border-2 transition-colors ${
        selected ? selCls : `border-gray-200 bg-white ${hoverCls}`
      }`}
      style={{ minHeight: '64px' }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          {batch.name || batch.strain_name}
        </span>
        {batch.sub_zone_id && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {batch.sub_zone_id}
          </span>
        )}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
        {children}
      </div>
      {batch.name && batch.strain_name && (
        <div className="text-xs text-gray-400 mt-0.5">{batch.strain_name}</div>
      )}
    </button>
  );
}

/**
 * Non-interactive display card shown after a batch is selected (locked state).
 * Also used for navigation cards (pass onClick to make it a button).
 *
 * Props:
 *   batch    — batch object
 *   accent   — 'green' (default) | 'red'
 *             harvest_window / harvesting statuses auto-switch to orange regardless
 *   onClick  — if provided, renders as a <button>; otherwise <div>
 *   footer   — optional JSX rendered below the day/plants line
 */
export function BatchSummaryCard({ batch, accent = 'green', onClick, footer }) {
  const isHarvest = batch.status === 'harvest_window' || batch.status === 'harvesting';
  const borderCls = isHarvest
    ? 'border-orange-300 bg-orange-50'
    : accent === 'red'
    ? 'border-red-300 bg-white'
    : 'border-green-300 bg-white';

  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`border-2 rounded-2xl px-4 py-4 w-full text-left ${borderCls}${onClick ? ' hover:opacity-90 transition-opacity active:scale-[0.99]' : ''}`}
    >
      <div className="flex items-center gap-2 flex-wrap mb-0.5">
        <span className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Fraunces, serif' }}>
          {batch.name || batch.strain_name}
        </span>
        {batch.sub_zone_id && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {batch.sub_zone_id}
          </span>
        )}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CHIP[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
      </div>
      {batch.name && batch.strain_name && (
        <div className="text-xs text-gray-400 mb-0.5">{batch.strain_name}</div>
      )}
      <div className="text-xs text-gray-500">
        Day {batch.days_in_stage ?? 0} · {batch.plant_count_current ?? batch.plant_count_initial} plants
      </div>
      {footer && <div className="mt-1">{footer}</div>}
    </Tag>
  );
}
