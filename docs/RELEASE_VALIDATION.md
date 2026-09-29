# Validação — MedChain Presentation v1

## Base revalidada em 2026-09-29

- `main` e `origin/main`: `cf4f20343a8b930791455abfad300c0fca3695ae`.
- PR #3 fechado e mergeado nesse commit, confirmado pela API do GitHub.
- Checkout inicial limpo, sem commits locais não enviados, sem tags preexistentes.
- Fase 1.1: `73ca916` e `078de20`; Fase 1.2: `a0a0997`, `5f49c2f`,
  `3673696`, `d6d9291`; Fase 1.3: `ffcebf7` e `b59eef3`, todos na ancestralidade.
- Branch criada: `release/medchain-presentation-v1`.
- Não foram encontrados AGENTS.md ou instruções de contribuição no checkout.

## Ambiente local

Windows x64; Node 22.23.3 disponibilizado em pasta isolada para a validação.
O Node global 25 não foi usado para validar a aplicação.

| Comando/verificação | Resultado |
|---|---|
| `npm ci` | Bloqueado: cadeia TLS do npm interceptada por Fortinet sem CA confiável disponível; instalação incompleta |
| `npm test` | Não validado localmente: sete arquivos de teste falharam ao carregar dependências ausentes; não confundir com sete casos funcionais reprovados |
| `npm run check` | PASSOU: 44 arquivos |
| `npm audit --audit-level=high` | Bloqueado: UNABLE_TO_VERIFY_LEAF_SIGNATURE; nenhum resultado de vulnerabilidades pode ser inferido |
| `git diff --check` | PASSOU |
| `npm run demo:setup` duas vezes | PASSOU: impressão digital do .env permaneceu igual; nenhuma chave impressa |
| `.env` ignorado | PASSOU: `git check-ignore .env` |

Não foi desativada a verificação TLS para instalação. A CA oficial da rede ou
acesso HTTPS funcional ao npm é necessário para o ensaio local reproduzível.

## CI

O workflow da release executa instalação limpa, suíte, checagem sintática, audit,
seed duas vezes e `npm start`, com verificação HTTP da página e do JavaScript.
Resultado do CI será registrado após a execução do PR. Artefato:
`presentation-validation`, contendo somente logs, sem `.env` ou banco.

## Checklist de frontend e demonstração

**Pendente de execução no navegador.** Uma revisão de código ou teste de API não
é suficiente para marcar estes itens como aprovados.

- [ ] Frontend carrega com layout legível e navegação funcional.
- [ ] Login do paciente; consulta e criação do registro sintético.
- [ ] Evidência da cifragem e integridade; mensagem de hash confirmado.
- [ ] Concessão de consentimento READ ao Médico Teste.
- [ ] Login profissional em sessão isolada e leitura do registro.
- [ ] Auditoria de criação, leitura e consentimento visível.
- [ ] Revogação e nova requisição negada (403); atualização limpa os registros.
- [ ] Logout de ambas as sessões.
- [ ] Console sem erros relevantes inesperados (401 inicial e 403 provocado são esperados).
- [ ] Capturas reais da apresentação preparadas para o Plano B.

## Decisão de congelamento

Ainda não declarar pronta para demonstração enquanto a instalação/seed/início e
o checklist visual não forem validados no ambiente de apresentação, e o CI não
estiver aprovado. Sem merge automático; sem tag enquanto houver bloqueadores.
