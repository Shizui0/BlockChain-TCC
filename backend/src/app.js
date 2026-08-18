import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { createDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { createServices } from './services/index.js';
import { createAuthMiddleware, requireRole } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './routes/auth.js';
import { createPatientsRouter } from './routes/patients.js';
import { createProfessionalsRouter } from './routes/professionals.js';
import { createRecordsRouter } from './routes/records.js';
import { createConsentsRouter } from './routes/consents.js';
import { createAuditRouter } from './routes/audit.js';
import { createFamilyHistoryRouter } from './routes/family-history.js';

const frontendRoot = resolve(fileURLToPath(new URL('../../frontend/public', import.meta.url)));

export async function createApp(options = {}) {
  const config = loadConfig(options.config);
  const database = options.database ?? createDatabase(config.databasePath);
  const services = createServices(database, config);
  if (options.seed ?? config.seedDemo) await seedDatabase(database, services);

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    }
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin === config.frontendOrigin) return callback(null, true);
      callback(new Error('Origem CORS não autorizada.'));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '64kb', type: 'application/json' }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.environment === 'test' ? 1000 : 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente mais tarde.' } }
  });
  app.use('/api/auth', authLimiter, createAuthRouter({ database, config, audit: services.audit }));

  const authenticate = createAuthMiddleware(config, database);
  app.use('/api/patients', authenticate, requireRole('PATIENT'), createPatientsRouter(database));
  app.use('/api/professionals', authenticate, createProfessionalsRouter(database));
  app.use('/api/records', authenticate, createRecordsRouter(services.records));
  app.use('/api/consents', authenticate, requireRole('PATIENT', 'PROFESSIONAL'), createConsentsRouter(services.consents));
  app.use('/api/audit', authenticate, createAuditRouter(services.audit));
  app.use('/api/family-history', authenticate, createFamilyHistoryRouter(services.familyHistory));

  app.use('/api', notFoundHandler);
  app.use(express.static(frontendRoot, { extensions: ['html'] }));
  app.use((request, response, next) => {
    if (request.method === 'GET') return response.sendFile(resolve(frontendRoot, 'index.html'));
    next();
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.database = database;
  app.locals.services = services;
  app.locals.config = config;
  return { app, database, services, config };
}
