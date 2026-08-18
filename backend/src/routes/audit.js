import { Router } from 'express';
import { z } from 'zod';
import { badRequest, forbidden } from '../errors.js';
import { validate } from '../middleware/validate.js';

const auditQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

export function createAuditRouter(audit) {
  const router = Router();
  router.get('/', validate(auditQuerySchema, 'query'), (request, response) => {
    let patientId = request.user.id;
    if (request.user.role === 'ADMIN') patientId = request.validatedQuery.patientId;
    if (request.user.role === 'PROFESSIONAL') throw forbidden('A auditoria clínica é visualizada pelo paciente.');
    if (!patientId) throw badRequest('patientId é obrigatório para administradores.');
    response.json({ events: audit.listForPatient(patientId, request.validatedQuery.limit) });
  });
  return router;
}
