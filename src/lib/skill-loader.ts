import fs from 'fs';
import path from 'path';

// ── Skill schema types ────────────────────────────────────────────────────

export interface SkillPrecondition {
  check_id: string;
  check: string;
  message: string;
  severity: 'block' | 'warn_override' | 'warn' | 'info';
  regulatory_ref?: string;
}

export interface SkillField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  unit?: string;
  placeholder?: string;
  hint?: string;
  regulatory?: string;
  options?: string[];
  source?: string;
  filter?: string;
  depends_on?: string;
  validation?: { min?: number; max?: number; message?: string };
}

export interface SkillAutoFill {
  field: string;
  source: string;
}

export interface SkillStep {
  step_id: number;
  name: string;
  description?: string;
  type: 'input' | 'decision' | 'confirmation' | 'automated' | 'checkpoint';
  fields?: SkillField[];
  auto_fill?: SkillAutoFill[];
  condition?: string;
  confirmation_prompt?: string;
  confirmation_role?: string;
}

export interface SkillOutput {
  table: string;
  action: 'INSERT' | 'UPDATE' | 'QUEUE';
  event_type?: string;
  field_map?: Record<string, string>;
}

export interface SkillPostCondition {
  action: string;
  args: Record<string, string>;
}

export interface SkillComplianceCheck {
  name: string;
  check: string;
  severity: 'block' | 'warn_override' | 'warn';
  message: string;
  regulatory_ref?: string;
  override_requires_note?: boolean;
}

export interface Skill {
  schema_version: string;
  skill_id: string;
  skill_version: string;
  status: 'draft' | 'active' | 'deprecated' | 'superseded';
  sop_id: string;
  sop_version: string;
  name: string;
  description: string;
  category: string;
  regulatory_refs: string[];
  required_roles: string[];
  preconditions: SkillPrecondition[];
  steps: SkillStep[];
  outputs: SkillOutput[];
  post_conditions: SkillPostCondition[];
  compliance_checks?: SkillComplianceCheck[];
}

// ── In-memory registry ────────────────────────────────────────────────────

const cache = new Map<string, Skill>();
let loaded = false;

function getSkillsDir(): string {
  // In development: cwd is the project root, skills are at src/skills/
  // In production (Railway): cwd is the project root, dist is compiled but src/ is still present
  const srcDir = path.join(process.cwd(), 'src', 'skills');
  if (fs.existsSync(srcDir)) return srcDir;

  // Fallback: compiled output places this file at dist/lib/skill-loader.js
  // Skills would need to be at dist/skills/ — note this for production setup
  const distDir = path.join(__dirname, '..', 'skills');
  return distDir;
}

function validateSkill(obj: unknown): Skill {
  const s = obj as Record<string, unknown>;
  if (!s['skill_id'] || typeof s['skill_id'] !== 'string') throw new Error('skill_id required');
  if (!s['skill_version'] || typeof s['skill_version'] !== 'string') throw new Error('skill_version required');
  if (!s['schema_version']) throw new Error('schema_version required');
  if (!Array.isArray(s['preconditions'])) throw new Error('preconditions array required');
  if (!Array.isArray(s['steps'])) throw new Error('steps array required');
  if (!Array.isArray(s['outputs'])) throw new Error('outputs array required');
  return s as unknown as Skill;
}

export function loadSkills(): Map<string, Skill> {
  if (loaded) return cache;

  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) {
    console.warn(`[skill-loader] Skills directory not found: ${dir}`);
    loaded = true;
    return cache;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.skill.json'));
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const skill = validateSkill(JSON.parse(content));
      cache.set(skill.skill_id, skill);
      console.log(`[skill-loader] Loaded skill: ${skill.skill_id} v${skill.skill_version}`);
    } catch (e) {
      console.error(`[skill-loader] Failed to load ${file}:`, e);
    }
  }

  loaded = true;
  return cache;
}

export function getSkill(skillId: string): Skill | null {
  loadSkills();
  return cache.get(skillId) ?? null;
}

export function listSkills(): Skill[] {
  loadSkills();
  return Array.from(cache.values()).filter(s => s.status === 'active');
}
