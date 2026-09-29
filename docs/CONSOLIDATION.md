# Consolidação — Fase 1.1

## Base escolhida

`agent/medchain-core-mvp` é a base da consolidação. Ela concentra o backend Express, SQLite, autenticação, criptografia AES-256-GCM, integridade SHA-256, consentimento, auditoria, ledger local, documentos cifrados e testes automatizados.

## Partes preservadas da `main`

- carteira de vacinação com vacina, dose, data e instituição;
- indicadores de doses e vacinas distintas no painel;
- fluxo de autorizações de 24 horas, 7 dias e 30 dias, já coberto pelo `ConsentService` da base escolhida;
- ideia de anexos de comprovante, preservada por meio do fluxo mais seguro de documentos cifrados.

O armazenamento local de dados clínicos e anexos da interface anterior não foi copiado: ele seria uma regressão de confidencialidade. A interface consolidada usa a API autenticada e não contém `localStorage` para dados clínicos.

## Branch histórica

`codex/desenvolver-sistema-de-controle-de-historico-medico` contém a interface estática inicial. Seu conteúdo foi substituído funcionalmente pelas evoluções da `main` e do MVP seguro; não havia funcionalidade exclusiva a transportar.

## Decisões de arquitetura

- `frontend/public/` permanece responsável apenas pela interface;
- `backend/src/routes/` valida contratos HTTP;
- `backend/src/services/` concentra regras de criptografia, integridade, consentimento, auditoria e registros;
- registros de vacinação são recursos FHIR `Immunization`, com conteúdo clínico cifrado;
- arquivos continuam no `DocumentService`, cifrados antes da persistência e verificados por hash.

## Compatibilidade de runtime

O CI usa Node.js 22. `better-sqlite3` 13 não instalou no ambiente local com Node.js 24 sem ferramentas de compilação C++; por isso o projeto declara explicitamente a faixa suportada `>=22 <24` até que haja validação de uma versão posterior.
