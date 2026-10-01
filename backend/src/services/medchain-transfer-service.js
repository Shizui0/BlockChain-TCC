import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:https';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { DEFAULT_MAX_PACKAGE_BYTES, MedChainPackageService } from './medchain-package-service.js';

const ROUTE = '/v1/packages';
const MEDIA_TYPE = 'application/medchain+json';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_TRANSFER_PAYLOAD_BYTES = 10 * 1024 * 1024;

function transferError(message) {
  const error = new Error(message);
  error.code = 'MEDCHAIN_TRANSFER_FAILED';
  return error;
}

export function isPrivateLanAddress(host) {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

export function validateDestination(value) {
  let url;
  try { url = new URL(value); } catch { throw transferError('Destino HTTPS inválido.'); }
  if (url.protocol !== 'https:' || !isPrivateLanAddress(url.hostname)
    || !url.port || url.pathname !== '/' || url.search || url.hash
    || url.username || url.password) {
    throw transferError('Destino deve ser https://IP-privado:porta, sem caminho ou credenciais.');
  }
  return new URL(`${url.origin}${ROUTE}`);
}

function serviceFor(keys, maxPayloadBytes) {
  return new MedChainPackageService({
    cryptoService: keys.getActiveCryptoService(),
    keyId: keys.activeKeyId,
    keyResolver: (id) => keys.resolveCryptoService(id),
    maxPayloadBytes
  });
}

function maxWireBytes(maxPayloadBytes) {
  return Math.ceil(maxPayloadBytes * 4 / 3) + 4096;
}

function assertTransferLimit(maxPayloadBytes) {
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1
    || maxPayloadBytes > MAX_TRANSFER_PAYLOAD_BYTES) {
    throw transferError('Transferência limitada a payloads de até 10 MiB.');
  }
}

function proofMessage(keyId, timestamp, nonce, body) {
  const digest = createHash('sha256').update(body).digest('hex');
  return Buffer.from(['MEDCHAIN-TRANSFER-V1', 'POST', ROUTE, keyId, timestamp, nonce, digest].join('\n'));
}

function header(req, name) {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function respond(res, status, message) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' });
  res.end(JSON.stringify({ status: message }));
}

async function readBounded(req, expectedLength, maxBytes) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes || length > expectedLength) throw transferError('Pacote excede o limite.');
    chunks.push(chunk);
  }
  if (length !== expectedLength) throw transferError('Pacote incompleto.');
  return Buffer.concat(chunks, length);
}

