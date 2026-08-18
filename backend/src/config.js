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
  return {
    environment,
    port: Number(overrides.port ?? process.env.PORT ?? 4173),
    databasePath: overrides.databasePath ?? process.env.DATABASE_PATH ?? resolve('backend/data/medchain.sqlite'),
    jwtSecret: strongSecret(overrides.jwtSecret ?? process.env.JWT_SECRET, 'JWT_SECRET'),
    masterKey: required(overrides.masterKey ?? process.env.MEDCHAIN_MASTER_KEY, 'MEDCHAIN_MASTER_KEY'),
    keyVersion: overrides.keyVersion ?? process.env.MEDCHAIN_KEY_VERSION ?? 'v1',
    frontendOrigin: overrides.frontendOrigin ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:4173',
    secureCookies: overrides.secureCookies ?? environment === 'production',
    seedDemo: overrides.seedDemo ?? process.env.SEED_DEMO === 'true'
  };
}
