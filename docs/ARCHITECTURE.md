# Arquitetura do MVP

## Objetivos

- manter dados clínicos fora do ledger;
- dar ao paciente controle explícito sobre acessos;
- separar confidencialidade, integridade e auditoria;
- produzir um MVP pequeno e substituível, não uma infraestrutura assistencial completa.

## Camadas

```text
Browser
  └─ frontend/public: interface sem armazenamento clínico local
        └─ API REST Express
             ├─ autenticação JWT/cookie
             ├─ validação e autorização
             ├─ serviços de domínio
             │    ├─ Auth: rota + middleware de sessão JWT
             │    ├─ CryptoService: AES-256-GCM e AAD canônica
             │    ├─ RecordService: prontuários e projeção FHIR
             │    ├─ DocumentService: arquivos cifrados e metadados
             │    ├─ ConsentService: permissões e revogação
             │    ├─ AuditService: eventos sem conteúdo clínico
             │    ├─ IntegrityService: SHA-256 e verificação
             │    ├─ LedgerService: prova local pseudonimizada
             │    ├─ FamilyHistoryService: histórico familiar cifrado
             │    └─ FHIRService: mapeamentos FHIR parciais
             └─ SQLite via consultas preparadas
```

## Organização de código

```text
frontend/public/       interface e cliente REST
backend/src/
├── config/            configuração de ambiente validada
├── db/                conexão, schema e seed
├── middleware/        sessão, papéis, validação e tratamento de erros
├── routes/            endpoints e schemas de entrada
├── services/          regras de domínio e persistência coordenada
└── utils/             serialização canônica, async handler e acesso compartilhado
backend/test/          regressões de integração e segurança
docs/                  decisões, segurança, FHIR, ledger e ameaças
```

`backend/src/config.js` reexporta a configuração de `config/index.js` para manter compatibilidade com importações internas históricas. Novos módulos devem usar `config/index.js` diretamente. A configuração vem de ambiente, é exemplificada em `.env.example` e nunca inclui segredos reais no repositório.

## Modelo de dados

| Tabela | Responsabilidade |
|---|---|
| `users` | Identidade, papel e hash bcrypt |
| `patients` | Perfil de paciente sintético |
| `professionals` | Registro profissional/organizacional sintético |
| `medical_records` | Payload clínico cifrado e metadados mínimos |
| `record_integrity` | SHA-256 do registro protegido |
| `medical_documents` | Referência do arquivo cifrado e metadados cifrados |
| `document_integrity` | SHA-256 dos bytes originais e da projeção protegida |
| `consents` | Permissão, expiração e revogação |
| `audit_events` | Quem realizou qual ação e quando |
| `ledger_events` | Mock persistente de hashes e consentimentos pseudonimizados |
| `family_history` | Histórico familiar cifrado |

## Criação de registro

```text
JSON clínico validado
  → serialização canônica
  → AES-256-GCM + IV aleatório + AAD
  → medical_records
  → projeção determinística do registro protegido
  → SHA-256
  → record_integrity + LedgerService
  → RECORD_CREATED na auditoria
```

AES-256-GCM fornece confidencialidade e autenticação do ciphertext. SHA-256 fornece uma impressão determinística para comparar integridade e registrar uma prova fora do armazenamento clínico.

Na leitura, o serviço compara a projeção canônica do registro com `record_integrity` e com o evento correspondente em `ledger_events`. Falhas impedem a apresentação do dado e são auditadas. O ledger permanece no mesmo SQLite; portanto não equivale a um trust anchor independente.

## Upload de prontuário

```text
multipart PDF/PNG/JPEG validado e limitado
  → SHA-256 dos bytes originais
  → AES-256-GCM do arquivo em memória
  → ciphertext em backend/data/uploads/<UUID>.enc
  → metadados cifrados em medical_documents
  → SHA-256 da projeção protegida
  → document_integrity + LedgerService
```

O nome original e a descrição ficam dentro do payload de metadados cifrado. O download só ocorre após autorização e confirmação das provas de integridade.

## Pacote `.medchain` v2

```text
Buffer → AES-256-GCM (AAD técnica canônica) → pacote versionado
       → SHA-256 canônico do pacote, sem o campo integrity
       → { integrity: { algorithm: "SHA-256", digest } }
```

`verifyFingerprint` valida a estrutura e compara o digest sem descriptografar; é uma verificação de corrupção, não uma prova de autoria. `decryptBuffer` exige digest válido, resolve a chave por `keyId`, verifica AES-GCM e somente então entrega o Buffer completo em memória. `format`, `version`, `packageId`, `createdAt`, `algorithm`, `keyId` e `contentType` são AAD no v2. O leitor mantém compatibilidade com pacotes v1 sem digest, usando a AAD v1.

## Autorização

- paciente acessa somente o próprio prontuário;
- administrador possui caminho técnico reservado, ainda sem interface;
- profissional precisa de consentimento não revogado, não expirado e compatível com `READ` ou `WRITE`;
- cada falha gera `ACCESS_DENIED` associada ao paciente e sem conteúdo clínico;
- a revogação atualiza o consentimento dentro de transação e afeta a próxima requisição.

## Limites de responsabilidade

- rotas validam a entrada e traduzem requisições/respostas HTTP;
- middleware autentica, aplica papéis e uniformiza erros;
- serviços concentram regras, transações, criptografia, integridade e auditoria;
- `db/` contém apenas conexão, schema e dados sintéticos de demonstração;
- `utils/` contém helpers sem regra clínica, como serialização determinística e resolução reutilizável do paciente alvo.

## Migração para PostgreSQL

1. substituir `db/database.js` por pool PostgreSQL;
2. converter o schema em migrações versionadas;
3. manter os serviços e contratos REST;
4. usar transações com isolamento explícito;
5. criar papéis de banco separados para aplicação, migração e leitura operacional.

## Evolução criptográfica

O MVP usa uma chave mestra externa ao código. A evolução recomendada é envelope encryption: uma DEK aleatória por paciente ou registro cifra o dado; a DEK é cifrada por uma KEK mantida em KMS/HSM. A referência e a versão da chave permanecem no banco, permitindo rotação sem expor material criptográfico.
