import { createHash, randomUUID } from 'node:crypto';

function pseudonymize(namespace, identifier) {
  return createHash('sha256').update(`${namespace}:${identifier}`).digest('hex');
}

export class LedgerService {
  constructor(database) {
    this.database = database;
    this.insert = database.prepare(`
      INSERT INTO ledger_events (id, event_type, subject_ref, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
  }

  append(eventType, namespace, identifier, payload) {
    const event = {
      id: randomUUID(),
      eventType,
      subjectRef: pseudonymize(namespace, identifier),
      payload,
      createdAt: new Date().toISOString()
    };
    this.insert.run(event.id, event.eventType, event.subjectRef, JSON.stringify(payload), event.createdAt);
    return event;
  }

  registerRecordHash(recordId, hash, timestamp) {
    return this.append('RECORD_HASH_REGISTERED', 'record', recordId, {
      hash,
      algorithm: 'SHA-256',
      timestamp
    });
  }

  registerDocumentHashes(documentId, contentHash, protectedHash, timestamp) {
    return this.append('DOCUMENT_HASH_REGISTERED', 'document', documentId, {
      contentHash,
      protectedHash,
      algorithm: 'SHA-256',
      timestamp
    });
  }

  registerConsentGrant(consent) {
    return this.append('CONSENT_GRANTED', 'consent', consent.id, {
      permission: consent.permission,
      expiresAt: consent.expiresAt
    });
  }

  registerConsentRevocation(consentId, revokedAt) {
    return this.append('CONSENT_REVOKED', 'consent', consentId, { revokedAt });
  }

  verifyRecordHash(recordId, hash) {
    const subjectRef = pseudonymize('record', recordId);
    const row = this.database.prepare(`
      SELECT payload_json AS payloadJson
      FROM ledger_events
      WHERE subject_ref = ? AND event_type = 'RECORD_HASH_REGISTERED'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(subjectRef);
    if (!row) return false;
    return JSON.parse(row.payloadJson).hash === hash;
  }

  verifyDocumentHashes(documentId, contentHash, protectedHash) {
    const subjectRef = pseudonymize('document', documentId);
    const row = this.database.prepare(`
      SELECT payload_json AS payloadJson
      FROM ledger_events
      WHERE subject_ref = ? AND event_type = 'DOCUMENT_HASH_REGISTERED'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(subjectRef);
    if (!row) return false;
    const payload = JSON.parse(row.payloadJson);
    return payload.contentHash === contentHash && payload.protectedHash === protectedHash;
  }
}
