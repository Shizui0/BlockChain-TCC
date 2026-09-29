import { badRequest } from '../errors.js';

export function resolvePatientId(actor, requestedPatientId) {
  if (actor.role === 'PATIENT') return actor.id;
  if (!requestedPatientId) {
    throw badRequest('patientId é obrigatório para profissionais e administradores.');
  }
  return requestedPatientId;
}
