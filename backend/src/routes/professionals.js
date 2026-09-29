import { Router } from 'express';
import { practitionerToFhir } from '../services/fhir-service.js';

export function createProfessionalsRouter(database) {
  const router = Router();
  router.get('/', (_request, response) => {
    const professionals = database.prepare(`
      SELECT u.id, u.display_name AS displayName, p.registration,
             p.organization_type AS organizationType
      FROM professionals p JOIN users u ON u.id = p.user_id
      ORDER BY u.display_name
    `).all();
    response.json({
      professionals: professionals.map((professional) => ({
        ...professional, fhir: practitionerToFhir(professional)
      }))
    });
  });
  return router;
}
