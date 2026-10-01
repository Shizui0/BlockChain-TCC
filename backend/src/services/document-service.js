import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { badRequest, conflict, notFound } from '../errors.js';
import { resolvePatientId } from '../utils/patient-access.js';
import { AUDIT_EVENTS } from './audit-service.js';

const MIME_TYPES = Object.freeze({
  'application/pdf': 'application/pdf',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg'
});

function matchesSignature(buffer, mimeType) {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

function safeFileName(value) {
  const cleaned = basename(String(value ?? 'documento'))
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .trim();
  return (cleaned || 'documento').slice(0, 180);
}

function mapRow(row) {
  return {
    id: row.id,
    patientId: row.patientId,
    createdBy: row.createdBy,
    storageName: row.storageName,
    fileIv: row.fileIv,
    fileAuthTag: row.fileAuthTag,
    metadataCiphertext: row.metadataCiphertext,
    metadataIv: row.metadataIv,
    metadataAuthTag: row.metadataAuthTag,
    keyVersion: row.keyVersion,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    contentHash: row.contentHash,
    protectedHash: row.protectedHash,
    algorithm: row.algorithm
  };
}

const selectDocument = `
  SELECT d.id, d.patient_id AS patientId, d.created_by AS createdBy,
         d.storage_name AS storageName, d.file_iv AS fileIv,
         d.file_auth_tag AS fileAuthTag,
         d.metadata_ciphertext AS metadataCiphertext,
         d.metadata_iv AS metadataIv, d.metadata_auth_tag AS metadataAuthTag,
         d.key_version AS keyVersion, d.size_bytes AS sizeBytes,
         d.created_at AS createdAt, i.content_hash AS contentHash,
         i.protected_hash AS protectedHash, i.algorithm
  FROM medical_documents d
  JOIN document_integrity i ON i.document_id = d.id
`;

export class DocumentService {
  constructor(database, cryptoService, integrityService, consentService, auditService, uploadDirectory) {
    this.database = database;
    this.crypto = cryptoService;
    this.integrity = integrityService;
    this.consents = consentService;
    this.audit = auditService;
    this.uploadDirectory = resolve(uploadDirectory);
  }

  storagePath(storageName) {
    if (!/^[0-9a-f-]{36}\.enc$/i.test(storageName)) throw conflict('Referência de armazenamento inválida.');
    const path = resolve(this.uploadDirectory, storageName);
    if (!path.startsWith(`${this.uploadDirectory}${sep}`)) throw conflict('Referência de armazenamento inválida.');
    return path;
  }

  metadataContext(document) {
    return { documentId: document.id, patientId: document.patientId, kind: 'medical-document-metadata' };
  }

  fileContext(document) {
    return { documentId: document.id, patientId: document.patientId, kind: 'medical-document' };
  }

  present(document) {
    const metadata = this.crypto.decrypt({
      ciphertext: document.metadataCiphertext,
      iv: document.metadataIv,
      authTag: document.metadataAuthTag,
      keyVersion: document.keyVersion
    }, this.metadataContext(document));
    return {
      id: document.id,
      patientId: document.patientId,
      createdBy: document.createdBy,
      ...metadata,
      sizeBytes: document.sizeBytes,
      contentHash: document.contentHash,
      algorithm: document.algorithm ?? 'SHA-256',
      createdAt: document.createdAt
    };
  }

  findProtected(documentId) {
    const row = this.database.prepare(`${selectDocument} WHERE d.id = ?`).get(documentId);
    if (!row) throw notFound('Prontuário não encontrado.');
    return mapRow(row);
  }

  async create(actor, { patientId: requestedPatientId, description }, file) {
    if (!file?.buffer?.length) throw badRequest('Selecione um arquivo de prontuário.');
    const patientId = resolvePatientId(actor, requestedPatientId);
    this.consents.assertAccess(actor, patientId, 'WRITE');
    const patient = this.database.prepare('SELECT user_id FROM patients WHERE user_id = ?').get(patientId);
    if (!patient) throw notFound('Paciente não encontrado.');

    const mimeType = MIME_TYPES[file.mimetype?.toLowerCase()];
    if (!mimeType || !matchesSignature(file.buffer, mimeType)) {
      throw badRequest('O arquivo deve ser um PDF, PNG ou JPEG válido.');
    }

    const document = {
      id: randomUUID(),
      patientId,
      createdBy: actor.id,
      storageName: '',
      sizeBytes: file.buffer.length,
      createdAt: new Date().toISOString()
    };
    document.storageName = `${document.id}.enc`;
    const metadata = {
      fileName: safeFileName(file.originalname),
      mimeType,
      ...(description ? { description } : {})
    };
    const protectedMetadata = this.crypto.encrypt(metadata, this.metadataContext(document));
    const protectedFile = this.crypto.encryptBuffer(file.buffer, this.fileContext(document));
    Object.assign(document, {
      fileIv: protectedFile.iv,
      fileAuthTag: protectedFile.authTag,
      metadataCiphertext: protectedMetadata.ciphertext,
      metadataIv: protectedMetadata.iv,
      metadataAuthTag: protectedMetadata.authTag,
      keyVersion: protectedFile.keyVersion
    });

    await mkdir(this.uploadDirectory, { recursive: true });
    const path = this.storagePath(document.storageName);
    let written = false;
    let committed = false;
    try {
      await writeFile(path, protectedFile.ciphertext, { flag: 'wx', mode: 0o600 });
      written = true;
      let integrity;
      this.database.transaction(() => {
        this.database.prepare(`
          INSERT INTO medical_documents
            (id, patient_id, created_by, storage_name, file_iv, file_auth_tag,
             metadata_ciphertext, metadata_iv, metadata_auth_tag, key_version,
             size_bytes, created_at)
          VALUES
            (@id, @patientId, @createdBy, @storageName, @fileIv, @fileAuthTag,
             @metadataCiphertext, @metadataIv, @metadataAuthTag, @keyVersion,
             @sizeBytes, @createdAt)
        `).run(document);
        integrity = this.integrity.registerDocument(
          document,
          protectedFile.ciphertext,
          file.buffer,
          actor.id
        );
        this.audit.record({
          eventType: AUDIT_EVENTS.DOCUMENT_UPLOADED,
          actorId: actor.id,
          patientId,
          resourceId: document.id,
          metadata: { sizeBytes: document.sizeBytes }
        });
      })();
      committed = true;
      return this.present({ ...document, ...integrity });
    } catch (error) {
      if (written && !committed) await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  list(actor, requestedPatientId) {
    const patientId = resolvePatientId(actor, requestedPatientId);
    this.consents.assertAccess(actor, patientId, 'READ');
    const documents = this.database.prepare(`${selectDocument} WHERE d.patient_id = ? ORDER BY d.created_at DESC`)
      .all(patientId).map(mapRow);
    this.audit.record({
      eventType: AUDIT_EVENTS.DOCUMENT_LISTED,
      actorId: actor.id,
      patientId,
      metadata: { documentCount: documents.length }
    });
    return documents.map((document) => this.present(document));
  }

  async encryptedContent(document) {
    return readFile(this.storagePath(document.storageName));
  }

  decryptContent(document, encryptedContent) {
    return this.crypto.decryptBuffer({
      ciphertext: encryptedContent,
      iv: document.fileIv,
      authTag: document.fileAuthTag,
      keyVersion: document.keyVersion
    }, this.fileContext(document));
  }

  async download(actor, documentId) {
    const document = this.findProtected(documentId);
    this.consents.assertAccess(actor, document.patientId, 'READ', document.id);
    let encryptedContent;
    try {
      encryptedContent = await this.encryptedContent(document);
    } catch (error) {
      if (error.code === 'ENOENT') throw notFound('Conteúdo cifrado do prontuário não encontrado.');
      throw error;
    }
    const integrity = this.integrity.verifyDocument(
      document,
      encryptedContent,
      () => this.decryptContent(document, encryptedContent)
    );
    if (!integrity.valid) {
      this.audit.record({
        eventType: AUDIT_EVENTS.DOCUMENT_INTEGRITY_VERIFIED,
        actorId: actor.id,
        patientId: document.patientId,
        resourceId: document.id,
        metadata: { valid: false, algorithm: integrity.algorithm }
      });
      throw conflict('A integridade do prontuário não pôde ser confirmada.');
    }
    const metadata = this.present(document);
    const content = this.decryptContent(document, encryptedContent);
    this.audit.record({
      eventType: AUDIT_EVENTS.DOCUMENT_DOWNLOADED,
      actorId: actor.id,
      patientId: document.patientId,
      resourceId: document.id,
      metadata: { sizeBytes: document.sizeBytes }
    });
    return { content, document: metadata };
  }

  async verify(actor, documentId) {
    const document = this.findProtected(documentId);
    this.consents.assertAccess(actor, document.patientId, 'READ', document.id);
    let result;
    try {
      const encryptedContent = await this.encryptedContent(document);
      result = this.integrity.verifyDocument(
        document,
        encryptedContent,
        () => this.decryptContent(document, encryptedContent)
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      result = {
        valid: false,
        algorithm: 'SHA-256',
        contentValid: false,
        protectedValid: false,
        ledgerValid: false,
        storageAvailable: false,
        checkedAt: new Date().toISOString()
      };
    }
    this.audit.record({
      eventType: AUDIT_EVENTS.DOCUMENT_INTEGRITY_VERIFIED,
      actorId: actor.id,
      patientId: document.patientId,
      resourceId: document.id,
      metadata: { valid: result.valid, algorithm: result.algorithm }
    });
    return result;
  }
}
