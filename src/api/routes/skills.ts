import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getSkill, listSkills } from '../../lib/skill-loader.js';
import { validateSkillPreconditions } from '../../lib/skill-validator.js';

interface SkillParams { skillId: string }

async function fetchFarmstockItem(itemId: number): Promise<Record<string, unknown> | null> {
  const url = process.env.FARMSTOCK_URL;
  const key = process.env.FARMSTOCK_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/api/items/inventory/${itemId}`, {
      headers: { Authorization: `Service ${key}` },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getLatestSensorReading(
  db: ReturnType<typeof getDB>,
  subZoneId: string | null,
): { temp_f: number | null; humidity_rh: number | null; observed_at: string | null } {
  if (!subZoneId) return { temp_f: null, humidity_rh: null, observed_at: null };
  try {
    const row = db.prepare(`
      SELECT temp_f, humidity_rh, observed_at
      FROM cv_sensor_readings
      WHERE sub_zone_id = ?
      ORDER BY observed_at DESC
      LIMIT 1
    `).get(subZoneId) as Record<string, unknown> | undefined;
    if (!row) return { temp_f: null, humidity_rh: null, observed_at: null };
    return {
      temp_f: row['temp_f'] != null ? Number(row['temp_f']) : null,
      humidity_rh: row['humidity_rh'] != null ? Number(row['humidity_rh']) : null,
      observed_at: row['observed_at'] ? String(row['observed_at']) : null,
    };
  } catch {
    // cv_sensor_readings table may not exist in all environments
    return { temp_f: null, humidity_rh: null, observed_at: null };
  }
}

function describeSensorSource(subZoneId: string, observedAt: string | null): string {
  if (!observedAt) return `sensor ${subZoneId} — no recent reading`;
  const ageMin = Math.round((Date.now() - new Date(observedAt).getTime()) / 60000);
  return `sensor ${subZoneId} — ${ageMin} min ago`;
}

const skillsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET / — list all active skills
   */
  app.get('/', { preHandler: requireAuth }, async (_request, reply) => {
    const skills = listSkills().map(s => ({
      skill_id: s.skill_id,
      skill_version: s.skill_version,
      name: s.name,
      description: s.description,
      category: s.category,
      regulatory_refs: s.regulatory_refs,
      required_roles: s.required_roles,
      precondition_count: s.preconditions.length,
      step_count: s.steps.length,
    }));
    return reply.send(skills);
  });

  /**
   * GET /:skillId — full skill schema
   */
  app.get<{ Params: SkillParams }>(
    '/:skillId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const skill = getSkill(request.params.skillId);
      if (!skill) return reply.code(404).send({ error: 'Skill not found' });
      return reply.send(skill);
    },
  );

  /**
   * GET /:skillId/validate — evaluate skill preconditions in real-time.
   *
   * Called by the frontend as the operator fills in the form (batch_id, input_id selected).
   * Returns per-check results so the UI can display compliance badges before submission.
   * Also returns sensor auto-fill data so the form can pre-populate environmental fields.
   *
   * Query params:
   *   batch_id  — integer, required
   *   input_id  — integer, optional (farmstock item ID)
   *
   * Response:
   *   skill_id, skill_version, context, validation, auto_fill
   */
  app.get<{ Params: SkillParams }>(
    '/:skillId/validate',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { skillId } = request.params;
      const { batch_id, input_id } = request.query as { batch_id?: string; input_id?: string };

      const skill = getSkill(skillId);
      if (!skill) return reply.code(404).send({ error: `Skill '${skillId}' not found` });

      if (!batch_id) return reply.code(400).send({ error: 'batch_id is required' });
      const batchIdNum = parseInt(batch_id, 10);
      if (isNaN(batchIdNum)) return reply.code(400).send({ error: 'batch_id must be an integer' });

      const inputIdNum = input_id ? parseInt(input_id, 10) : null;
      const db = getDB();
      const userId = (request.user as Record<string, unknown>).id as number;

      // Load farmstock item if input_id is provided
      const farmstockItem = inputIdNum ? await fetchFarmstockItem(inputIdNum) : null;

      // Load batch for context enrichment
      const batch = db.prepare(
        'SELECT batch_id, status, sub_zone_id, harvest_date, strain_id FROM cv_batches WHERE batch_id = ?'
      ).get(batchIdNum) as Record<string, unknown> | undefined;

      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      // Enrich batch name
      const strain = db.prepare('SELECT name FROM cv_strains WHERE strain_id = ?')
        .get(batch['strain_id'] as number) as Record<string, unknown> | undefined;

      const context = {
        batch_id: batchIdNum,
        batch_name: `${strain?.['name'] ?? 'Unknown'} — ${batch['sub_zone_id'] ?? 'no zone'}`,
        input_id: inputIdNum,
        input_name: farmstockItem ? String(farmstockItem['name'] ?? '') : null,
      };

      // Run validation
      const validation = await validateSkillPreconditions(skill, {
        batch_id: batchIdNum,
        input_id: inputIdNum,
        user_id: userId,
        applied_at: new Date().toISOString(),
      }, db, farmstockItem);

      // Sensor auto-fill
      const subZoneId = batch['sub_zone_id'] ? String(batch['sub_zone_id']) : null;
      const sensorData = getLatestSensorReading(db, subZoneId);

      const autoFill: Record<string, unknown> = {};
      if (sensorData.temp_f != null) {
        autoFill['ambient_temp_f'] = sensorData.temp_f;
      }
      if (sensorData.humidity_rh != null) {
        autoFill['ambient_rh'] = sensorData.humidity_rh;
      }
      if (subZoneId) {
        autoFill['source'] = describeSensorSource(subZoneId, sensorData.observed_at);
      }

      return reply.send({
        skill_id: skill.skill_id,
        skill_version: skill.skill_version,
        context,
        validation,
        auto_fill: autoFill,
      });
    },
  );
};

export default skillsRoutes;
