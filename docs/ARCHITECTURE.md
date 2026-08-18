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
             │    ├─ CryptoService
             │    ├─ RecordService
             │    ├─ ConsentService
             │    ├─ AuditService
             │    ├─ IntegrityService
             │    └─ LedgerService
             └─ SQLite via consultas preparadas
```

## Modelo de dados

| Tabela | Responsabilidade |
|---|---|
| `users` | Identidade, papel e hash bcrypt |
| `patients` | Perfil de paciente sintético |
| `professionals` | Registro profissional/organizacional sintético |
| `medical_records` | Payload clínico cifrado e metadados mínimos |
| `record_integrity` | SHA-256 do registro protegido |
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

## Autorização

- paciente acessa somente o próprio prontuário;
- administrador possui caminho técnico reservado, ainda sem interface;
- profissional precisa de consentimento não revogado, não expirado e compatível com `READ` ou `WRITE`;
- cada falha gera `ACCESS_DENIED` associada ao paciente e sem conteúdo clínico;
- a revogação atualiza o consentimento dentro de transação e afeta a próxima requisição.

## Migração para PostgreSQL

1. substituir `db/database.js` por pool PostgreSQL;
2. converter o schema em migrações versionadas;
3. manter os serviços e contratos REST;
4. usar transações com isolamento explícito;
5. criar papéis de banco separados para aplicação, migração e leitura operacional.

## Evolução criptográfica

O MVP usa uma chave mestra externa ao código. A evolução recomendada é envelope encryption: uma DEK aleatória por paciente ou registro cifra o dado; a DEK é cifrada por uma KEK mantida em KMS/HSM. A referência e a versão da chave permanecem no banco, permitindo rotação sem expor material criptográfico.
