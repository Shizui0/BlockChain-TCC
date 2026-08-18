import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestContext, DEMO_USERS, loginAgent } from './test-helpers.js';

describe('consentimento e auditoria', () => {
  let context;
  let patient;
  let doctor;

  beforeEach(async () => {
    context = await createTestContext();
    patient = await loginAgent(context.app, DEMO_USERS.patient.email);
    doctor = await loginAgent(context.app, DEMO_USERS.doctor.email);
  });
  afterEach(() => context.database.close());

  async function grant(hours = 24) {
    return patient.post('/api/consents').send({
      professionalId: DEMO_USERS.doctor.id,
      permission: 'READ',
      expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    });
  }

  test('nega profissional sem consentimento e registra ACCESS_DENIED', async () => {
    const denied = await doctor.get(`/api/records?patientId=${DEMO_USERS.patient.id}`);
    assert.equal(denied.status, 403);
    const audit = await patient.get('/api/audit');
    assert.ok(audit.body.events.some((event) => event.eventType === 'ACCESS_DENIED' && event.actorId === DEMO_USERS.doctor.id));
  });

  test('permite profissional autorizado e registra a visualização', async () => {
    const consent = await grant();
    assert.equal(consent.status, 201);
    const records = await doctor.get(`/api/records?patientId=${DEMO_USERS.patient.id}`);
    assert.equal(records.status, 200);
    assert.ok(records.body.records.length >= 1);
    const audit = await patient.get('/api/audit');
    assert.ok(audit.body.events.some((event) => event.eventType === 'RECORD_VIEWED' && event.actorId === DEMO_USERS.doctor.id));
  });

  test('nega consentimento expirado', async () => {
    context.database.prepare(`
      INSERT INTO consents
        (id, patient_id, professional_id, permission, expires_at, revoked_at, created_at)
      VALUES (?, ?, ?, 'READ', ?, NULL, ?)
    `).run(randomUUID(), DEMO_USERS.patient.id, DEMO_USERS.doctor.id,
      new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() - 120_000).toISOString());
    const denied = await doctor.get(`/api/records?patientId=${DEMO_USERS.patient.id}`);
    assert.equal(denied.status, 403);
  });

  test('revogação impede imediatamente novos acessos', async () => {
    const consent = await grant();
    assert.equal(consent.status, 201);
    assert.equal((await doctor.get(`/api/records?patientId=${DEMO_USERS.patient.id}`)).status, 200);
    const revoked = await patient.delete(`/api/consents/${consent.body.consent.id}`);
    assert.equal(revoked.status, 200);
    assert.equal((await doctor.get(`/api/records?patientId=${DEMO_USERS.patient.id}`)).status, 403);
    const audit = await patient.get('/api/audit');
    assert.ok(audit.body.events.some((event) => event.eventType === 'CONSENT_REVOKED'));
    assert.ok(audit.body.events.some((event) => event.eventType === 'ACCESS_DENIED'));
  });
});
