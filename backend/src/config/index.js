import 'dotenv/config';
import { resolve } from 'node:path';

function required(value, name) {
  if (!value) throw new Error(`${name} deve ser definido no ambiente.`);
  return value;
}

function strongSecret(value, name) {
  const secret = required(value, name);
  if (secret.length < 32) throw new Error(`${name} deve conter pelo menos 32 caracteres.`);
  return secret;
}

export function loadConfig(overrides = {}) {
  const environment = overrides.environment ?? process.env.NODE_ENV ?? 'development';
  const config = {
    environment,
    port: Number(overrides.port ?? process.env.PORT ?? 4173),
    databasePath: overrides.databasePath ?? process.env.DATABASE_PATH ?? resolve('backend/data/medchain.sqlite'),
    uploadDirectory: overrides.uploadDirectory ?? process.env.UPLOAD_DIRECTORY ?? resolve('backend/data/uploads'),
    maxUploadBytes: Number(overrides.maxUploadBytes ?? process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
    jwtSecret: strongSecret(overrides.jwtSecret ?? process.env.JWT_SECRET, 'JWT_SECRET'),
    masterKey: required(overrides.masterKey ?? process.env.MEDCHAIN_MASTER_KEY, 'MEDCHAIN_MASTER_KEY'),
    keyVersion: overrides.keyVersion ?? process.env.MEDCHAIN_KEY_VERSION ?? 'v1',
    frontendOrigin: overrides.frontendOrigin ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:4173',
    secureCookies: overrides.secureCookies ?? environment === 'production',
    seedDemo: overrides.seedDemo ?? process.env.SEED_DEMO === 'true'
  };
  if (!Number.isInteger(config.maxUploadBytes) || config.maxUploadBytes < 1024) {
    throw new Error('MAX_UPLOAD_BYTES deve ser um número inteiro de pelo menos 1024 bytes.');
  }
  return config;
}
