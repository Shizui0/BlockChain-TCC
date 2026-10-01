import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CryptoService } from '../src/services/crypto-service.js';
import { hashProtectedPackage } from '../src/services/integrity-service.js';
import { MedChainPackageService, packageAad } from '../src/services/medchain-package-service.js';
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
    assert.deepEqual(service.verifyFingerprint(packet), {
      valid: true, algorithm: 'SHA-256', digestValid: true, version: 2, legacy: false
    });
  });

  test('fingerprint canônico é independente da ordem de campos e não descriptografa', () => {
    const packet = service.encryptText(SECRET_DEMO);
    const reordered = Object.fromEntries(Object.entries(packet).reverse());
    assert.equal(hashProtectedPackage(packet), hashProtectedPackage(reordered));
    const withoutKey = new MedChainPackageService({
      cryptoService: new CryptoService(Buffer.alloc(32, 9).toString('base64'), 'test-v1'),
      keyId: 'test-v1'
    });
    assert.equal(withoutKey.verifyFingerprint(packet).valid, true);
    assert.throws(() => withoutKey.decryptBuffer(packet), /autenticação AES-GCM/);
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
    assert.throws(() => service.decryptBuffer({ ...packet, contentType: 'application/json' }), /fingerprint SHA-256 divergente/);
    assert.throws(() => service.decryptBuffer({ ...packet, clinicalData: 'não permitido' }), /campos não reconhecidos/);
  });

  test('detecta adulteração do fingerprint e de todos os campos técnicos protegidos', () => {
    const packet = service.encryptText('conteúdo sintético');
    const other = service.encryptText('outro conteúdo sintético');
    assert.notEqual(packet.integrity.digest, other.integrity.digest);
    for (const field of ['ciphertext', 'iv', 'authTag', 'createdAt', 'contentType', 'keyId', 'packageId']) {
      const tampered = { ...packet, [field]: field === 'createdAt'
        ? '2026-01-01T00:00:00.000Z'
        : field === 'contentType' ? 'application/json'
          : field === 'keyId' ? 'other-key'
            : field === 'packageId' ? randomUUID()
              : alteredBase64(packet[field]) };
      assert.equal(service.verifyFingerprint(tampered).valid, false, field);
      assert.throws(() => service.decryptBuffer(tampered), /fingerprint SHA-256 divergente/, field);
    }
    const digestTampered = { ...packet, integrity: { ...packet.integrity, digest: '0'.repeat(64) } };
    assert.equal(service.verifyFingerprint(digestTampered).valid, false);
    assert.throws(() => service.decryptBuffer(digestTampered), /fingerprint SHA-256 divergente/);
    const truncated = { ...packet, ciphertext: packet.ciphertext.slice(0, -4) };
    assert.equal(service.verifyFingerprint(truncated).valid, false);
    assert.throws(() => service.decryptBuffer({ ...packet, integrity: undefined }), /seção integrity inválida/);
    const recomputed = { ...packet, createdAt: '2026-01-01T00:00:00.000Z' };
    recomputed.integrity = { algorithm: 'SHA-256', digest: hashProtectedPackage(recomputed) };
    assert.equal(service.verifyFingerprint(recomputed).valid, true);
    assert.throws(() => service.decryptBuffer(recomputed), /autenticação AES-GCM/);
  });

  test('preserva leitura de pacotes v1 sem alegar fingerprint', () => {
    const header = {
      format: 'medchain', version: 1, packageId: randomUUID(),
      createdAt: new Date().toISOString(), algorithm: 'aes-256-gcm',
      keyId: 'test-v1', contentType: 'text/plain; charset=utf-8'
    };
    const encrypted = new CryptoService(TEST_MASTER_KEY, 'test-v1')
      .encryptBuffer(Buffer.from(SECRET_DEMO), packageAad(header));
    const legacy = {
      ...header, iv: encrypted.iv, authTag: encrypted.authTag,
      ciphertext: encrypted.ciphertext.toString('base64')
    };
    assert.equal(service.verifyFingerprint(legacy).legacy, true);
    assert.equal(service.decryptText(legacy), SECRET_DEMO);
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
      const verify = spawnSync(process.execPath, ['scripts/medchain-cli.mjs', 'verify', packet], { cwd: process.cwd(), env: environment, encoding: 'utf8' });
      assert.equal(verify.status, 0, verify.stderr);
      assert.equal(verify.stdout.includes(SECRET_DEMO), false);
      const verifyWithoutKey = spawnSync(process.execPath, ['scripts/medchain-cli.mjs', 'verify', packet], {
        cwd: process.cwd(), env: { ...environment, MEDCHAIN_MASTER_KEY: '' }, encoding: 'utf8'
      });
      assert.equal(verifyWithoutKey.status, 0, verifyWithoutKey.stderr);
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
