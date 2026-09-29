# Changelog

## MedChain Presentation v1 — candidata a congelamento

**Protótipo acadêmico / MVP.** Base: `cf4f20343a8b930791455abfad300c0fca3695ae`,
merge do PR #3, contendo consolidação (1.1), correções/testes (1.2) e organização (1.3).

### Preparação da apresentação

- Roteiro oficial, usuários sintéticos, preparação, resultados esperados e Plano B.
- `npm run demo:setup` gera `.env` local sem substituir chaves existentes.
- Seed explícito no ambiente de exemplo; nenhuma mudança de schema ou contrato HTTP.
- Regressão integrada do roteiro com SQLite em disco, seed repetido, consentimento,
  revogação, auditoria, cifragem e replay de cookie após logout.
- CI registra instalação, testes, sintaxe, audit, seed e início do servidor.
- Checagem sintática inclui scripts de apresentação.

### Funcionalidades existentes preservadas

- Login paciente/profissional, registros Observation/Encounter/Immunization,
  documentos PDF/PNG/JPEG cifrados, vacinação e histórico familiar sintético.
- Consentimentos READ/WRITE/READ_WRITE com prazo e revogação; auditoria do paciente.
- AES-256-GCM, integridade SHA-256, ledger local, cookies HttpOnly e sessões revogáveis.

### Segurança e testes

Resultados e pendências estão em [docs/RELEASE_VALIDATION.md](docs/RELEASE_VALIDATION.md).
Não usar dados reais. Nenhuma afirmação de conformidade total LGPD, operação hospitalar,
pentest completo ou blockchain distribuída pronta. Credenciais demo são públicas.

### Limitações e futuro

SQLite local, chave mestra em `.env`, FHIR parcial, ausência de consenso distribuído,
MFA e gestão institucional. Revogação não remove cópias já lidas/baixadas.
PC→PC, Electron, PostgreSQL, KMS/HSM e Fabric estão fora desta release.
A branch só deve ser declarada congelada depois de resolver as pendências registradas.
Não criar/sobrescrever tag para sugerir validação ainda não realizada.
