import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, DEMO_PASSWORD, DEMO_USERS } from './test-helpers.js';

describe('autenticação', () => {
  let context;
  beforeEach(async () => { context = await createTestContext(); });
  afterEach(() => context.database.close());

  test('rejeita senha incorreta', async () => {
    const response = await context.request.post('/api/auth/login').send({
      email: DEMO_USERS.patient.email,
      password: 'SenhaIncorreta123!'
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  });

  test('rejeita usuário inexistente sem revelar qual campo falhou', async () => {
    const response = await context.request.post('/api/auth/login').send({
      email: 'inexistente@demo.medchain.local',
      password: 'SenhaIncorreta123!'
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.message, 'E-mail ou senha inválidos.');
  });

  test('autentica usuário válido em cookie HttpOnly', async () => {
    const response = await context.request.post('/api/auth/login').send({
      email: DEMO_USERS.patient.email,
      password: DEMO_PASSWORD
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, 'PATIENT');
    assert.equal('token' in response.body, false);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
  });
});
