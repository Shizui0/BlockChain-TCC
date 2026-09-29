import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoService } from '../src/services/crypto-service.js';
import { TEST_MASTER_KEY } from './test-helpers.js';

describe('AES-256-GCM', () => {
  const crypto = new CryptoService(TEST_MASTER_KEY, 'test-v1');
  const context = { recordId: 'registro-teste', patientId: 'paciente-teste', resourceType: 'Observation' };

  test('criptografa e descriptografa dados autenticados', () => {
    const input = { code: 'Exame sintético', value: 'Resultado fictício' };
    const encrypted = crypto.encrypt(input, context);
    assert.notEqual(encrypted.ciphertext, JSON.stringify(input));
    assert.deepEqual(crypto.decrypt(encrypted, context), input);
  });

  test('detecta tag de autenticação adulterada', () => {
    const encrypted = crypto.encrypt({ code: 'Exame sintético' }, context);
    const tag = Buffer.from(encrypted.authTag, 'base64');
    tag[0] ^= 0xff;
    assert.throws(() => crypto.decrypt({ ...encrypted, authTag: tag.toString('base64') }, context));
  });
});
