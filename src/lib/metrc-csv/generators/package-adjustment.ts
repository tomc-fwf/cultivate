// #12 Package Adjustment — generates CSV for POST /packages/v2/adjust (Phase 5)

export interface PackageAdjustmentInput {
  package_tag: string;              // 24-char METRC package label
  quantity: number;                  // signed, non-zero (positive=increase, negative=decrease)
  unit_of_measure: string;
  adjustment_reason: string;
  reason_note?: string | null;
  adjustment_date: string;           // YYYY-MM-DD
  employee_license_number: string;   // from cv_employees.license_number
}

export const PACKAGE_ADJUSTMENT_HEADERS =
  'Label,Quantity,UnitOfMeasure,AdjustmentReason,ReasonNote,AdjustmentDate,EmployeeLicenseNumber';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePackageAdjustmentCsv(input: PackageAdjustmentInput): string {
  const lines: string[] = [PACKAGE_ADJUSTMENT_HEADERS];
  lines.push(
    [
      csvSafe(input.package_tag),
      String(input.quantity),
      csvSafe(input.unit_of_measure),
      csvSafe(input.adjustment_reason),
      csvSafe(input.reason_note),
      csvSafe(input.adjustment_date),
      csvSafe(input.employee_license_number),
    ].join(','),
  );
  return lines.join('\r\n') + '\r\n';
}
