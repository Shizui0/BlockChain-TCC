import { CryptoService } from './crypto-service.js';

function keyError(message, code = 'MEDCHAIN_KEY_CONFIG_INVALID') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function keyId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw keyError('Identificador de chave inválido.');
  }
  return value;
}

function decodeKey(value, label, allowHex) {
  if (typeof value !== 'string' || !value) throw keyError(`${label} deve ser configurada.`);
  const hex = allowHex && /^[a-f\d]{64}$/i.test(value);
  if (!hex && (!/^[A-Za-z0-9+/]{43}=$/.test(value)
    || Buffer.from(value, 'base64').toString('base64') !== value)) {
    throw keyError(`${label} deve conter exatamente 32 bytes em Base64 canônico${allowHex ? ' ou hexadecimal' : ''}.`);
  }
  const key = Buffer.from(value, hex ? 'hex' : 'base64');
  if (key.length !== 32) throw keyError(`${label} deve conter exatamente 32 bytes.`);
  return key;
}

function previousKeys(value, label) {
  if (!value) return {};
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw keyError(`${label} deve ser um objeto JSON válido.`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw keyError(`${label} deve ser um objeto JSON de identificadores para chaves Base64.`);
  }
  return parsed;
}

export class KeyManagementService {
  #keys = new Map();

  constructor({ activeKey, activeKeyId, previous = {}, allowHex = false, keyLabel = 'Chave' }) {
    this.activeKeyId = keyId(activeKeyId);
    this.#keys.set(this.activeKeyId, new CryptoService(decodeKey(activeKey, keyLabel, allowHex), this.activeKeyId));
    for (const [id, value] of Object.entries(previous)) {
      keyId(id);
      if (this.#keys.has(id)) throw keyError('Identificador de chave duplicado.');
      this.#keys.set(id, new CryptoService(decodeKey(value, 'Chave anterior', allowHex), id));
    }
    Object.freeze(this);
  }

  static fromTransferEnvironment(env = process.env) {
    return new KeyManagementService({
      activeKey: env.MEDCHAIN_TRANSFER_KEY,
      activeKeyId: env.MEDCHAIN_TRANSFER_KEY_ID ?? 'transfer-v1',
      previous: previousKeys(env.MEDCHAIN_TRANSFER_PREVIOUS_KEYS, 'MEDCHAIN_TRANSFER_PREVIOUS_KEYS'),
      keyLabel: 'MEDCHAIN_TRANSFER_KEY'
    });
  }

  static fromDatabaseConfig(config) {
    return new KeyManagementService({
      activeKey: config.masterKey,
      activeKeyId: config.keyVersion,
      previous: previousKeys(config.previousMasterKeys, 'MEDCHAIN_PREVIOUS_MASTER_KEYS'),
      allowHex: true,
      keyLabel: 'MEDCHAIN_MASTER_KEY'
    });
  }

  getActiveCryptoService() { return this.#keys.get(this.activeKeyId); }

  resolveCryptoService(id) { return this.#keys.get(id); }

  #forProtectedValue(value) {
    const crypto = this.resolveCryptoService(value?.keyVersion);
    if (!crypto) throw keyError('Não foi possível descriptografar.', 'UNKNOWN_KEY_ID');
    return crypto;
  }

  encrypt(value, context) { return this.getActiveCryptoService().encrypt(value, context); }
  encryptBuffer(value, context) { return this.getActiveCryptoService().encryptBuffer(value, context); }
  decrypt(value, context) { return this.#forProtectedValue(value).decrypt(value, context); }
  decryptBuffer(value, context) { return this.#forProtectedValue(value).decryptBuffer(value, context); }
}
