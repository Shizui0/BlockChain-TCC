import { createApp } from './app.js';

const { app, database, config } = await createApp();
const server = app.listen(config.port, () => {
  console.log(`MedChain disponível em http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
