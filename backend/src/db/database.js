import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { schema } from './schema.js';

export function createDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  if (path !== ':memory:') database.pragma('journal_mode = WAL');
  database.exec(schema);
  return database;
}
