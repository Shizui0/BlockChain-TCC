import request from 'supertest';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD, DEMO_USERS } from '../src/db/seed.js';

export const TEST_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

export async function createTestContext(configOverrides = {}) {
  const context = await createApp({
    config: {
      environment: 'test',
      databasePath: ':memory:',
      jwtSecret: 'test-only-jwt-secret-that-is-long-enough-for-the-suite',
      masterKey: TEST_MASTER_KEY,
      keyVersion: 'test-v1',
      frontendOrigin: 'http://localhost:4173',
      secureCookies: false,
      seedDemo: true,
      ...configOverrides
    },
    seed: true
  });
  return { ...context, request: request(context.app) };
}

export async function loginAgent(app, email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  if (response.status !== 200) throw new Error(`Login de teste falhou: ${response.status}`);
  return agent;
}

export { DEMO_PASSWORD, DEMO_USERS };
