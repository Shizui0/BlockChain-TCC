import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const consentSchema = z.object({
  professionalId: z.string().uuid(),
  permission: z.enum(['READ', 'WRITE', 'READ_WRITE']),
  expiresAt: z.string().datetime()
}).strict();

export function createConsentsRouter(consents) {
  const router = Router();
  router.get('/', (request, response) => {
    response.json({ consents: consents.list(request.user) });
  });
  router.post('/', requireRole('PATIENT'), validate(consentSchema), (request, response) => {
    if (request.body.expiresAt <= new Date().toISOString()) {
      throw badRequest('A expiração deve estar no futuro.');
    }
    response.status(201).json({ consent: consents.grant(request.user, request.body) });
  });
  router.delete('/:id', requireRole('PATIENT'), (request, response) => {
    response.json({ consent: consents.revoke(request.user, request.params.id) });
  });
  return router;
}
