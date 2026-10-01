import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CryptoService } from '../src/services/crypto-service.js';
import { MedChainPackageService } from '../src/services/medchain-package-service.js';
import { TEST_MASTER_KEY } from './test-helpers.js';

const SECRET_DEMO = 'MEDCHAIN-SECRET-DEMO-92817';
const service = new MedChainPackageService({
  cryptoService: new CryptoService(TEST_MASTER_KEY, 'test-v1'),
  keyId: 'test-v1',
  maxPayloadBytes: 1024 * 1024
});

function alteredBase64(value) {
  const bytes = Buffer.from(value, 'base64');
  bytes[0] ^= 0xff;
  return bytes.toString('base64');
}

describe('pacote .medchain AES-256-GCM', () => {
  test('preserva JSON, texto, binário e entrada vazia', () => {
    const json = { patient: 'Sintético', symptoms: ['febre', 'tosse'] };
    assert.deepEqual(service.decryptJson(service.encryptJson(json)), json);
    assert.equal(service.decryptText(service.encryptText(SECRET_DEMO)), SECRET_DEMO);
    const binary = Buffer.from([0, 255, 1, 2, 128, 0, 77]);
    assert.deepEqual(service.decryptBuffer(service.encryptBuffer(binary)), binary);
    assert.deepEqual(service.decryptBuffer(service.encryptBuffer(Buffer.alloc(0))), Buffer.alloc(0));
  });

  test('usa IV e ciphertext diferentes para a mesma entrada', () => {
    const first = service.encryptText(SECRET_DEMO);
    const second = service.encryptText(SECRET_DEMO);
    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.ciphertext, second.ciphertext);
  });

  test('não deixa o marcador clínico sintético em plaintext no pacote', () => {
    const packet = service.encryptText(SECRET_DEMO);
    assert.equal(JSON.stringify(packet).includes(SECRET_DEMO), false);
  });

  test('falha fechado para ciphertext, authTag ou IV adulterados', () => {
    const packet = service.encryptText('conteúdo sintético');
    for (const field of ['ciphertext', 'authTag', 'iv']) {
      assert.throws(() => service.decryptBuffer({ ...packet, [field]: alteredBase64(packet[field]) }), /inválido/);
    }
  });

  test('falha para chave incorreta, pacote truncado, versão desconhecida e Base64 inválido', () => {
    const packet = service.encryptText('conteúdo sintético');
    const wrongKey = new MedChainPackageService({
      cryptoService: new CryptoService(Buffer.alloc(32, 9).toString('base64'), 'test-v1'),
      keyId: 'test-v1'
    });
    assert.throws(() => wrongKey.decryptBuffer(packet), /autenticação AES-GCM/);
    assert.throws(() => service.decryptBuffer({ format: 'medchain' }), /campo obrigatório ausente/);
    assert.throws(() => service.decryptBuffer({ ...packet, version: 99 }), /versão não suportada/);
    assert.throws(() => service.decryptBuffer({ ...packet, ciphertext: 'not base64!' }), /Base64 canônico/);
    assert.throws(() => service.decryptBuffer({ ...packet, createdAt: '2026-01-01' }), /data ISO válida/);
  });

  test('vincula AAD à metadata técnica e rejeita campos extras', () => {
    const packet = service.encryptText('conteúdo sintético');
    assert.throws(() => service.decryptBuffer({ ...packet, contentType: 'application/json' }), /autenticação AES-GCM/);
    assert.throws(() => service.decryptBuffer({ ...packet, clinicalData: 'não permitido' }), /campos não reconhecidos/);
  });

  test('CLI não sobrescreve o original e só exporta com --out explícito', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'medchain-package-'));
    try {
      const input = join(directory, 'source.txt');
      const packet = `${input}.medchain`;
      const exported = join(directory, 'restored.txt');
      await writeFile(input, SECRET_DEMO, 'utf8');
      const environment = { ...process.env, MEDCHAIN_MASTER_KEY: TEST_MASTER_KEY, MEDCHAIN_KEY_VERSION: 'test-v1' };
      const encrypt = spawnSync(process.execPath, ['scripts/medchain-cli.mjs', 'encrypt', input], { cwd: process.cwd(), env: environment, encoding: 'utf8' });
      assert.equal(encrypt.status, 0, encrypt.stderr);
      assert.equal(await readFile(input, 'utf8'), SECRET_DEMO);
      const encryptedText = await readFile(packet, 'utf8');
      assert.equal(encryptedText.includes(SECRET_DEMO), false);
      const decryptInMemory = spawnSync(process.execPath, ['scripts/medchain-cli.mjs', 'decrypt', packet], { cwd: process.cwd(), env: environment, encoding: 'utf8' });
      assert.equal(decryptInMemory.status, 0, decryptInMemory.stderr);
      const decryptToFile = spawnSync(process.execPath, ['scripts/medchain-cli.mjs', 'decrypt', packet, '--out', exported], { cwd: process.cwd(), env: environment, encoding: 'utf8' });
      assert.equal(decryptToFile.status, 0, decryptToFile.stderr);
      assert.equal(await readFile(exported, 'utf8'), SECRET_DEMO);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
