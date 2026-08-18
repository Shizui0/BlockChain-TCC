import { loadConfig } from '../config.js';
import { createDatabase } from './database.js';
import { seedDatabase } from './seed.js';
import { createServices } from '../services/index.js';

const config = loadConfig();
const database = createDatabase(config.databasePath);
try {
  await seedDatabase(database, createServices(database, config));
  console.log('Dados sintéticos de demonstração criados com sucesso.');
} finally {
  database.close();
}
