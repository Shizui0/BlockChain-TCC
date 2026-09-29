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
