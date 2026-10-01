import { randomUUID } from 'node:crypto';
import { canonicalJson } from '../utils/canonical-json.js';

export const MEDCHAIN_PACKAGE_FORMAT = 'medchain';
export const MEDCHAIN_PACKAGE_VERSION = 1;
export const MEDCHAIN_PACKAGE_ALGORITHM = 'aes-256-gcm';
export const DEFAULT_MAX_PACKAGE_BYTES = 10 * 1024 * 1024;

const REQUIRED_FIELDS = [
  'format', 'version', 'packageId', 'createdAt', 'algorithm', 'keyId',
  'contentType', 'iv', 'authTag', 'ciphertext'
];

function packageError(message) {
  const error = new Error(`Pacote .medchain inválido: ${message}`);
  error.code = 'MEDCHAIN_PACKAGE_INVALID';
  return error;
}

function assertBase64(value, field, expectedLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw packageError(`${field} não usa Base64 canônico.`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw packageError(`${field} não usa Base64 canônico.`);
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw packageError(`${field} tem tamanho inválido.`);
  }
  return decoded;
}

function assertString(value, field, { maxLength = 200 } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw packageError(`${field} é obrigatório e deve ter tamanho válido.`);
  }
  return value;
}

export function packageAad(packet) {
  return {
    algorithm: packet.algorithm,
    contentType: packet.contentType,
    keyId: packet.keyId,
    packageId: packet.packageId,
    version: packet.version
  };
}

export class MedChainPackageService {
  constructor({ cryptoService, keyId = cryptoService?.keyVersion, keyResolver, maxPayloadBytes = DEFAULT_MAX_PACKAGE_BYTES } = {}) {
    if (!cryptoService) throw new Error('CryptoService é obrigatório para pacotes .medchain.');
    if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
      throw new Error('O limite de pacote deve ser um inteiro positivo.');
    }
    this.crypto = cryptoService;
    this.keyId = assertString(keyId, 'keyId');
    this.keyResolver = keyResolver ?? ((requestedKeyId) => (requestedKeyId === this.keyId ? this.crypto : undefined));
    this.maxPayloadBytes = maxPayloadBytes;
  }

  encryptBuffer(input, { contentType = 'application/octet-stream' } = {}) {
    const plaintext = Buffer.isBuffer(input) ? input : Buffer.from(input);
    if (plaintext.length > this.maxPayloadBytes) {
      throw new Error(`O conteúdo excede o limite de ${this.maxPayloadBytes} bytes para pacotes .medchain.`);
    }
    const packet = {
      format: MEDCHAIN_PACKAGE_FORMAT,
      version: MEDCHAIN_PACKAGE_VERSION,
      packageId: randomUUID(),
      createdAt: new Date().toISOString(),
      algorithm: MEDCHAIN_PACKAGE_ALGORITHM,
      keyId: this.keyId,
      contentType: assertString(contentType, 'contentType')
    };
    const protectedValue = this.crypto.encryptBuffer(plaintext, packageAad(packet));
    return {
      ...packet,
      iv: protectedValue.iv,
      authTag: protectedValue.authTag,
      ciphertext: protectedValue.ciphertext.toString('base64')
    };
  }

  encryptText(text, options = {}) {
    if (typeof text !== 'string') throw new TypeError('Texto deve ser uma string.');
    return this.encryptBuffer(Buffer.from(text, 'utf8'), { contentType: 'text/plain; charset=utf-8', ...options });
  }

  encryptJson(value, options = {}) {
    return this.encryptBuffer(Buffer.from(canonicalJson(value), 'utf8'), { contentType: 'application/json', ...options });
  }

  validate(packet) {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw packageError('a raiz deve ser um objeto JSON.');
    for (const field of REQUIRED_FIELDS) {
      if (!Object.hasOwn(packet, field)) throw packageError(`campo obrigatório ausente: ${field}.`);
    }
    if (Object.keys(packet).some((field) => !REQUIRED_FIELDS.includes(field))) {
      throw packageError('campos não reconhecidos não são permitidos.');
    }
    if (packet.format !== MEDCHAIN_PACKAGE_FORMAT) throw packageError('format não suportado.');
    if (packet.version !== MEDCHAIN_PACKAGE_VERSION) throw packageError('versão não suportada.');
    if (packet.algorithm !== MEDCHAIN_PACKAGE_ALGORITHM) throw packageError('algoritmo não suportado.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assertString(packet.packageId, 'packageId'))) {
      throw packageError('packageId não é um UUID válido.');
    }
    const createdAt = assertString(packet.createdAt, 'createdAt');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt)
      || !Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) {
      throw packageError('createdAt não é uma data ISO válida.');
    }
    assertString(packet.keyId, 'keyId');
    assertString(packet.contentType, 'contentType');
    const iv = assertBase64(packet.iv, 'iv', 12);
    const authTag = assertBase64(packet.authTag, 'authTag', 16);
    const ciphertext = typeof packet.ciphertext === 'string' && packet.ciphertext.length === 0
      ? Buffer.alloc(0)
      : assertBase64(packet.ciphertext, 'ciphertext');
    if (ciphertext.length > this.maxPayloadBytes) throw packageError('ciphertext excede o limite permitido.');
    return { ...packet, iv, authTag, ciphertext };
  }

  decryptBuffer(packet) {
    const validated = this.validate(packet);
    const crypto = this.keyResolver(validated.keyId);
    if (!crypto || typeof crypto.decryptBuffer !== 'function') {
      throw packageError('não há chave disponível para keyId.');
    }
    try {
      return crypto.decryptBuffer(validated, packageAad(validated));
    } catch {
      throw packageError('a autenticação AES-GCM falhou.');
    }
  }

  decryptText(packet) {
    return this.decryptBuffer(packet).toString('utf8');
  }

  decryptJson(packet) {
    try {
      return JSON.parse(this.decryptText(packet));
    } catch {
      throw packageError('o conteúdo JSON descriptografado é inválido.');
    }
  }
}
