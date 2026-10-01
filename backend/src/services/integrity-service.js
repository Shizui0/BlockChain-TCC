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

export function hashProtectedPackage(packet) {
  const { integrity, ...protectedPacket } = packet;
  return createHash('sha256').update(canonicalJson(protectedPacket)).digest('hex');
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

function protectedDocumentProjection(document, encryptedContent) {
  return {
    id: document.id,
    patientId: document.patientId,
    createdBy: document.createdBy,
    storageName: document.storageName,
    encryptedContentHash: sha256Buffer(encryptedContent),
    fileIv: document.fileIv,
    fileAuthTag: document.fileAuthTag,
    metadataCiphertext: document.metadataCiphertext,
    metadataIv: document.metadataIv,
    metadataAuthTag: document.metadataAuthTag,
    keyVersion: document.keyVersion,
    sizeBytes: document.sizeBytes,
    createdAt: document.createdAt
  };
}

export function hashProtectedDocument(document, encryptedContent) {
  return createHash('sha256')
    .update(canonicalJson(protectedDocumentProjection(document, encryptedContent)))
    .digest('hex');
}

export function constantTimeDigestEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string'
    || !/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return timingSafeEqual(leftBuffer, rightBuffer);
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

  registerDocument(document, encryptedContent, plaintextContent, actorId) {
    const contentHash = sha256Buffer(plaintextContent);
    const protectedHash = hashProtectedDocument(document, encryptedContent);
    const timestamp = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO document_integrity
        (id, document_id, content_hash, protected_hash, algorithm, actor_id, created_at)
      VALUES (?, ?, ?, ?, 'SHA-256', ?, ?)
    `).run(randomUUID(), document.id, contentHash, protectedHash, actorId, timestamp);
    this.ledger.registerDocumentHashes(document.id, contentHash, protectedHash, timestamp);
    return { contentHash, protectedHash, algorithm: 'SHA-256', timestamp };
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
    const databaseValid = constantTimeDigestEqual(expected.hash, actualHash);
    const ledgerValid = this.ledger.verifyRecordHash(record.id, expected.hash, expected.timestamp);
    return {
      valid: databaseValid && ledgerValid,
      algorithm: expected.algorithm,
      databaseValid,
      ledgerValid,
      checkedAt: new Date().toISOString()
    };
  }

  verifyDocument(document, encryptedContent, decryptContent) {
    const expected = this.database.prepare(`
      SELECT content_hash AS contentHash, protected_hash AS protectedHash,
             algorithm, created_at AS timestamp
      FROM document_integrity
      WHERE document_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(document.id);
    if (!expected) {
      return {
        valid: false,
        algorithm: 'SHA-256',
        contentValid: false,
        protectedValid: false,
        ledgerValid: false
      };
    }

    const actualProtectedHash = hashProtectedDocument(document, encryptedContent);
    const protectedValid = constantTimeDigestEqual(expected.protectedHash, actualProtectedHash);
    let contentValid = false;
    if (protectedValid) {
      try {
        const plaintext = decryptContent();
        contentValid = constantTimeDigestEqual(expected.contentHash, sha256Buffer(plaintext));
      } catch {
        contentValid = false;
      }
    }
    const ledgerValid = this.ledger.verifyDocumentHashes(
      document.id,
      expected.contentHash,
      expected.protectedHash,
      expected.timestamp
    );
    return {
      valid: protectedValid && contentValid && ledgerValid,
      algorithm: expected.algorithm,
      contentHash: expected.contentHash,
      contentValid,
      protectedValid,
      ledgerValid,
      checkedAt: new Date().toISOString()
    };
  }
}
