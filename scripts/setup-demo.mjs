import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Local-only preparation. Never replace a key used by an existing database.
const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const environment = template
  .replace('SUBSTITUA_POR_32_BYTES_EM_BASE64', randomBytes(32).toString('base64'))
  .replace('SUBSTITUA_POR_UM_SEGREDO_ALEATORIO_LONGO', randomBytes(48).toString('base64url'));
try {
  writeFileSync(new URL('../.env', import.meta.url), environment, { flag: 'wx', mode: 0o600 });
  console.log('.env local criado com segredos aleatórios. Use somente dados sintéticos.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env existente preservado. As chaves não foram alteradas.');
}