export async function createTransferReceiver({ keys, cert, privateKey, host, outputDirectory, maxPayloadBytes = DEFAULT_MAX_PACKAGE_BYTES }) {
  assertTransferLimit(maxPayloadBytes);
  if (!isPrivateLanAddress(host)) throw transferError('Escuta exige IP privado explícito ou loopback.');
  if (!Buffer.isBuffer(cert) || !Buffer.isBuffer(privateKey)) throw transferError('Certificado e chave TLS são obrigatórios.');
  const directory = resolve(outputDirectory);
  const limit = maxWireBytes(maxPayloadBytes);
  const packages = serviceFor(keys, maxPayloadBytes);
  const seen = new Map();
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const server = createServer({ cert, key: privateKey, minVersion: 'TLSv1.2' }, (req, res) => {
    req.setTimeout(15_000, () => req.destroy());
    void (async () => {
      if (req.method !== 'POST' || req.url !== ROUTE) return respond(res, 404, 'not_found');
      const lengthText = header(req, 'content-length');
      const length = Number(lengthText);
      if (header(req, 'content-type') !== MEDIA_TYPE || req.headers['transfer-encoding']
        || !/^\d+$/.test(lengthText ?? '') || length < 1 || length > limit) {
        return respond(res, 400, 'invalid_request');
      }
      const keyId = header(req, 'x-medchain-key-id');
      const timestamp = header(req, 'x-medchain-timestamp');
      const nonce = header(req, 'x-medchain-nonce');
      const signature = header(req, 'x-medchain-auth');
      if (!keyId || !/^\d{13}$/.test(timestamp ?? '')
        || Math.abs(Date.now() - Number(timestamp)) > MAX_CLOCK_SKEW_MS
        || !/^[A-Za-z0-9_-]{22}$/.test(nonce ?? '')
        || !/^[a-f0-9]{64}$/.test(signature ?? '') || !keys.resolveCryptoService(keyId)) {
        return respond(res, 401, 'unauthorized');
      }
      const body = await readBounded(req, length, limit);
      if (!keys.verifyTransferProof(proofMessage(keyId, timestamp, nonce, body), signature, keyId)) {
        return respond(res, 401, 'unauthorized');
      }
      const now = Date.now();
      for (const [id, expiry] of seen) if (expiry < now) seen.delete(id);
      const replayId = `${keyId}:${nonce}`;
      if (seen.has(replayId)) return respond(res, 409, 'duplicate');
      if (seen.size >= 10_000) return respond(res, 429, 'busy');
      seen.set(replayId, now + MAX_CLOCK_SKEW_MS * 2);
      let packet;
      try {
        packet = JSON.parse(body.toString('utf8'));
        if (packet.keyId !== keyId) throw transferError('Identificador divergente.');
        const plaintext = packages.decryptBuffer(packet);
        plaintext.fill(0);
      } catch {
        return respond(res, 422, 'invalid_package');
      }
      try {
        await writeFile(join(directory, `${packet.packageId}.medchain`), body, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        return respond(res, error.code === 'EEXIST' ? 409 : 500, error.code === 'EEXIST' ? 'duplicate' : 'storage_error');
      }
      respond(res, 201, 'received');
    })().catch(() => {
      if (!res.headersSent) respond(res, 400, 'invalid_request');
    });
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1;
  return server;
}

export async function sendMedChainPackage({ packet, destination, ca, keys, maxPayloadBytes = DEFAULT_MAX_PACKAGE_BYTES }) {
  assertTransferLimit(maxPayloadBytes);
  const url = validateDestination(destination);
  if (!Buffer.isBuffer(ca) || !ca.length) throw transferError('CA/certificado confiado é obrigatório.');
  const packages = serviceFor(keys, maxPayloadBytes);
  const plaintext = packages.decryptBuffer(packet);
  plaintext.fill(0);
  const body = Buffer.from(JSON.stringify(packet));
  if (body.length > maxWireBytes(maxPayloadBytes)) throw transferError('Pacote excede o limite.');
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('base64url');
  const signature = keys.createTransferProof(proofMessage(packet.keyId, timestamp, nonce, body), packet.keyId);
  return new Promise((resolveResult, rejectResult) => {
    const req = request(url, {
      method: 'POST', ca, rejectUnauthorized: true, minVersion: 'TLSv1.2', agent: false,
      timeout: 15_000,
      headers: {
        'content-type': MEDIA_TYPE,
        'content-length': body.length,
        'x-medchain-key-id': packet.keyId,
        'x-medchain-timestamp': timestamp,
        'x-medchain-nonce': nonce,
        'x-medchain-auth': signature
      }
    }, (res) => {
      const chunks = [];
      let length = 0;
      res.on('data', (chunk) => {
        length += chunk.length;
        if (length > 4096) req.destroy(transferError('Resposta excessiva.'));
        else chunks.push(chunk);
      });
      res.on('end', () => {
        if (res.statusCode !== 201) return rejectResult(transferError(`Recebimento recusado (${res.statusCode}).`));
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (result.status !== 'received') throw new Error('Resposta inválida');
          resolveResult({ received: true, packageId: packet.packageId });
        } catch { rejectResult(transferError('Resposta inválida do destino.')); }
      });
    });
    req.on('timeout', () => req.destroy(transferError('Tempo de transferência excedido.')));
    req.on('error', () => rejectResult(transferError('Conexão HTTPS não pôde ser autenticada ou concluída.')));
    req.end(body);
  });
}
