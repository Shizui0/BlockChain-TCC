import { Router } from 'express';
import { patientToFhir } from '../services/fhir-service.js';

export function createPatientsRouter(database) {
  const router = Router();
  router.get('/me', (request, response) => {
    const user = database.prepare(`
      SELECT u.id, u.email, u.role, u.display_name AS displayName, p.synthetic
      FROM users u JOIN patients p ON p.user_id = u.id
      WHERE u.id = ?
    `).get(request.user.id);
    response.json({ patient: user, fhir: patientToFhir(user) });
  });
  return router;
}
