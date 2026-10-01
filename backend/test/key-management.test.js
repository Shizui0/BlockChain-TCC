import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { KeyManagementService } from '../src/services/key-management-service.js';
import { MedChainPackageService } from '../src/services/medchain-package-service.js';

const firstKey = Buffer.alloc(32, 11).toString('base64');
const secondKey = Buffer.alloc(32, 12).toString('base64');
const secret = 'MEDCHAIN-SECRET-DEMO-92817';

function packageService(keys) {
  return new MedChainPackageService({
    cryptoService: keys.getActiveCryptoService(),
    keyId: keys.activeKeyId,
    keyResolver: (id) => keys.resolveCryptoService(id)
  });
}

describe('gerenciamento de chaves MedChain', () => {
  test('exige chave de transferência Base64 canônica de 32 bytes', () => {
    assert.throws(() => KeyManagementService.fromTransferEnvironment({}), /MEDCHAIN_TRANSFER_KEY/);
    for (const invalid of ['???', 'a'.repeat(44), Buffer.alloc(31).toString('base64'), firstKey.replace(/=$/, '')]) {
      assert.throws(() => KeyManagementService.fromTransferEnvironment({ MEDCHAIN_TRANSFER_KEY: invalid }), /MEDCHAIN_TRANSFER_KEY/);
    }
    assert.equal(KeyManagementService.fromTransferEnvironment({ MEDCHAIN_TRANSFER_KEY: firstKey }).activeKeyId, 'transfer-v1');
  });

  test('rejeita IDs, keyring e chave antiga inválidos sem expor valores', () => {
    for (const id of ['', '../v1', 'v 1']) {
      assert.throws(() => KeyManagementService.fromTransferEnvironment({ MEDCHAIN_TRANSFER_KEY: firstKey, MEDCHAIN_TRANSFER_KEY_ID: id }), /Identificador/);
    }
    for (const previous of ['{', '[]', JSON.stringify({ 'transfer-v1': secondKey }), JSON.stringify({ old: '???' })]) {
      assert.throws(() => KeyManagementService.fromTransferEnvironment({ MEDCHAIN_TRANSFER_KEY: firstKey, MEDCHAIN_TRANSFER_PREVIOUS_KEYS: previous }));
    }
  });

  test('faz rotação lógica: cifra com chave nova e lê pacote antigo pelo keyId', () => {
    const oldKeys = KeyManagementService.fromTransferEnvironment({ MEDCHAIN_TRANSFER_KEY: firstKey, MEDCHAIN_TRANSFER_KEY_ID: 'old' });
    const oldPacket = packageService(oldKeys).encryptText(secret);
    const newKeys = KeyManagementService.fromTransferEnvironment({
      MEDCHAIN_TRANSFER_KEY: secondKey,
      MEDCHAIN_TRANSFER_KEY_ID: 'new',
      MEDCHAIN_TRANSFER_PREVIOUS_KEYS: JSON.stringify({ old: firstKey })
    });
    const current = packageService(newKeys);
    const newPacket = current.encryptText(secret);
    assert.equal(newPacket.keyId, 'new');
    assert.equal(current.decryptText(oldPacket), secret);
    assert.equal(current.decryptText(newPacket), secret);
    assert.equal(JSON.stringify(newPacket).includes(secret), false);
    const withoutOld = packageService(KeyManagementService.fromTransferEnvironment({ MEDCHAIN_TRANSFER_KEY: secondKey, MEDCHAIN_TRANSFER_KEY_ID: 'new' }));
    assert.throws(() => withoutOld.decryptBuffer(oldPacket), { code: 'UNKNOWN_KEY_ID' });
    const wrongOld = packageService(KeyManagementService.fromTransferEnvironment({
      MEDCHAIN_TRANSFER_KEY: secondKey, MEDCHAIN_TRANSFER_KEY_ID: 'new',
      MEDCHAIN_TRANSFER_PREVIOUS_KEYS: JSON.stringify({ old: secondKey })
    }));
    assert.throws(() => wrongOld.decryptBuffer(oldPacket), /autenticação AES-GCM/);
  });

  test('mantém rotação de chaves do banco separada da chave de transferência', () => {
    const databaseOld = KeyManagementService.fromDatabaseConfig({ masterKey: firstKey, keyVersion: 'db-v1' });
    const protectedValue = databaseOld.encrypt({ clinical: secret }, { id: 'synthetic' });
    const databaseNew = KeyManagementService.fromDatabaseConfig({
      masterKey: secondKey, keyVersion: 'db-v2', previousMasterKeys: JSON.stringify({ 'db-v1': firstKey })
    });
    assert.deepEqual(databaseNew.decrypt(protectedValue, { id: 'synthetic' }), { clinical: secret });
    assert.equal(databaseNew.encrypt({ ok: true }, { id: 'synthetic' }).keyVersion, 'db-v2');
    assert.throws(() => KeyManagementService.fromDatabaseConfig({ masterKey: secondKey, keyVersion: 'db-v2' })
      .decrypt(protectedValue, { id: 'synthetic' }), { code: 'UNKNOWN_KEY_ID' });
    assert.throws(() => databaseNew.decrypt({ ...protectedValue, keyVersion: undefined }, { id: 'synthetic' }), { code: 'UNKNOWN_KEY_ID' });
  });

  test('CLI não revela chave, dado nem ciphertext integral nas falhas de decrypt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'medchain-keys-'));
    try {
      const packet = join(directory, 'test.medchain');
      await writeFile(packet, JSON.stringify(packageService(KeyManagementService.fromTransferEnvironment({
        MEDCHAIN_TRANSFER_KEY: firstKey, MEDCHAIN_TRANSFER_KEY_ID: 'old'
      })).encryptText(secret)));
      const env = { ...process.env, MEDCHAIN_TRANSFER_KEY: secondKey, MEDCHAIN_TRANSFER_KEY_ID: 'new', MEDCHAIN_TRANSFER_PREVIOUS_KEYS: '' };
      const run = spawnSync(process.execPath, ['scripts/medchain-cli.mjs', 'decrypt', packet], { cwd: process.cwd(), env, encoding: 'utf8' });
      assert.equal(run.status, 1);
      assert.match(run.stderr, /Não foi possível descriptografar/);
      for (const sensitive of [firstKey, secondKey, secret, JSON.parse(await readFile(packet, 'utf8')).ciphertext, 'old']) {
        assert.equal((run.stdout + run.stderr).includes(sensitive), false);
      }
      const wrongKey = spawnSync(process.execPath, ['scripts/medchain-cli.mjs', 'decrypt', packet], {
        cwd: process.cwd(), env: { ...env, MEDCHAIN_TRANSFER_KEY_ID: 'old' }, encoding: 'utf8'
      });
      assert.equal(wrongKey.status, 1);
      assert.equal(wrongKey.stderr.trim(), 'Não foi possível descriptografar.');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('keygen emite 32 bytes aleatórios diferentes e não escreve .env', () => {
    const run = () => spawnSync(process.execPath, ['scripts/medchain-keygen.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
    const a = run();
    const b = run();
    assert.equal(a.status, 0);
    assert.equal(b.status, 0);
    assert.equal(Buffer.from(a.stdout.trim(), 'base64').length, 32);
    assert.equal(Buffer.from(b.stdout.trim(), 'base64').length, 32);
    assert.notEqual(a.stdout, b.stdout);
    assert.match(a.stderr, /ATENÇÃO/);
    assert.equal(a.stderr.includes(a.stdout.trim()), false);
  });
});
