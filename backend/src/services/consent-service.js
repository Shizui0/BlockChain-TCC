import { randomUUID } from 'node:crypto';
import { forbidden, notFound } from '../errors.js';
import { AUDIT_EVENTS } from './audit-service.js';

const allowedByRequirement = {
  READ: ['READ', 'READ_WRITE'],
  WRITE: ['WRITE', 'READ_WRITE']
};

export class ConsentService {
  constructor(database, auditService, ledgerService) {
    this.database = database;
    this.audit = auditService;
    this.ledger = ledgerService;
  }

  hasPermission(patientId, professionalId, requiredPermission, now = new Date().toISOString()) {
    const allowed = allowedByRequirement[requiredPermission];
    const placeholders = allowed.map(() => '?').join(', ');
    return Boolean(this.database.prepare(`
      SELECT id FROM consents
      WHERE patient_id = ? AND professional_id = ?
        AND revoked_at IS NULL AND expires_at > ?
        AND permission IN (${placeholders})
      ORDER BY created_at DESC
      LIMIT 1
    `).get(patientId, professionalId, now, ...allowed));
  }

  assertAccess(actor, patientId, permission, resourceId = null) {
    const isOwner = actor.role === 'PATIENT' && actor.id === patientId;
    const isAdmin = actor.role === 'ADMIN';
    const isAuthorizedProfessional = actor.role === 'PROFESSIONAL'
      && this.hasPermission(patientId, actor.id, permission);
    if (isOwner || isAdmin || isAuthorizedProfessional) return;
    this.audit.record({
      eventType: AUDIT_EVENTS.ACCESS_DENIED,
      actorId: actor.id,
      patientId,
      resourceId,
      metadata: { requiredPermission: permission }
    });
    throw forbidden('Consentimento ativo e suficiente não encontrado.');
  }

  grant(patient, { professionalId, permission, expiresAt }) {
    const professional = this.database.prepare(`
      SELECT user_id AS id FROM professionals WHERE user_id = ?
    `).get(professionalId);
    if (!professional) throw notFound('Profissional não encontrado.');
    const consent = {
      id: randomUUID(), patientId: patient.id, professionalId, permission,
      expiresAt, revokedAt: null, createdAt: new Date().toISOString()
    };
    const transaction = this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO consents
          (id, patient_id, professional_id, permission, expires_at, revoked_at, created_at)
        VALUES (@id, @patientId, @professionalId, @permission, @expiresAt, @revokedAt, @createdAt)
      `).run(consent);
      this.ledger.registerConsentGrant(consent);
      this.audit.record({
        eventType: AUDIT_EVENTS.CONSENT_GRANTED,
        actorId: patient.id,
        patientId: patient.id,
        resourceId: consent.id,
        metadata: { permission, expiresAt }
      });
    });
    transaction();
    return consent;
  }

  revoke(patient, consentId) {
    const consent = this.database.prepare(`
      SELECT id, patient_id AS patientId, revoked_at AS revokedAt
      FROM consents WHERE id = ?
    `).get(consentId);
    if (!consent || consent.patientId !== patient.id) throw notFound('Consentimento não encontrado.');
    if (consent.revokedAt) return { ...consent, revokedAt: consent.revokedAt };
    const revokedAt = new Date().toISOString();
    const transaction = this.database.transaction(() => {
      this.database.prepare('UPDATE consents SET revoked_at = ? WHERE id = ?').run(revokedAt, consentId);
      this.ledger.registerConsentRevocation(consentId, revokedAt);
      this.audit.record({
        eventType: AUDIT_EVENTS.CONSENT_REVOKED,
        actorId: patient.id,
        patientId: patient.id,
        resourceId: consentId
      });
    });
    transaction();
    return { ...consent, revokedAt };
  }

  list(actor) {
    const filterColumn = actor.role === 'PATIENT' ? 'c.patient_id' : 'c.professional_id';
    return this.database.prepare(`
      SELECT c.id, c.patient_id AS patientId, patient.display_name AS patientName,
             c.professional_id AS professionalId, professional.display_name AS professionalName,
             c.permission, c.expires_at AS expiresAt, c.revoked_at AS revokedAt,
             c.created_at AS createdAt
      FROM consents c
      JOIN users patient ON patient.id = c.patient_id
      JOIN users professional ON professional.id = c.professional_id
      WHERE ${filterColumn} = ?
      ORDER BY c.created_at DESC
    `).all(actor.id).map((consent) => ({
      ...consent,
      active: !consent.revokedAt && consent.expiresAt > new Date().toISOString()
    }));
  }
}
