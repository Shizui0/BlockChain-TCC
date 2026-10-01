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
    const audit = context.database.prepare(`
      SELECT metadata_json AS metadataJson FROM audit_events
      WHERE event_type = 'DOCUMENT_INTEGRITY_VERIFIED' AND resource_id = ? ORDER BY timestamp DESC LIMIT 1
    `).get(created.body.document.id);
    assert.equal(JSON.parse(audit.metadataJson).valid, false);
  });

  test('detecta hash de documento e referência no ledger adulterados', async () => {
    const created = await upload();
    const documentId = created.body.document.id;
    const original = context.database.prepare(`
      SELECT content_hash AS contentHash FROM document_integrity WHERE document_id = ?
    `).get(documentId).contentHash;
    context.database.prepare('UPDATE document_integrity SET content_hash = ? WHERE document_id = ?')
      .run('0'.repeat(64), documentId);
    const invalidDatabase = await patient.get(`/api/documents/${documentId}/integrity`);
    assert.equal(invalidDatabase.body.valid, false);
    assert.equal(invalidDatabase.body.contentValid, false);
    assert.equal((await patient.get(`/api/documents/${documentId}/content`)).status, 409);

    context.database.prepare('UPDATE document_integrity SET content_hash = ? WHERE document_id = ?')
      .run(original, documentId);
    const ledgerRow = context.database.prepare(`
      SELECT id, payload_json AS payloadJson FROM ledger_events
      WHERE event_type = 'DOCUMENT_HASH_REGISTERED' AND payload_json LIKE ?
    `).get(`%${original}%`);
    context.database.prepare('UPDATE ledger_events SET payload_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...JSON.parse(ledgerRow.payloadJson), protectedHash: 'f'.repeat(64) }), ledgerRow.id);
    const invalidLedger = await patient.get(`/api/documents/${documentId}/integrity`);
    assert.equal(invalidLedger.body.valid, false);
    assert.equal(invalidLedger.body.ledgerValid, false);
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
