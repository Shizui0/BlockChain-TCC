import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestContext, DEMO_USERS, loginAgent } from './test-helpers.js';

const syntheticPdf = Buffer.from('%PDF-1.7\nCONTEUDO-PRONTUARIO-SINTETICO-NAO-PERSISTIR-EM-PLAINTEXT\n%%EOF');

describe('upload cifrado de prontuários', () => {
  let context;
  let patient;
  let uploadDirectory;

  beforeEach(async () => {
    uploadDirectory = await mkdtemp(join(tmpdir(), 'medchain-documents-'));
    context = await createTestContext({ uploadDirectory });
    patient = await loginAgent(context.app, DEMO_USERS.patient.email);
  });

  afterEach(async () => {
    context.database.close();
    await rm(uploadDirectory, { recursive: true, force: true });
  });

  async function upload(agent = patient, fields = {}) {
    let request = agent.post('/api/documents');
    for (const [name, value] of Object.entries(fields)) request = request.field(name, value);
    return request
      .field('description', 'Laudo inteiramente fictício')
      .attach('document', syntheticPdf, {
        filename: 'prontuario-sintetico.pdf',
        contentType: 'application/pdf'
      });
  }

  test('cifra o arquivo, registra SHA-256 e permite recuperar os bytes autorizados', async () => {
    const created = await upload();
    assert.equal(created.status, 201);
    assert.equal(created.body.document.fileName, 'prontuario-sintetico.pdf');
    assert.equal(created.body.document.contentHash, createHash('sha256').update(syntheticPdf).digest('hex'));

    const storedFiles = await readdir(uploadDirectory);
    assert.equal(storedFiles.length, 1);
    assert.match(storedFiles[0], /^[0-9a-f-]{36}\.enc$/);
    const encrypted = await readFile(join(uploadDirectory, storedFiles[0]));
    assert.equal(encrypted.includes(syntheticPdf), false);
    assert.equal(encrypted.toString().includes('CONTEUDO-PRONTUARIO'), false);

    const raw = context.database.prepare(`
      SELECT metadata_ciphertext AS metadataCiphertext, storage_name AS storageName
      FROM medical_documents WHERE id = ?
    `).get(created.body.document.id);
    assert.equal(JSON.stringify(raw).includes('prontuario-sintetico.pdf'), false);
    assert.equal(raw.storageName, storedFiles[0]);

    const listed = await patient.get('/api/documents');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.documents[0].contentHash, created.body.document.contentHash);

    const integrity = await patient.get(`/api/documents/${created.body.document.id}/integrity`);
    assert.equal(integrity.status, 200);
    assert.equal(integrity.body.valid, true);
    assert.equal(integrity.body.contentValid, true);
    assert.equal(integrity.body.protectedValid, true);
    assert.equal(integrity.body.ledgerValid, true);

    const downloaded = await patient.get(`/api/documents/${created.body.document.id}/content`);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers['x-content-sha256'], created.body.document.contentHash);
    assert.deepEqual(downloaded.body, syntheticPdf);
  });

  test('detecta adulteração do arquivo cifrado e bloqueia o download', async () => {
    const created = await upload();
    const storageName = context.database.prepare('SELECT storage_name AS storageName FROM medical_documents WHERE id = ?')
      .get(created.body.document.id).storageName;
    const path = join(uploadDirectory, storageName);
    const encrypted = await readFile(path);
    encrypted[0] ^= 0xff;
    await writeFile(path, encrypted);

    const integrity = await patient.get(`/api/documents/${created.body.document.id}/integrity`);
    assert.equal(integrity.status, 200);
    assert.equal(integrity.body.valid, false);
    assert.equal(integrity.body.protectedValid, false);
    assert.equal((await patient.get(`/api/documents/${created.body.document.id}/content`)).status, 409);
  });

  test('rejeita conteúdo cujo MIME não corresponde a um formato permitido', async () => {
    const plainText = await patient.post('/api/documents')
      .attach('document', Buffer.from('texto'), { filename: 'arquivo.txt', contentType: 'text/plain' });
    assert.equal(plainText.status, 400);

    const forgedPdf = await patient.post('/api/documents')
      .attach('document', Buffer.from('não é pdf'), { filename: 'arquivo.pdf', contentType: 'application/pdf' });
    assert.equal(forgedPdf.status, 400);
  });

  test('exige consentimento de escrita e patientId para upload profissional', async () => {
    const doctor = await loginAgent(context.app, DEMO_USERS.doctor.email);
    assert.equal((await upload(doctor, { patientId: DEMO_USERS.patient.id })).status, 403);

    const consent = await patient.post('/api/consents').send({
      professionalId: DEMO_USERS.doctor.id,
      permission: 'WRITE',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    assert.equal(consent.status, 201);
    assert.equal((await upload(doctor)).status, 400);
    assert.equal((await upload(doctor, { patientId: DEMO_USERS.patient.id })).status, 201);
    assert.equal((await doctor.get(`/api/documents?patientId=${DEMO_USERS.patient.id}`)).status, 403);
  });
});
