import { FastifyRequest, FastifyReply } from 'fastify';

const ROLE_LEVEL: Record<string, number> = { grower: 0, supervisor: 1, admin: 2 };
function roleLevel(r: string): number { return ROLE_LEVEL[r] ?? 0; }

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'Not authenticated' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.user.role !== 'admin') {
    await reply.code(403).send({ error: 'Forbidden' });
  }
}

export function requireRole(minRole: string) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAuth(request, reply);
    if (reply.sent) return;
    if (roleLevel(request.user.role) < roleLevel(minRole)) {
      void reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
