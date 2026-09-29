import { randomUUID } from 'node:crypto';
import { badRequest, conflict, notFound } from '../errors.js';
import { AUDIT_EVENTS } from './audit-service.js';
import { recordToFhir } from './fhir-service.js';

function mapRow(row) {
  return {
    id: row.id,
    patientId: row.patientId,
    createdBy: row.createdBy,
    resourceType: row.resourceType,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
    keyVersion: row.keyVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const selectRecord = `
  SELECT id, patient_id AS patientId, created_by AS createdBy,
         resource_type AS resourceType, ciphertext, iv, auth_tag AS authTag,
         key_version AS keyVersion, created_at AS createdAt, updated_at AS updatedAt
  FROM medical_records
`;

export class RecordService {
  constructor(database, cryptoService, integrityService, consentService, auditService) {
    this.database = database;
    this.crypto = cryptoService;
    this.integrity = integrityService;
    this.consents = consentService;
    this.audit = auditService;
  }

  patientFor(actor, requestedPatientId) {
    if (actor.role === 'PATIENT') return actor.id;
    if (!requestedPatientId) throw badRequest('patientId é obrigatório para profissionais e administradores.');
    return requestedPatientId;
  }

  present(record) {
    const context = { recordId: record.id, patientId: record.patientId, resourceType: record.resourceType };
    const clinicalData = this.crypto.decrypt(record, context);
    return {
      id: record.id,
      patientId: record.patientId,
      createdBy: record.createdBy,
      resourceType: record.resourceType,
      clinicalData,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      fhir: recordToFhir(record, clinicalData)
    };
  }

  assertIntegrity(record) {
    const integrity = this.integrity.verify(record);
    if (!integrity.valid) throw conflict('A integridade do registro médico não pôde ser confirmada.');
  }

  create(actor, { patientId: requestedPatientId, resourceType, clinicalData }) {
    const patientId = this.patientFor(actor, requestedPatientId);
    this.consents.assertAccess(actor, patientId, 'WRITE');
    const patient = this.database.prepare('SELECT user_id FROM patients WHERE user_id = ?').get(patientId);
    if (!patient) throw notFound('Paciente não encontrado.');
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(), patientId, createdBy: actor.id, resourceType,
      createdAt: now, updatedAt: now
    };
    Object.assign(record, this.crypto.encrypt(clinicalData, {
      recordId: record.id, patientId, resourceType
    }));
    const transaction = this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO medical_records
          (id, patient_id, created_by, resource_type, ciphertext, iv, auth_tag,
           key_version, created_at, updated_at)
        VALUES
          (@id, @patientId, @createdBy, @resourceType, @ciphertext, @iv, @authTag,
           @keyVersion, @createdAt, @updatedAt)
      `).run(record);
      this.integrity.register(record, actor.id);
      this.audit.record({
        eventType: AUDIT_EVENTS.RECORD_CREATED,
        actorId: actor.id,
        patientId,
        resourceId: record.id,
        metadata: { resourceType }
      });
    });
    transaction();
    return this.present(record);
  }

  list(actor, requestedPatientId) {
    const patientId = this.patientFor(actor, requestedPatientId);
    this.consents.assertAccess(actor, patientId, 'READ');
    const records = this.database.prepare(`${selectRecord} WHERE patient_id = ? ORDER BY created_at DESC`)
      .all(patientId).map(mapRow);
    this.audit.record({
      eventType: AUDIT_EVENTS.RECORD_VIEWED,
      actorId: actor.id,
      patientId,
      metadata: { recordCount: records.length }
    });
    return records.map((record) => {
      this.assertIntegrity(record);
      return this.present(record);
    });
  }

  findProtected(recordId) {
    const row = this.database.prepare(`${selectRecord} WHERE id = ?`).get(recordId);
    if (!row) throw notFound('Registro médico não encontrado.');
    return mapRow(row);
  }

  get(actor, recordId) {
    const record = this.findProtected(recordId);
    this.consents.assertAccess(actor, record.patientId, 'READ', record.id);
    this.assertIntegrity(record);
    this.audit.record({
      eventType: AUDIT_EVENTS.RECORD_VIEWED,
      actorId: actor.id,
      patientId: record.patientId,
      resourceId: record.id
    });
    return this.present(record);
  }

  verify(actor, recordId) {
    const record = this.findProtected(recordId);
    this.consents.assertAccess(actor, record.patientId, 'READ', record.id);
    const result = this.integrity.verify(record);
    this.audit.record({
      eventType: AUDIT_EVENTS.INTEGRITY_VERIFIED,
      actorId: actor.id,
      patientId: record.patientId,
      resourceId: record.id,
      metadata: { valid: result.valid, algorithm: result.algorithm }
    });
    return result;
  }
}
