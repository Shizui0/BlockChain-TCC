import { AuditService } from './audit-service.js';
import { ConsentService } from './consent-service.js';
import { CryptoService } from './crypto-service.js';
import { FamilyHistoryService } from './family-history-service.js';
import { IntegrityService } from './integrity-service.js';
import { LedgerService } from './ledger-service.js';
import { RecordService } from './record-service.js';

export function createServices(database, config) {
  const crypto = new CryptoService(config.masterKey, config.keyVersion);
  const audit = new AuditService(database);
  const ledger = new LedgerService(database);
  const integrity = new IntegrityService(database, ledger);
  const consents = new ConsentService(database, audit, ledger);
  const records = new RecordService(database, crypto, integrity, consents, audit);
  const familyHistory = new FamilyHistoryService(database, crypto);
  return { crypto, audit, ledger, integrity, consents, records, familyHistory };
}
