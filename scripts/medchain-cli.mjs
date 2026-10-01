import 'dotenv/config';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { CryptoService } from '../backend/src/services/crypto-service.js';
import { DEFAULT_MAX_PACKAGE_BYTES, MedChainPackageService, verifyMedChainFingerprint } from '../backend/src/services/medchain-package-service.js';

function usage() {
  console.error('Uso: npm run medchain:encrypt -- <arquivo> [--out <pacote.medchain>]');
  console.error('     npm run medchain:decrypt -- <pacote.medchain> [--out <arquivo>]');
  console.error('     npm run medchain:verify -- <pacote.medchain>');
}

function parseArguments(argv) {
  const [input, ...rest] = argv;
  if (!input || rest.length > 2 || (rest.length && (rest[0] !== '--out' || !rest[1]))) return undefined;
  return { input: resolve(input), output: rest[1] ? resolve(rest[1]) : undefined };
}

function contentTypeFor(file) {
  const extension = extname(file).toLowerCase();
  if (extension === '.json') return 'application/json';
  if (['.txt', '.csv', '.md'].includes(extension)) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function configuredMaxPayloadBytes() {
  const maxPayloadBytes = Number(process.env.MEDCHAIN_PACKAGE_MAX_BYTES ?? DEFAULT_MAX_PACKAGE_BYTES);
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new Error('MEDCHAIN_PACKAGE_MAX_BYTES deve ser um inteiro positivo.');
  }
  return maxPayloadBytes;
}

function loadService(maxPayloadBytes) {
  if (!process.env.MEDCHAIN_MASTER_KEY) throw new Error('MEDCHAIN_MASTER_KEY deve ser definido no ambiente ou .env.');
  return new MedChainPackageService({
    cryptoService: new CryptoService(process.env.MEDCHAIN_MASTER_KEY, process.env.MEDCHAIN_KEY_VERSION ?? 'v1'),
    keyId: process.env.MEDCHAIN_KEY_VERSION ?? 'v1',
    maxPayloadBytes
  });
}

async function main() {
  const [operation, ...argv] = process.argv.slice(2);
  const args = parseArguments(argv);
  if (!args || !['encrypt', 'decrypt', 'verify'].includes(operation)
    || (operation === 'verify' && args.output)) {
    usage();
    process.exitCode = 2;
    return;
  }
  const maxPayloadBytes = configuredMaxPayloadBytes();
  const service = operation === 'verify' ? undefined : loadService(maxPayloadBytes);
  const inputStat = await stat(args.input);
  const maxPackageFileBytes = Math.ceil(maxPayloadBytes * 4 / 3) + 4096;
  if (inputStat.size > (operation === 'encrypt' ? maxPayloadBytes : maxPackageFileBytes)) {
    throw new Error(`Arquivo excede o limite configurado para esta operação (${maxPayloadBytes} bytes de payload).`);
  }
  if (operation === 'encrypt') {
    const source = await readFile(args.input);
    const packet = service.encryptBuffer(source, { contentType: contentTypeFor(args.input) });
    const output = args.output ?? `${args.input}.medchain`;
    await writeFile(output, `${JSON.stringify(packet)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.log(`Pacote .medchain criado (${source.length} bytes protegidos).`);
    return;
  }
  const raw = await readFile(args.input, 'utf8');
  let packet;
  try {
    packet = JSON.parse(raw);
  } catch {
    throw new Error('Pacote .medchain não contém JSON válido.');
  }
  if (operation === 'verify') {
    const result = verifyMedChainFingerprint(packet, maxPayloadBytes);
    if (result.legacy) {
      console.log('Pacote v1 sem fingerprint SHA-256; use decrypt para autenticar com AES-GCM.');
      process.exitCode = 2;
    } else if (!result.valid) {
      console.error('Fingerprint SHA-256 divergente. Nenhum conteúdo foi descriptografado.');
      process.exitCode = 1;
    } else {
      console.log('Fingerprint SHA-256 válido. Nenhum conteúdo foi descriptografado; isto não prova autenticidade.');
    }
    return;
  }
  const plaintext = service.decryptBuffer(packet);
  if (args.output) {
    await writeFile(args.output, plaintext, { flag: 'wx', mode: 0o600 });
    console.log(`Pacote validado e exportado (${plaintext.length} bytes).`);
  } else {
    console.log(`Pacote validado e descriptografado em memória (${plaintext.length} bytes). Use --out para exportar.`);
  }
}

main().catch((error) => {
  const safeMessage = error.code === 'MEDCHAIN_PACKAGE_INVALID' || !error.code
    ? error.message : 'não foi possível ler ou gravar o arquivo solicitado.';
  console.error(`Falha no pacote .medchain: ${safeMessage}`);
  process.exitCode = 1;
});
