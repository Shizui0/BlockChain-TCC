# MedChain

MVP acadêmico de histórico médico controlado pelo paciente, com registros clínicos cifrados, consentimento temporário, auditoria e uma abstração de ledger para provas de integridade. Todo dado incluído no projeto é sintético e não representa pessoas reais.

> O MedChain não está pronto para uso assistencial e não afirma conformidade com a LGPD. A arquitetura foi projetada considerando princípios de privacidade e segurança, mas conformidade real exige validação jurídica, organizacional, operacional e técnica independente.

## Fluxo demonstrável

1. Paciente Teste autentica-se.
2. Cria um `Observation`, `Encounter` ou `Immunization` sintético.
3. O backend serializa e cifra o conteúdo com AES-256-GCM.
4. SQLite recebe apenas `ciphertext`, IV, tag de autenticação e versão da chave.
5. SHA-256 é calculado sobre a representação canônica do registro protegido.
6. O hash é persistido na tabela de integridade e no ledger local de demonstração.
7. O paciente concede ao Médico Teste acesso temporário `READ`, `WRITE` ou `READ_WRITE`.
8. O profissional consulta os registros permitidos; a visualização é auditada.
9. O paciente revoga o consentimento e novos acessos são negados imediatamente.
10. A tentativa negada gera `ACCESS_DENIED` e a integridade pode ser verificada novamente.

## Arquitetura

```text
frontend/public
      │ HTTPS/same-origin em produção
      ▼
Express REST API ── autenticação/cookies HttpOnly
      │
      ├── autorização por papel + consentimento
      ├── AES-256-GCM ── MEDCHAIN_MASTER_KEY
      ├── SHA-256 ────── record_integrity
      ├── auditoria ──── audit_events
      └── LedgerService ─ ledger_events (mock persistente)
                         │
                         ▼ futuro
                  Hyperledger Fabric
```

O MVP utiliza SQLite por simplicidade local. O acesso está concentrado em serviços e consultas preparadas, permitindo substituir a persistência por PostgreSQL sem alterar o contrato HTTP ou a interface de criptografia.

## Requisitos

- Node.js 22 ou superior;
- npm;
- nenhuma instalação local de PostgreSQL é necessária nesta fase.

## Configuração

```powershell
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copie o primeiro valor para `MEDCHAIN_MASTER_KEY` e o segundo para `JWT_SECRET` no arquivo `.env`. O `.env` é ignorado pelo Git.

Depois execute:

```bash
npm install
npm run dev
```

Acesse `http://localhost:4173`. Com `SEED_DEMO=true`, o servidor cria os dados sintéticos de forma idempotente. Também é possível executar `npm run seed` manualmente.

### Contas sintéticas

Senha comum: `MedChainDemo123!`

| Papel | E-mail |
|---|---|
| Paciente Teste | `paciente@demo.medchain.local` |
| Médico Teste | `medico@demo.medchain.local` |
| Hospital Teste | `hospital@demo.medchain.local` |
| Laboratório Teste | `laboratorio@demo.medchain.local` |

Essas credenciais existem apenas para demonstração local.

## Scripts

```bash
npm run dev    # servidor com reinício automático
npm start      # servidor sem watch
npm run seed   # seed sintético idempotente
npm test       # testes automatizados
npm run check  # valida sintaxe de backend, testes e frontend
```

## API inicial

| Método | Rota | Finalidade |
|---|---|---|
| POST | `/api/auth/register` | Cadastro de paciente ou profissional de demonstração |
| POST | `/api/auth/login` | Sessão JWT em cookie HttpOnly |
| POST | `/api/auth/logout` | Encerrar sessão |
| GET | `/api/me` | Identidade autenticada |
| GET | `/api/patients/me` | Perfil do paciente e representação FHIR inicial |
| GET | `/api/professionals` | Profissionais disponíveis para consentimento |
| POST/GET | `/api/records` | Criar ou listar registros autorizados |
| GET | `/api/records/:id` | Consultar um registro autorizado |
| GET | `/api/records/:id/integrity` | Verificar SHA-256 e ledger local |
| POST/GET | `/api/consents` | Conceder ou listar consentimentos |
| DELETE | `/api/consents/:id` | Revogar imediatamente |
| GET | `/api/audit` | Auditoria do paciente |
| POST/GET | `/api/family-history` | Histórico familiar sintético cifrado |

## Controles implementados

- bcrypt com custo 12 para senhas;
- JWT assinado em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção;
- AES-256-GCM com IV aleatório e AAD vinculando o contexto do registro;
- SHA-256 separado da criptografia para verificação de integridade;
- validação estrita com Zod;
- consultas preparadas;
- Helmet, CSP, CORS restrito e rate limiting na autenticação;
- autorização por `PATIENT`, `PROFESSIONAL` e `ADMIN`;
- consentimento temporário, granular e revogável;
- eventos de auditoria sem conteúdo clínico;
- ledger local contendo somente hashes, timestamps, permissões e referências pseudonimizadas.

## Limitações

- SQLite e a chave mestra em variável de ambiente são adequados somente ao MVP local;
- não há MFA, recuperação de conta, gestão institucional ou rotação automatizada de chaves;
- o modelo FHIR é parcial e não substitui validação contra perfis oficiais;
- o ledger local não oferece consenso distribuído;
- não foi realizado pentest;
- cadastro público de profissionais é permitido apenas para facilitar a demonstração;
- TLS deve ser terminado por infraestrutura externa em produção.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Segurança](docs/SECURITY.md)
- [Modelo FHIR](docs/FHIR_MODEL.md)
- [Modelo de ameaças](docs/THREAT_MODEL.md)
- [Ledger e evolução para Fabric](docs/LEDGER.md)

## Roadmap

1. Migrar SQLite para PostgreSQL com migrações versionadas.
2. Implementar OpenID Connect, MFA e gestão institucional de profissionais.
3. Adotar envelope encryption com KMS/HSM e rotação de chaves.
4. Validar recursos contra perfis FHIR selecionados.
5. Substituir o ledger local por adaptador Hyperledger Fabric após definir governança.
6. Executar revisão LGPD especializada, threat modeling contínuo, SAST/DAST e pentest.
