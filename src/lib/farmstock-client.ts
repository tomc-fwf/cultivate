interface DepletionParams {
  lot_id: number;
  quantity: number | null;
  quantity_unit: string | null;
  reference_id: string;
  reference_type: string;
}

interface Logger {
  warn(obj: unknown, msg: string): void;
}

/**
 * Fire-and-forget depletion call to farmstock.
 * If farmstock is unreachable or not configured, logs a warning and returns — never throws.
 * Only call when input_lot_id is present on the application record.
 */
export async function triggerFarmstockDepletion(
  params: DepletionParams,
  logger?: Logger,
): Promise<void> {
  const url = process.env.FARMSTOCK_URL;
  const key = process.env.FARMSTOCK_SERVICE_KEY;
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/api/stock/deplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Service ${key}`,
      },
      body: JSON.stringify({
        lot_id: params.lot_id,
        quantity: params.quantity,
        quantity_unit: params.quantity_unit,
        depleted_by_app: 'cultivate',
        reference_id: params.reference_id,
        reference_type: params.reference_type,
      }),
    });
    if (!res.ok) {
      logger?.warn(
        { status: res.status, lot_id: params.lot_id, reference_type: params.reference_type },
        'farmstock depletion returned non-ok status — application save unaffected',
      );
    }
  } catch (err) {
    logger?.warn(
      { err, lot_id: params.lot_id, reference_type: params.reference_type },
      'farmstock depletion request failed — application save unaffected',
    );
  }
}
