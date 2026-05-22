import type { FastifyInstance } from 'fastify';

const USER_IDS = { admin: 1, supervisor: 2, grower: 3 } as const;

export function getTestToken(app: FastifyInstance, role: 'admin' | 'supervisor' | 'grower'): string {
  return (app as unknown as { jwt: { sign: (payload: Record<string, unknown>) => string } })
    .jwt.sign({ id: USER_IDS[role], role, name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}` });
}

export function authHeader(
  app: FastifyInstance,
  role: 'admin' | 'supervisor' | 'grower',
): Record<string, string> {
  return { Authorization: `Bearer ${getTestToken(app, role)}` };
}
