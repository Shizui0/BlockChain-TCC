# MedChain

Protótipo inicial para um sistema de histórico médico unificado, seguro e controlado pelo paciente. A interface demonstra prontuário, carteira de vacinação, autorizações de acesso e inclusão local de registros.

## Executar

```bash
npm start
```

Acesse `http://localhost:4173`.

## Escopo atual

- Dashboard responsivo e acessível;
- histórico pesquisável e filtrável;
- inclusão de registros persistidos no `localStorage`;
- carteira de vacinação e gestão visual de consentimentos;
- experiência demonstrativa sem dependências de framework.

> **Importante:** esta é uma prova de conceito acadêmica, não um sistema pronto para armazenar dados reais de saúde. A próxima fase deve implementar autenticação forte, criptografia ponta a ponta, backend auditável, interoperabilidade FHIR, governança LGPD e testes de segurança. Dados clínicos não devem ser gravados diretamente em uma blockchain; apenas provas de integridade e eventos de consentimento devem ser considerados para a camada distribuída.

## Direção arquitetural

Para evolução, recomenda-se separar a solução em: aplicação web do paciente, portal profissional, API compatível com FHIR, serviço de identidade/consentimento, armazenamento clínico criptografado e ledger permissionado para auditoria. Consulte [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Autorizações locais

Criação com destinatário, permissão e validade de 24 horas, 7 dias ou 30 dias. As autorizações persistem neste navegador; expiradas e revogadas permanecem no histórico. O painel conta apenas as ativas. A expiração usa o relógio do dispositivo.

Não envia convites nem libera acesso remoto: a aplicação real deverá autenticar destinatários e validar permissões, expiração e revogação no servidor.
