import { randomBytes } from 'node:crypto';

if (process.argv.length !== 2) {
  console.error('Uso: npm run medchain:keygen');
  process.exitCode = 2;
} else {
  console.error('ATENÇÃO: este segredo será exibido uma única vez. Guarde-o em local seguro; não o registre no Git.');
  console.log(randomBytes(32).toString('base64'));
}
