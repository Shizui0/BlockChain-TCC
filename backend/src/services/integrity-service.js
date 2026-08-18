import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../utils/canonical-json.js';

function protectedProjection(record) {
  return {
    id: record.id,
    patientId: record.patientId,
    createdBy: record.createdBy,
    resourceType: record.resourceType,
    ciphertext: record.ciphertext,
    iv: record.iv,
    authTag: record.authTag,
    keyVersion: record.keyVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function hashProtectedRecord(record) {
  return createHash('sha256').update(canonicalJson(protectedProjection(record))).digest('hex');
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export class IntegrityService {
  constructor(database, ledgerService) {
    this.database = database;
    this.ledger = ledgerService;
  }

  register(record, actorId) {
    const hash = hashProtectedRecord(record);
    const timestamp = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO record_integrity (id, record_id, hash, algorithm, actor_id, created_at)
      VALUES (?, ?, ?, 'SHA-256', ?, ?)
    `).run(randomUUID(), record.id, hash, actorId, timestamp);
    this.ledger.registerRecordHash(record.id, hash, timestamp);
    return { hash, algorithm: 'SHA-256', timestamp };
  }

  verify(record) {
    const expected = this.database.prepare(`
      SELECT hash, algorithm, created_at AS timestamp
      FROM record_integrity
      WHERE record_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(record.id);
    if (!expected) return { valid: false, algorithm: 'SHA-256', ledgerValid: false };
    const actualHash = hashProtectedRecord(record);
    const databaseValid = constantTimeEqual(expected.hash, actualHash);
    const ledgerValid = this.ledger.verifyRecordHash(record.id, expected.hash);
    return {
      valid: databaseValid && ledgerValid,
      algorithm: expected.algorithm,
      databaseValid,
      ledgerValid,
      checkedAt: new Date().toISOString()
    };
  }
}
