import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { RECORD_RESOURCE_TYPES } from '../services/fhir-service.js';

const clinicalDataSchema = z.object({
  code: z.string().trim().min(2).max(160),
  status: z.string().trim().min(2).max(40).default('final'),
  value: z.union([z.string().max(500), z.number(), z.boolean()]).optional(),
  note: z.string().trim().max(1000).optional(),
  class: z.string().trim().max(40).optional(),
  dose: z.string().trim().min(1).max(120).optional(),
  institution: z.string().trim().min(2).max(120).optional(),
  occurrenceDateTime: z.string().datetime().optional()
}).strict();

const createRecordSchema = z.object({
  patientId: z.string().uuid().optional(),
  resourceType: z.enum(RECORD_RESOURCE_TYPES),
  clinicalData: clinicalDataSchema
}).strict();

const listRecordsSchema = z.object({ patientId: z.string().uuid().optional() });

export function createRecordsRouter(records) {
  const router = Router();
  router.post('/', validate(createRecordSchema), (request, response) => {
    response.status(201).json({ record: records.create(request.user, request.body) });
  });
  router.get('/', validate(listRecordsSchema, 'query'), (request, response) => {
    response.json({ records: records.list(request.user, request.validatedQuery.patientId) });
  });
  router.get('/:id/integrity', (request, response) => {
    response.json(records.verify(request.user, request.params.id));
  });
  router.get('/:id', (request, response) => {
    response.json({ record: records.get(request.user, request.params.id) });
  });
  return router;
}
