import bcrypt from 'bcryptjs';

export const DEMO_USERS = Object.freeze({
  patient: { id: '11111111-1111-4111-8111-111111111111', email: 'paciente@demo.medchain.local', role: 'PATIENT', displayName: 'Paciente Teste' },
  doctor: { id: '22222222-2222-4222-8222-222222222222', email: 'medico@demo.medchain.local', role: 'PROFESSIONAL', displayName: 'Médico Teste', registration: 'CRM-DEMO-001', organizationType: 'PRACTITIONER' },
  hospital: { id: '33333333-3333-4333-8333-333333333333', email: 'hospital@demo.medchain.local', role: 'PROFESSIONAL', displayName: 'Hospital Teste', registration: 'ORG-DEMO-002', organizationType: 'HOSPITAL' },
  laboratory: { id: '44444444-4444-4444-8444-444444444444', email: 'laboratorio@demo.medchain.local', role: 'PROFESSIONAL', displayName: 'Laboratório Teste', registration: 'LAB-DEMO-003', organizationType: 'LABORATORY' }
});

export const DEMO_PASSWORD = 'MedChainDemo123!';

export async function seedDatabase(database, services) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const insertUser = database.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, display_name, created_at)
    VALUES (@id, @email, @passwordHash, @role, @displayName, @createdAt)
  `);
  const createdAt = new Date().toISOString();
  for (const user of Object.values(DEMO_USERS)) insertUser.run({ ...user, passwordHash, createdAt });
  database.prepare('INSERT OR IGNORE INTO patients (user_id, synthetic) VALUES (?, 1)')
    .run(DEMO_USERS.patient.id);
  const insertProfessional = database.prepare(`
    INSERT OR IGNORE INTO professionals (user_id, registration, organization_type)
    VALUES (@id, @registration, @organizationType)
  `);
  for (const professional of [DEMO_USERS.doctor, DEMO_USERS.hospital, DEMO_USERS.laboratory]) {
    insertProfessional.run(professional);
  }

  const recordCount = database.prepare('SELECT COUNT(*) AS total FROM medical_records').get().total;
  if (recordCount === 0) {
    services.records.create(DEMO_USERS.patient, {
      resourceType: 'Observation',
      clinicalData: { code: 'Hemograma sintético', status: 'final', value: 'Valores demonstrativos dentro da referência', note: 'Não representa uma pessoa real.' }
    });
    services.records.create(DEMO_USERS.patient, {
      resourceType: 'Encounter',
      clinicalData: { code: 'Consulta clínica demonstrativa', status: 'finished', class: 'AMB', note: 'Atendimento inteiramente fictício.' }
    });
    services.records.create(DEMO_USERS.patient, {
      resourceType: 'Immunization',
      clinicalData: { code: 'Influenza — dose sintética', status: 'completed', occurrenceDateTime: new Date().toISOString() }
    });
  }

  const familyCount = database.prepare('SELECT COUNT(*) AS total FROM family_history').get().total;
  if (familyCount === 0) {
    services.familyHistory.create(DEMO_USERS.patient, {
      relationship: 'FATHER',
      relativeLabel: 'Pai fictício',
      conditions: ['Hipertensão sintética'],
      notes: 'Exemplo acadêmico; não representa histórico familiar real.'
    });
  }
}
