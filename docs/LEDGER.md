# Ledger de integridade e consentimento

## Princípio

Dados clínicos nunca são enviados ao ledger. `LedgerService` registra somente:

- SHA-256 de registro protegido;
- algoritmo e timestamp;
- permissão e expiração de consentimento;
- revogação;
- referência pseudonimizada derivada de UUID técnico.

Não são registrados nome, CPF, diagnóstico, exame, documento, dado genético ou payload clínico.

## Contrato atual

```text
registerRecordHash(recordId, hash, timestamp)
registerConsentGrant(consent)
registerConsentRevocation(consentId, revokedAt)
verifyRecordHash(recordId, hash)
```

A implementação local persiste eventos em `ledger_events`. Ela permite demonstrar o fluxo e testar o contrato, mas não oferece imutabilidade distribuída.

## Adaptação para Hyperledger Fabric

1. manter a interface do serviço;
2. substituir o adaptador SQLite por Fabric Gateway;
3. mapear instituições para MSPs e certificados;
4. definir política de endorsement e canais/coleções privadas;
5. usar UUIDs aleatórios ou identificadores pseudonimizados com chave institucional;
6. tornar gravações idempotentes com identificador de transação;
7. confirmar commit antes de declarar integridade registrada;
8. monitorar divergências entre banco clínico e ledger.

Antes da implementação, o TCC deve justificar por que um ledger permissionado agrega valor em relação a um log append-only assinado e governado centralmente.
