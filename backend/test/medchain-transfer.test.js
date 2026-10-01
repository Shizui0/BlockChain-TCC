import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { KeyManagementService } from '../src/services/key-management-service.js';
import { MedChainPackageService } from '../src/services/medchain-package-service.js';
import { createTransferReceiver, isPrivateLanAddress, sendMedChainPackage, validateDestination } from '../src/services/medchain-transfer-service.js';
import { TEST_MASTER_KEY } from './test-helpers.js';

const SECRET = 'MEDCHAIN-SECRET-DEMO-92817';
const keys = KeyManagementService.fromTransferEnvironment({
  MEDCHAIN_TRANSFER_KEY: TEST_MASTER_KEY, MEDCHAIN_TRANSFER_KEY_ID: 'transfer-v1'
});
const packages = new MedChainPackageService({
  cryptoService: keys.getActiveCryptoService(), keyId: keys.activeKeyId,
  keyResolver: (id) => keys.resolveCryptoService(id)
});
let directory;
let ca;
let server;
let destination;

function opensslBinary() {
  const candidates = process.platform === 'win32'
    ? ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'] : ['openssl'];
  return candidates.find((candidate) => spawnSync(candidate, ['version'], { stdio: 'ignore' }).status === 0);
}

function rawPost(body, headers = {}) {
  return new Promise((resolveResult, rejectResult) => {
    const req = request(new URL('/v1/packages', destination), {
      method: 'POST', ca, rejectUnauthorized: true,
      headers: { 'content-type': 'application/medchain+json', 'content-length': body.length, ...headers }
    }, (res) => {
      res.resume();
      res.on('end', () => resolveResult(res.statusCode));
    });
    req.on('error', rejectResult);
    req.end(body);
  });
}

function signedHeaders(body, nonce = randomBytes(16).toString('base64url')) {
  const timestamp = String(Date.now());
  const digest = createHash('sha256').update(body).digest('hex');
  const message = Buffer.from(['MEDCHAIN-TRANSFER-V1', 'POST', '/v1/packages', keys.activeKeyId, timestamp, nonce, digest].join('\n'));
  return {
    'x-medchain-key-id': keys.activeKeyId,
    'x-medchain-timestamp': timestamp,
    'x-medchain-nonce': nonce,
    'x-medchain-auth': keys.createTransferProof(message)
  };
}

function runCli(args, env) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveResult({ code, stdout, stderr }));
  });
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'medchain-lan-'));
  const binary = opensslBinary();
  assert.ok(binary, 'OpenSSL é necessário apenas para gerar o certificado temporário deste teste.');
  const certPath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  const generated = spawnSync(binary, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', keyPath, '-out', certPath
  ], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  ca = await readFile(certPath);
  server = await createTransferReceiver({
    keys, cert: ca, privateKey: await readFile(keyPath), host: '127.0.0.1',
    outputDirectory: join(directory, 'inbox'), maxPayloadBytes: 1024 * 1024
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  destination = `https://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('transferência .medchain entre computadores', () => {
  test('aceita apenas destino HTTPS em IPv4 privado explícito', () => {
    assert.equal(isPrivateLanAddress('127.0.0.1'), true);
    assert.equal(isPrivateLanAddress('192.168.1.3'), true);
    assert.equal(isPrivateLanAddress('172.31.1.1'), true);
    for (const value of ['8.8.8.8', '0.0.0.0', 'localhost', '169.254.1.1']) {
      assert.equal(isPrivateLanAddress(value), false);
    }
    for (const value of ['http://127.0.0.1:443', 'https://8.8.8.8:443', 'https://localhost:443', 'https://127.0.0.1:443/evil']) {
      assert.throws(() => validateDestination(value));
    }
  });

  test('PC A envia, PC B autentica e salva somente o pacote cifrado', async () => {
    const packet = packages.encryptText(SECRET);
    const result = await sendMedChainPackage({ packet, destination, ca, keys, maxPayloadBytes: 1024 * 1024 });
    assert.deepEqual(result, { received: true, packageId: packet.packageId });
    const stored = await readFile(join(directory, 'inbox', `${packet.packageId}.medchain`), 'utf8');
    assert.equal(stored.includes(SECRET), false);
    assert.equal(packages.decryptText(JSON.parse(stored)), SECRET);
    await assert.rejects(sendMedChainPackage({ packet, destination, ca, keys, maxPayloadBytes: 1024 * 1024 }), /409/);
  });

  test('preserva bytes binários no trajeto HTTPS sem exportar plaintext', async () => {
    const original = Buffer.from([0, 255, 128, 10, 13, 0, 77]);
    const packet = packages.encryptBuffer(original);
    await sendMedChainPackage({ packet, destination, ca, keys });
    const received = JSON.parse(await readFile(join(directory, 'inbox', `${packet.packageId}.medchain`), 'utf8'));
    assert.deepEqual(packages.decryptBuffer(received), original);
    assert.equal(received.ciphertext === original.toString('base64'), false);
  });

  test('rejeita certificado não confiado e pacote adulterado antes de gravar', async () => {
    const packet = packages.encryptText(SECRET);
    await assert.rejects(sendMedChainPackage({ packet, destination, ca: Buffer.from('not a CA'), keys }), /HTTPS/);
    const altered = { ...packet, ciphertext: 'AAAA' };
    await assert.rejects(sendMedChainPackage({ packet: altered, destination, ca, keys }), /inválido/);
    const body = Buffer.from(JSON.stringify(altered));
    assert.equal(await rawPost(body, signedHeaders(body)), 422);
    await assert.rejects(readFile(join(directory, 'inbox', `${packet.packageId}.medchain`)));
  });

  test('rejeita remetente sem prova, replay e payload acima do limite', async () => {
    const packet = packages.encryptText('dado sintético');
    const body = Buffer.from(JSON.stringify(packet));
    assert.equal(await rawPost(body, { ...signedHeaders(body), 'x-medchain-auth': '0'.repeat(64) }), 401);
    const headers = signedHeaders(body);
    assert.equal(await rawPost(body, headers), 201);
    assert.equal(await rawPost(body, headers), 409);
    assert.equal(await rawPost(body, { 'content-length': 10_000_000 }), 400);
    const stale = signedHeaders(body);
    stale['x-medchain-timestamp'] = String(Date.now() - 10 * 60 * 1000);
    assert.equal(await rawPost(body, stale), 401);
  });

  test('CLI envia pacote sem exibir marcador ou chave', async () => {
    const packet = packages.encryptText(SECRET);
    const file = join(directory, 'outgoing.medchain');
    await writeFile(file, JSON.stringify(packet));
    const result = await runCli(['scripts/medchain-transfer.mjs', 'send', file, '--to', destination, '--ca', join(directory, 'cert.pem')], {
      ...process.env, MEDCHAIN_TRANSFER_KEY: TEST_MASTER_KEY, MEDCHAIN_TRANSFER_KEY_ID: 'transfer-v1'
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal((result.stdout + result.stderr).includes(SECRET), false);
    assert.equal((result.stdout + result.stderr).includes(TEST_MASTER_KEY), false);
  });
});
