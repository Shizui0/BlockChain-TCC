export const RECORD_RESOURCE_TYPES = ['Encounter', 'Observation', 'Immunization'];

export function patientToFhir(user) {
  return {
    resourceType: 'Patient',
    id: user.id,
    active: true,
    name: [{ text: user.displayName }],
    meta: { tag: [{ code: 'synthetic', display: 'Dado sintético de demonstração' }] }
  };
}

export function practitionerToFhir(user) {
  return {
    resourceType: 'Practitioner',
    id: user.id,
    active: true,
    name: [{ text: user.displayName }],
    identifier: [{ system: 'urn:medchain:demo-registration', value: user.registration }]
  };
}

export function recordToFhir(record, clinicalData) {
  const base = {
    resourceType: record.resourceType,
    id: record.id,
    status: clinicalData.status ?? 'final',
    subject: { reference: `Patient/${record.patientId}` },
    meta: { tag: [{ code: 'synthetic', display: 'Dado sintético de demonstração' }] }
  };
  if (clinicalData.code) base.code = { text: clinicalData.code };
  if (record.resourceType === 'Observation' && clinicalData.value !== undefined) {
    base.valueString = String(clinicalData.value);
  }
  if (record.resourceType === 'Encounter') {
    base.class = { code: clinicalData.class ?? 'AMB', display: 'Ambulatorial' };
  }
  if (record.resourceType === 'Immunization') {
    base.vaccineCode = { text: clinicalData.code ?? 'Vacina sintética' };
    base.occurrenceDateTime = clinicalData.occurrenceDateTime ?? record.createdAt;
    if (clinicalData.dose) base.protocolApplied = [{ doseNumberString: clinicalData.dose }];
    if (clinicalData.institution) base.location = { display: clinicalData.institution };
  }
  return base;
}
