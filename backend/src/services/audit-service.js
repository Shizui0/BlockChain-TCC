import { randomUUID } from 'node:crypto';

export const AUDIT_EVENTS = Object.freeze({
  USER_LOGIN: 'USER_LOGIN',
  RECORD_CREATED: 'RECORD_CREATED',
  RECORD_VIEWED: 'RECORD_VIEWED',
  RECORD_UPDATED: 'RECORD_UPDATED',
  CONSENT_GRANTED: 'CONSENT_GRANTED',
  CONSENT_REVOKED: 'CONSENT_REVOKED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  INTEGRITY_VERIFIED: 'INTEGRITY_VERIFIED'
});

const sensitiveKey = /(clinical|diagnos|result|condition|genetic|document|payload|content|note)/i;

function safeMetadata(metadata) {
  return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key, value]) => {
    return !sensitiveKey.test(key) && ['string', 'number', 'boolean'].includes(typeof value);
  }));
}

export class AuditService {
  constructor(database) {
    this.database = database;
    this.insert = database.prepare(`
      INSERT INTO audit_events
        (id, event_type, actor_id, patient_id, resource_id, timestamp, metadata_json)
      VALUES
        (@id, @eventType, @actorId, @patientId, @resourceId, @timestamp, @metadataJson)
    `);
  }

  record({ eventType, actorId = null, patientId = null, resourceId = null, metadata = {} }) {
    const event = {
      id: randomUUID(),
      eventType,
      actorId,
      patientId,
      resourceId,
      timestamp: new Date().toISOString(),
      metadataJson: JSON.stringify(safeMetadata(metadata))
    };
    this.insert.run(event);
    return { ...event, metadata: JSON.parse(event.metadataJson), metadataJson: undefined };
  }

  listForPatient(patientId, limit = 100) {
    return this.database.prepare(`
      SELECT id, event_type AS eventType, actor_id AS actorId,
             patient_id AS patientId, resource_id AS resourceId,
             timestamp, metadata_json AS metadataJson
      FROM audit_events
      WHERE patient_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(patientId, limit).map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadataJson),
      metadataJson: undefined
    }));
  }
}
