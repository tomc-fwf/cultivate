import Database from 'better-sqlite3';
import { Skill, SkillPrecondition } from './skill-loader.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface SkillContext {
  batch_id: number;
  input_id?: number | null;
  user_id: number;
  applied_at?: string;
}

export interface ValidationCheck {
  check_id: string;
  passed: boolean;
  severity: 'block' | 'warn_override' | 'warn' | 'info';
  message: string;
  regulatory_ref?: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  blocked: boolean;
  warnings: string[];
}

// ── Helpers (copied from pesticide-applications route) ────────────────────

function getBatchStageKey(status: string, currentStageSince: string | null): string | null {
  switch (status) {
    case 'germ': return 'germ';
    case 'seedling': return 'seedling';
    case 'cult-hoop': return 'cult_hoop';
    case 'field-veg': return 'field_veg';
    case 'field-flower': {
      if (!currentStageSince) return 'field_flower_w1';
      const days = Math.floor((Date.now() - new Date(currentStageSince).getTime()) / 86400000);
      if (days < 7) return 'field_flower_w1';
      if (days < 14) return 'field_flower_w2';
      if (days < 21) return 'field_flower_w3';
      return 'field_flower_w4plus';
    }
    case 'flush': return 'flush';
    default: return null;
  }
}

function getActiveREI(
  db: Database.Database,
  subZoneId: string,
): { active: boolean; expires_at: string | null } {
  const record = db.prepare(`
    SELECT rei_expires_at FROM cv_applications_pesticide
    WHERE batch_id IN (
      SELECT batch_id FROM cv_batches WHERE sub_zone_id = ?
    )
    AND rei_expires_at IS NOT NULL
    AND rei_expires_at > datetime('now')
    AND rei_cleared_at IS NULL
    ORDER BY rei_expires_at ASC
    LIMIT 1
  `).get(subZoneId) as Record<string, unknown> | undefined;

  if (!record) return { active: false, expires_at: null };
  return { active: true, expires_at: String(record['rei_expires_at']) };
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return iso;
  }
}

// ── Main validator ────────────────────────────────────────────────────────

export async function validateSkillPreconditions(
  skill: Skill,
  context: SkillContext,
  db: Database.Database,
  farmstockItem?: Record<string, unknown> | null,
): Promise<ValidationResult> {
  const batch = db.prepare(
    `SELECT batch_id, status, sub_zone_id, harvest_date, current_stage_since
     FROM cv_batches WHERE batch_id = ?`
  ).get(context.batch_id) as Record<string, unknown> | undefined;

  const user = db.prepare(
    'SELECT id, role, name, license_no FROM cv_users WHERE id = ?'
  ).get(context.user_id) as Record<string, unknown> | undefined;

  const appliedAt = context.applied_at ?? new Date().toISOString();
  const checks: ValidationCheck[] = [];

  for (const precondition of skill.preconditions) {
    const check = await evaluatePrecondition(precondition, {
      batch, user, farmstockItem: farmstockItem ?? null,
      inputId: context.input_id ?? null,
      appliedAt, db,
    });
    checks.push(check);
  }

  const blocked = checks.some(c => !c.passed && c.severity === 'block');
  const warnings = checks
    .filter(c => !c.passed && (c.severity === 'warn_override' || c.severity === 'warn'))
    .map(c => c.message);
  const passed = !blocked && warnings.length === 0;

  return { passed, checks, blocked, warnings };
}

interface EvalContext {
  batch: Record<string, unknown> | undefined;
  user: Record<string, unknown> | undefined;
  farmstockItem: Record<string, unknown> | null;
  inputId: number | null;
  appliedAt: string;
  db: Database.Database;
}

