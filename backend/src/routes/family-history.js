import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const familyHistorySchema = z.object({
  relationship: z.enum(['FATHER', 'MOTHER', 'GRANDFATHER', 'GRANDMOTHER', 'GREAT_GRANDFATHER', 'GREAT_GRANDMOTHER']),
  relativeLabel: z.string().trim().min(2).max(80),
  conditions: z.array(z.string().trim().min(2).max(120)).min(1).max(20),
  notes: z.string().trim().max(500).optional()
}).strict();

export function createFamilyHistoryRouter(familyHistory) {
  const router = Router();
  router.get('/', (request, response) => {
    response.json({ familyHistory: familyHistory.list(request.user) });
  });
  router.post('/', validate(familyHistorySchema), (request, response) => {
    response.status(201).json({ item: familyHistory.create(request.user, request.body) });
  });
  return router;
}
