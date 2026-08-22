import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './test-helpers.js';

describe('frontend integrado', () => {
  let context;
  before(async () => { context = await createTestContext(); });
  after(() => context.database.close());

  test('serve a interface e o cliente da API sem ativos legados', async () => {
    const page = await context.request.get('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /MVP ACADÊMICO/);
    assert.match(page.text, /medchain-app\.js/);
    assert.equal(page.text.includes('fonts.googleapis.com'), false);

    const client = await context.request.get('/medchain-app.js');
    assert.equal(client.status, 200);
    assert.match(client.text, /\/api\/records/);
    assert.match(client.text, /\/api\/documents/);
    assert.match(client.text, /new FormData/);
    assert.equal(client.text.includes('localStorage'), false);
    assert.match(page.text, /Prontuários/);
  });
});
