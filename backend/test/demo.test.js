import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestContext, DEMO_USERS, DEMO_PASSWORD } from './test-helpers.js';
import { seedDatabase } from '../src/db/seed.js';
import { createDatabase } from '../src/db/database.js';

test('demo: seed repetível, persistência, cifragem, consentimento, auditoria e revogação', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'medchain-demo-'));
  const databasePath = join(directory, 'demo.sqlite');
  let context;
  try {
    context = await createTestContext({ databasePath });
    const counts = () => ['users', 'medical_records', 'family_history', 'consents']
      .map((table) => context.database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total);
    assert.deepEqual(counts(), [4, 3, 1, 0]);
    await seedDatabase(context.database, context.services);
    assert.deepEqual(counts(), [4, 3, 1, 0]);

    const login = async (email) => {
      const response = await context.request.post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
      assert.equal(response.status, 200);
      return response.headers['set-cookie'][0].split(';')[0];
    };
    const patientCookie = await login(DEMO_USERS.patient.email);
    const doctorCookie = await login(DEMO_USERS.doctor.email);
    const recordsUrl = `/api/records?patientId=${DEMO_USERS.patient.id}`;
    assert.equal((await context.request.get(recordsUrl).set('Cookie', doctorCookie)).status, 403);
    const marker = 'DEMO-TCC-CONTEUDO-INTEIRAMENTE-SINTETICO';
    const created = await context.request.post('/api/records').set('Cookie', patientCookie).send({
      resourceType: 'Observation', clinicalData: { code: 'Exame fictício da banca', value: marker }
    });
    assert.equal(created.status, 201);
    const id = created.body.record.id;
    const raw = context.database.prepare('SELECT * FROM medical_records WHERE id = ?').get(id);
    assert.equal(JSON.stringify(raw).includes(marker), false);
    const integrity = await context.request.get(`/api/records/${id}/integrity`).set('Cookie', patientCookie);
    assert.equal(integrity.status, 200);
    assert.equal(integrity.body.valid, true);
    const consent = await context.request.post('/api/consents').set('Cookie', patientCookie).send({
      professionalId: DEMO_USERS.doctor.id, permission: 'READ',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    assert.equal(consent.status, 201);
    const read = await context.request.get(`/api/records/${id}`).set('Cookie', doctorCookie);
    assert.equal(read.status, 200);
    assert.equal(read.body.record.clinicalData.value, marker);
    assert.equal((await context.request.delete(`/api/consents/${consent.body.consent.id}`).set('Cookie', patientCookie)).status, 200);
    assert.equal((await context.request.get(`/api/records/${id}`).set('Cookie', doctorCookie)).status, 403);
    const audit = await context.request.get('/api/audit').set('Cookie', patientCookie);
    assert.equal(audit.status, 200);
    for (const type of ['RECORD_VIEWED', 'ACCESS_DENIED']) {
      assert.ok(audit.body.events.some((event) => event.eventType === type));
    }
    assert.equal((await context.request.post('/api/auth/logout').set('Cookie', doctorCookie)).status, 204);
    // Explicitly replay the captured cookie; clearing a cookie jar alone is insufficient.
    assert.equal((await context.request.get('/api/me').set('Cookie', doctorCookie)).status, 401);
    context.database.close();
    context = null;
    const reopened = createDatabase(databasePath);
    try {
      assert.equal(reopened.prepare('SELECT COUNT(*) AS total FROM medical_records').get().total, 4);
      assert.ok(reopened.prepare('SELECT revoked_at FROM consents').get().revoked_at);
    } finally { reopened.close(); }
  } finally {
    context?.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
