import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, DEMO_USERS, loginAgent } from './test-helpers.js';

describe('registros cifrados e integridade', () => {
  let context;
  let patient;
  beforeEach(async () => {
    context = await createTestContext();
    patient = await loginAgent(context.app, DEMO_USERS.patient.email);
  });
  afterEach(() => context.database.close());

  test('cria, persiste cifrado e recupera um registro', async () => {
    const secret = 'CONTEUDO-CLINICO-SINTETICO-UNICO';
    const created = await patient.post('/api/records').send({
      resourceType: 'Observation',
      clinicalData: { code: 'Teste laboratorial fictício', value: secret, status: 'final' }
    });
    assert.equal(created.status, 201);
    const raw = context.database.prepare('SELECT * FROM medical_records WHERE id = ?').get(created.body.record.id);
    assert.equal(JSON.stringify(raw).includes(secret), false);
    assert.equal(raw.key_version, 'test-v1');

    const retrieved = await patient.get(`/api/records/${created.body.record.id}`);
    assert.equal(retrieved.status, 200);
    assert.equal(retrieved.body.record.clinicalData.value, secret);
  });

  test('confirma hash correto e detecta alteração proposital', async () => {
    const created = await patient.post('/api/records').send({
      resourceType: 'Observation',
      clinicalData: { code: 'Integridade sintética', value: 'íntegro' }
    });
    const recordId = created.body.record.id;
    const valid = await patient.get(`/api/records/${recordId}/integrity`);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.valid, true);
    assert.equal(valid.body.algorithm, 'SHA-256');

    const raw = context.database.prepare('SELECT ciphertext FROM medical_records WHERE id = ?').get(recordId);
    const replacement = `${raw.ciphertext[0] === 'A' ? 'B' : 'A'}${raw.ciphertext.slice(1)}`;
    context.database.prepare('UPDATE medical_records SET ciphertext = ? WHERE id = ?').run(replacement, recordId);
    const invalid = await patient.get(`/api/records/${recordId}/integrity`);
    assert.equal(invalid.status, 200);
    assert.equal(invalid.body.valid, false);
    assert.equal(invalid.body.databaseValid, false);
  });

  test('bloqueia leitura de registro com metadata protegida adulterada', async () => {
    const created = await patient.post('/api/records').send({
      resourceType: 'Observation',
      clinicalData: { code: 'Metadata protegida', value: 'não deve ser exposto' }
    });
    assert.equal(created.status, 201);
    context.database.prepare('UPDATE medical_records SET updated_at = ? WHERE id = ?')
      .run('2030-01-01T00:00:00.000Z', created.body.record.id);
    const response = await patient.get(`/api/records/${created.body.record.id}`);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CONFLICT');
    const audit = context.database.prepare(`
      SELECT metadata_json AS metadataJson FROM audit_events
      WHERE event_type = 'INTEGRITY_VERIFIED' AND resource_id = ? ORDER BY timestamp DESC LIMIT 1
    `).get(created.body.record.id);
    assert.equal(JSON.parse(audit.metadataJson).valid, false);
  });

  test('detecta hash armazenado ou referência do ledger adulterados', async () => {
    const created = await patient.post('/api/records').send({
      resourceType: 'Observation',
      clinicalData: { code: 'Integridade sintética', value: 'não divulgar' }
    });
    const recordId = created.body.record.id;
    const original = context.database.prepare('SELECT hash FROM record_integrity WHERE record_id = ?').get(recordId).hash;
    context.database.prepare('UPDATE record_integrity SET hash = ? WHERE record_id = ?')
      .run('0'.repeat(64), recordId);
    const invalidDatabase = await patient.get(`/api/records/${recordId}/integrity`);
    assert.equal(invalidDatabase.body.valid, false);
    assert.equal(invalidDatabase.body.databaseValid, false);
    assert.equal((await patient.get(`/api/records/${recordId}`)).status, 409);
    assert.equal(context.database.prepare('SELECT hash FROM record_integrity WHERE record_id = ?').get(recordId).hash, '0'.repeat(64));

    context.database.prepare('UPDATE record_integrity SET hash = ? WHERE record_id = ?').run(original, recordId);
    const ledgerRow = context.database.prepare(`
      SELECT id, payload_json AS payloadJson FROM ledger_events
      WHERE event_type = 'RECORD_HASH_REGISTERED' AND payload_json LIKE ?
    `).get(`%${original}%`);
    context.database.prepare('UPDATE ledger_events SET payload_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...JSON.parse(ledgerRow.payloadJson), hash: 'f'.repeat(64) }), ledgerRow.id);
    const invalidLedger = await patient.get(`/api/records/${recordId}/integrity`);
    assert.equal(invalidLedger.body.valid, false);
    assert.equal(invalidLedger.body.databaseValid, true);
    assert.equal(invalidLedger.body.ledgerValid, false);
  });

  test('integridade exige autorização e não retorna conteúdo clínico', async () => {
    const secret = 'MEDCHAIN-INTEGRITY-SECRET-391';
    const created = await patient.post('/api/records').send({
      resourceType: 'Observation', clinicalData: { code: 'Sintético', value: secret }
    });
    const recordId = created.body.record.id;
    const doctor = await loginAgent(context.app, DEMO_USERS.doctor.email);
    const denied = await doctor.get(`/api/records/${recordId}/integrity`);
    assert.equal(denied.status, 403);
    const allowed = await patient.get(`/api/records/${recordId}/integrity`);
    assert.equal(allowed.status, 200);
    assert.equal(JSON.stringify(allowed.body).includes(secret), false);
  });

  test('preserva os campos da carteira de vacinação cifrados e produz FHIR Immunization', async () => {
    const created = await patient.post('/api/records').send({
      resourceType: 'Immunization',
      clinicalData: {
        code: 'Vacina sintética', dose: '2ª dose', institution: 'UBS Demonstração',
        occurrenceDateTime: '2026-09-29T12:00:00.000Z', status: 'completed'
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.record.clinicalData.dose, '2ª dose');
    assert.equal(created.body.record.fhir.protocolApplied[0].doseNumberString, '2ª dose');
    assert.equal(created.body.record.fhir.location.display, 'UBS Demonstração');
    const raw = context.database.prepare('SELECT ciphertext FROM medical_records WHERE id = ?').get(created.body.record.id);
    assert.equal(raw.ciphertext.includes('UBS Demonstração'), false);
  });
});
