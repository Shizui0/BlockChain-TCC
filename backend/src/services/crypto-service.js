import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { canonicalJson } from '../utils/canonical-json.js';

function decodeMasterKey(value) {
  const key = /^[a-f\d]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error('MEDCHAIN_MASTER_KEY deve representar exatamente 32 bytes em base64 ou hexadecimal.');
  }
  return key;
}

export class CryptoService {
  constructor(masterKey, keyVersion = 'v1') {
    this.key = decodeMasterKey(masterKey);
    this.keyVersion = keyVersion;
  }

  encrypt(value, context) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(canonicalJson(context)));
    const ciphertext = Buffer.concat([
      cipher.update(canonicalJson(value), 'utf8'),
      cipher.final()
    ]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.keyVersion
    };
  }

  decrypt(protectedValue, context) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(protectedValue.iv, 'base64')
    );
    decipher.setAAD(Buffer.from(canonicalJson(context)));
    decipher.setAuthTag(Buffer.from(protectedValue.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(protectedValue.ciphertext, 'base64')),
      decipher.final()
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  }
}
