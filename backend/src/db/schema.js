export const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PATIENT', 'PROFESSIONAL', 'ADMIN')),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  synthetic INTEGER NOT NULL DEFAULT 1 CHECK (synthetic IN (0, 1))
);

CREATE TABLE IF NOT EXISTS professionals (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  registration TEXT NOT NULL,
  organization_type TEXT NOT NULL DEFAULT 'PRACTITIONER'
);

CREATE TABLE IF NOT EXISTS medical_records (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(user_id),
  created_by TEXT NOT NULL REFERENCES users(id),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('Encounter', 'Observation', 'Immunization')),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_patient ON medical_records(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS record_integrity (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm = 'SHA-256'),
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integrity_record ON record_integrity(record_id, created_at DESC);

CREATE TABLE IF NOT EXISTS medical_documents (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(user_id),
  created_by TEXT NOT NULL REFERENCES users(id),
  storage_name TEXT NOT NULL UNIQUE,
  file_iv TEXT NOT NULL,
  file_auth_tag TEXT NOT NULL,
  metadata_ciphertext TEXT NOT NULL,
  metadata_iv TEXT NOT NULL,
  metadata_auth_tag TEXT NOT NULL,
  key_version TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_patient
  ON medical_documents(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_integrity (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  protected_hash TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm = 'SHA-256'),
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_integrity
  ON document_integrity(document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(user_id),
  professional_id TEXT NOT NULL REFERENCES professionals(user_id),
  permission TEXT NOT NULL CHECK (permission IN ('READ', 'WRITE', 'READ_WRITE')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consents_lookup
  ON consents(patient_id, professional_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  patient_id TEXT REFERENCES patients(user_id),
  resource_id TEXT,
  timestamp TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_events(patient_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS ledger_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_subject ON ledger_events(subject_ref, created_at DESC);

CREATE TABLE IF NOT EXISTS family_history (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(user_id),
  created_by TEXT NOT NULL REFERENCES users(id),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_family_patient ON family_history(patient_id, created_at DESC);
`;
