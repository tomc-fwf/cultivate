import { FastifyPluginAsync, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { getDB } from '../../db/index.js';
import { LoginBodySchema, UsersQuerySchema } from '../schemas/auth.schemas.js';
import { requireAuth } from '../middleware/auth.middleware.js';

interface UserRow {
  id: number;
  name: string;
  role: string;
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
}

const NO_CACHE = 'no-store, private';
const isProduction = process.env.NODE_ENV === 'production';

function setHatStackCookie(reply: FastifyReply, token: string): void {
  (reply as any).setCookie('hatstak_token', token, {
    domain: isProduction ? '.hatstak.app' : undefined,
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

function clearHatStackCookie(reply: FastifyReply): void {
  (reply as any).clearCookie('hatstak_token', {
    domain: isProduction ? '.hatstak.app' : undefined,
    path: '/',
  });
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users', async (request, reply) => {
    UsersQuerySchema.parse(request.query);
    const users = getDB()
      .prepare('SELECT id, name, role FROM cv_users WHERE active=1 ORDER BY name')
      .all();
    return reply.send(users);
  });

  app.post('/login', async (request, reply) => {
    const parseResult = LoginBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parseResult.error.issues });
    }
    const { user_id, pin } = parseResult.data;

    const db = getDB();
    const user = db
      .prepare('SELECT * FROM cv_users WHERE id=? AND active=1')
      .get(user_id) as UserRow | undefined;
    if (!user) return reply.code(404).send({ error: 'User not found' });

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return reply.code(423).send({
        error: 'Account locked. Try again later.',
        locked_until: user.locked_until,
      });
    }

    if (!bcrypt.compareSync(String(pin), user.pin_hash)) {
      const attempts = (user.failed_attempts || 0) + 1;
      if (attempts >= 5) {
        const until = new Date(Date.now() + 15 * 60000).toISOString();
        db.prepare('UPDATE cv_users SET failed_attempts=?, locked_until=? WHERE id=?').run(
          attempts,
          until,
          user.id,
        );
        return reply.code(423).send({ error: 'Account locked for 15 minutes.', locked_until: until });
      }
      db.prepare('UPDATE cv_users SET failed_attempts=? WHERE id=?').run(attempts, user.id);
      return reply.code(401).send({ error: 'Incorrect PIN', attempts_remaining: 5 - attempts });
    }

    db.prepare('UPDATE cv_users SET failed_attempts=0, locked_until=NULL, last_login_at=? WHERE id=?').run(
      new Date().toISOString(),
      user.id,
    );

    const token = await app.jwt.sign({ id: user.id, name: user.name, role: user.role });
    setHatStackCookie(reply, token);
    reply.header('Cache-Control', NO_CACHE);
    return reply.send({ token, worker: { id: user.id, name: user.name, role: user.role } });
  });

  // Refresh verifies the current session (cookie or header) and issues a fresh token.
  // Also re-validates the user is still active in the DB — catches deactivated accounts.
  app.post('/refresh', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.user;
    const db = getDB();
    const user = db
      .prepare('SELECT id, name, role FROM cv_users WHERE id=? AND active=1')
      .get(id) as { id: number; name: string; role: string } | undefined;
    if (!user) {
      return reply.code(401).send({ error: 'User not found or inactive' });
    }
    const token = await app.jwt.sign({ id: user.id, name: user.name, role: user.role });
    setHatStackCookie(reply, token);
    reply.header('Cache-Control', NO_CACHE);
    return reply.send({ token, worker: { id: user.id, name: user.name, role: user.role } });
  });

  // Logout clears the shared hatstak_token cookie. No auth required.
  app.post('/logout', async (request, reply) => {
    clearHatStackCookie(reply);
    reply.header('Cache-Control', NO_CACHE);
    return reply.send({ ok: true });
  });
};

export default authRoutes;
