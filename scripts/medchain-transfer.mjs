import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { KeyManagementService } from '../backend/src/services/key-management-service.js';
import { DEFAULT_MAX_PACKAGE_BYTES } from '../backend/src/services/medchain-package-service.js';
import { createTransferReceiver, sendMedChainPackage } from '../backend/src/services/medchain-transfer-service.js';

function usage() {
  console.error('Uso: npm run medchain:receive -- --host <IP-privado> --port <porta> --cert <cert.pem> --key <key.pem> --out-dir <diretório>');
  console.error('     npm run medchain:send -- <pacote.medchain> --to https://<IP-privado>:<porta> --ca <cert.pem>');
}

function parseOptions(args, required, positional = false) {
  const result = {};
  const remaining = [...args];
  if (positional) result.input = remaining.shift();
  while (remaining.length) {
    const name = remaining.shift();
    const value = remaining.shift();
    if (!required.includes(name) || !value || Object.hasOwn(result, name)) return undefined;
    result[name] = value;
  }
  if ((positional && (!result.input || result.input.startsWith('--')))
    || required.some((name) => !result[name])) return undefined;
  return result;
}

function maxPayloadBytes() {
  const value = Number(process.env.MEDCHAIN_PACKAGE_MAX_BYTES ?? DEFAULT_MAX_PACKAGE_BYTES);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Limite de pacote inválido.');
  return value;
}

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  const options = operation === 'receive'
    ? parseOptions(args, ['--host', '--port', '--cert', '--key', '--out-dir'])
    : operation === 'send' ? parseOptions(args, ['--to', '--ca'], true) : undefined;
  if (!options) {
    usage();
    process.exitCode = 2;
    return;
  }
  const keys = KeyManagementService.fromTransferEnvironment();
  const maxPayload = maxPayloadBytes();
  if (operation === 'receive') {
    const port = Number(options['--port']);
    if (!/^\d+$/.test(options['--port']) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Porta inválida.');
    }
    const cert = await readFile(resolve(options['--cert']));
    const privateKey = await readFile(resolve(options['--key']));
    const server = await createTransferReceiver({
      keys, cert, privateKey, host: options['--host'],
      outputDirectory: resolve(options['--out-dir']), maxPayloadBytes: maxPayload
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(port, options['--host'], resolveListen);
    });
    console.log(`Receptor .medchain pronto em HTTPS na porta ${port}. Pacotes permanecem cifrados; Ctrl+C para encerrar.`);
    return;
  }
  const input = resolve(options.input);
  const size = (await stat(input)).size;
  if (size > Math.ceil(maxPayload * 4 / 3) + 4096) throw new Error('Pacote excede o limite.');
  let packet;
  try { packet = JSON.parse(await readFile(input, 'utf8')); }
  catch { throw new Error('Pacote inválido.'); }
  const result = await sendMedChainPackage({
    packet, destination: options['--to'], ca: await readFile(resolve(options['--ca'])),
    keys, maxPayloadBytes: maxPayload
  });
  console.log(`Transferência confirmada pelo receptor: packageId ${result.packageId}. Nenhum conteúdo clínico foi exibido.`);
}

main().catch((error) => {
  const safe = error.code === 'MEDCHAIN_TRANSFER_FAILED' ? error.message
    : process.argv[2] === 'receive' ? 'Não foi possível iniciar o receptor.' : 'Não foi possível transferir o pacote.';
  console.error(safe);
  process.exitCode = 1;
});
