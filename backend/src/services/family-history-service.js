import { randomUUID } from 'node:crypto';
import { forbidden } from '../errors.js';

function assertPatient(actor) {
  if (actor.role !== 'PATIENT') throw forbidden('Apenas o paciente pode gerenciar seu histórico familiar.');
}

export class FamilyHistoryService {
  constructor(database, cryptoService) {
    this.database = database;
    this.crypto = cryptoService;
  }

  create(actor, payload) {
    assertPatient(actor);
    const item = { id: randomUUID(), patientId: actor.id, createdBy: actor.id, createdAt: new Date().toISOString() };
    Object.assign(item, this.crypto.encrypt(payload, { familyHistoryId: item.id, patientId: actor.id }));
    this.database.prepare(`
      INSERT INTO family_history
        (id, patient_id, created_by, ciphertext, iv, auth_tag, key_version, created_at)
      VALUES
        (@id, @patientId, @createdBy, @ciphertext, @iv, @authTag, @keyVersion, @createdAt)
    `).run(item);
    return { id: item.id, ...payload, createdAt: item.createdAt };
  }

  list(actor) {
    assertPatient(actor);
    return this.database.prepare(`
      SELECT id, patient_id AS patientId, ciphertext, iv, auth_tag AS authTag,
             key_version AS keyVersion, created_at AS createdAt
      FROM family_history WHERE patient_id = ? ORDER BY created_at DESC
    `).all(actor.id).map((row) => ({
      id: row.id,
      ...this.crypto.decrypt(row, { familyHistoryId: row.id, patientId: row.patientId }),
      createdAt: row.createdAt
    }));
  }
}
