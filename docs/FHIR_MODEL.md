# Modelo FHIR inicial

O MedChain utiliza conceitos do HL7 FHIR para organizar o domínio, mas ainda não é um servidor FHIR completo e os objetos não foram validados contra perfis nacionais.

| Conceito MedChain | Recurso FHIR | Implementação atual |
|---|---|---|
| Paciente | `Patient` | `/api/patients/me` retorna representação mínima com tag sintética |
| Profissional | `Practitioner` | `/api/professionals` inclui identificador de demonstração |
| Consulta | `Encounter` | `medical_records.resource_type = Encounter` |
| Observação/exame | `Observation` | código e valor sintético no payload cifrado |
| Vacinação | `Immunization` | vacina e ocorrência no payload cifrado |
| Consentimento | `Consent` | tabela `consents`, permissão, validade e revogação |
| Histórico familiar | `FamilyMemberHistory` | relação e condições no payload cifrado |

## Estrutura interna de registro

```json
{
  "resourceType": "Observation",
  "clinicalData": {
    "code": "Exame sintético",
    "status": "final",
    "value": "Resultado fictício",
    "note": "Não representa uma pessoa real"
  }
}
```

Somente `resourceType` e metadados técnicos mínimos ficam visíveis no banco. `clinicalData` inteiro é cifrado. Após autorização e descriptografia, a API adiciona uma representação FHIR parcial para demonstração.

## Próximos passos

1. selecionar versão FHIR e perfis brasileiros relevantes;
2. introduzir `Coding`, sistemas terminológicos e identificadores com governança;
3. validar cardinalidades e invariantes;
4. criar testes contra exemplos oficiais;
5. avaliar integração com servidor FHIR separado, mantendo o cofre criptográfico.