async function evaluatePrecondition(
  precondition: SkillPrecondition,
  ctx: EvalContext,
): Promise<ValidationCheck> {
  const { check_id, severity, regulatory_ref } = precondition;
  let passed = true;
  let message = precondition.message;

  switch (check_id) {
    case 'batch_not_closed': {
      if (!ctx.batch) {
        passed = false;
        message = 'Batch not found.';
        break;
      }
      const blockedStatuses = ['closed', 'harvesting'];
      const status = String(ctx.batch['status'] ?? '');
      passed = !blockedStatuses.includes(status);
      if (!passed) {
        message = `Cannot apply pesticide to a batch with status: ${status}. Check PHI compliance if applying during harvesting.`;
      }
      break;
    }

    case 'rei_not_active': {
      const subZoneId = ctx.batch ? String(ctx.batch['sub_zone_id'] ?? '') : '';
      if (!subZoneId) {
        message = 'Sub-zone not determined — REI check skipped.';
        break;
      }
      const rei = getActiveREI(ctx.db, subZoneId);
      passed = !rei.active;
      if (!passed && rei.expires_at) {
        message = `Active REI on ${subZoneId} until ${formatTimestamp(rei.expires_at)}. No entry or application until cleared by supervisor.`;
      } else if (!passed) {
        message = `Active REI on ${subZoneId}. Contact supervisor to clear before applying.`;
      } else {
        message = `No active REI on ${subZoneId}.`;
      }
      break;
    }

    case 'phi_compliant': {
      const phiDays = ctx.farmstockItem
        ? (ctx.farmstockItem['phi_days_operational'] as number | null ?? null)
        : null;
      const harvestDate = ctx.batch ? (ctx.batch['harvest_date'] as string | null ?? null) : null;

      if (phiDays == null || !harvestDate) {
        // Cannot evaluate — default to compliant with info message
        message = phiDays == null
          ? 'PHI not determined (product data unavailable) — assumed compliant.'
          : 'No harvest date set on batch — PHI check skipped.';
        break;
      }

      const harvestMs = new Date(harvestDate).getTime();
      const appliedMs = new Date(ctx.appliedAt).getTime();
      const daysUntilHarvest = (harvestMs - appliedMs) / 86400000;
      passed = daysUntilHarvest >= phiDays;

      if (!passed) {
        message = `PHI violation: product requires ${phiDays} days before harvest, harvest is in ${Math.floor(daysUntilHarvest)} days. Override requires documented reason.`;
      } else {
        message = `PHI compliant: ${phiDays}-day PHI, harvest is in ${Math.floor(daysUntilHarvest)} days.`;
      }
      break;
    }

    case 'stage_allows': {
      if (!ctx.batch || !ctx.inputId) {
        message = 'Stage check skipped (batch or product not yet selected).';
        break;
      }
      const stageKey = getBatchStageKey(
        String(ctx.batch['status'] ?? ''),
        ctx.batch['current_stage_since'] ? String(ctx.batch['current_stage_since']) : null,
      );
      if (!stageKey) {
        message = 'Stage check skipped (batch stage not mappable).';
        break;
      }
      const override = ctx.db.prepare(`
        SELECT reason FROM cv_input_phi_stage_overrides
        WHERE input_id = ? AND batch_stage = ? AND allowed = 0
        LIMIT 1
      `).get(ctx.inputId, stageKey) as Record<string, unknown> | undefined;

      passed = !override;
      if (!passed) {
        const reason = override?.['reason'] ? String(override['reason']) : '';
        message = `This product is not permitted during stage: ${stageKey.replace(/_/g, ' ')}.${reason ? ` Reason: ${reason}` : ''}`;
      } else {
        message = `Stage check passed (${stageKey.replace(/_/g, ' ')}).`;
      }
      break;
    }

    case 'rup_license_ok': {
      const isRUP = ctx.farmstockItem ? Boolean(ctx.farmstockItem['restricted_use']) : false;
      if (!isRUP) {
        message = 'Not a restricted-use pesticide — no license required.';
        break;
      }
      const licenseNo = ctx.user ? (ctx.user['license_no'] as string | null ?? null) : null;
      passed = Boolean(licenseNo && String(licenseNo).trim() !== '');
      if (!passed) {
        message = 'This is a restricted-use pesticide (RUP). A licensed applicator number must be on file for this user before applying.';
      } else {
        message = `RUP check passed — license on file: ${licenseNo}.`;
      }
      break;
    }

    default:
      // Unknown check_id — skip with info
      message = `Unknown check: ${check_id}`;
      break;
  }

  return { check_id, passed, severity, message, regulatory_ref };
}
