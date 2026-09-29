import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conflict, unauthorized } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AUDIT_EVENTS } from '../services/audit-service.js';

const passwordSchema = z.string().min(12).max(72);
const registerSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: passwordSchema,
  role: z.enum(['PATIENT', 'PROFESSIONAL']),
  displayName: z.string().trim().min(3).max(120),
  registration: z.string().trim().min(3).max(80).optional()
}).strict().superRefine((value, context) => {
  if (value.role === 'PROFESSIONAL' && !value.registration) {
    context.addIssue({ code: 'custom', path: ['registration'], message: 'Registro profissional é obrigatório.' });
  }
});
const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72)
}).strict();
const dummyPasswordHash = bcrypt.hashSync('medchain-invalid-password', 12);

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, displayName: user.displayName };
}

export function createAuthRouter({ database, config, audit, authenticate }) {
  const router = Router();

  router.post('/register', validate(registerSchema), asyncHandler(async (request, response) => {
    const existing = database.prepare('SELECT id FROM users WHERE email = ?').get(request.body.email);
    if (existing) throw conflict('E-mail já cadastrado.');
    const user = {
      id: randomUUID(), email: request.body.email, role: request.body.role,
      displayName: request.body.displayName, createdAt: new Date().toISOString(),
      passwordHash: await bcrypt.hash(request.body.password, 12)
    };
    database.transaction(() => {
      database.prepare(`
        INSERT INTO users (id, email, password_hash, role, display_name, created_at)
        VALUES (@id, @email, @passwordHash, @role, @displayName, @createdAt)
      `).run(user);
      if (user.role === 'PATIENT') {
        database.prepare('INSERT INTO patients (user_id, synthetic) VALUES (?, 1)').run(user.id);
      } else {
        database.prepare(`
          INSERT INTO professionals (user_id, registration, organization_type)
          VALUES (?, ?, 'PRACTITIONER')
        `).run(user.id, request.body.registration);
      }
    })();
    response.status(201).json({ user: publicUser(user) });
  }));

  router.post('/login', validate(loginSchema), asyncHandler(async (request, response) => {
    const user = database.prepare(`
      SELECT id, email, password_hash AS passwordHash, role, display_name AS displayName
      FROM users WHERE email = ?
    `).get(request.body.email);
    const valid = await bcrypt.compare(request.body.password, user?.passwordHash ?? dummyPasswordHash);
    if (!user || !valid) throw unauthorized('E-mail ou senha inválidos.');
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const token = jwt.sign({ role: user.role }, config.jwtSecret, {
      algorithm: 'HS256', subject: user.id, issuer: 'medchain', audience: 'medchain-web',
      expiresIn: '1h', jwtid: sessionId
    });
    database.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, revoked_at) VALUES (?, ?, ?, NULL)
    `).run(sessionId, user.id, expiresAt);
    response.cookie('medchain_session', token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000,
      path: '/'
    });
    audit.record({
      eventType: AUDIT_EVENTS.USER_LOGIN,
      actorId: user.id,
      patientId: user.role === 'PATIENT' ? user.id : null,
      metadata: { role: user.role }
    });
    response.json({ user: publicUser(user) });
  }));

  router.post('/logout', authenticate, (request, response) => {
    database.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), request.sessionId);
    response.clearCookie('medchain_session', { httpOnly: true, sameSite: 'strict', path: '/' });
    response.status(204).end();
  });

  return router;
}
