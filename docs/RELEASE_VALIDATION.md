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

Execução [36641719198](https://github.com/Shizui0/BlockChain-TCC/actions/runs/36641719198)
da candidata `66b0e71a8302acc336cbfc4c6d4c6d777870be0d`: Ubuntu, Node 22.

| Verificação | Resultado confirmado nos logs |
|---|---|
| `npm ci` | Instalação limpa concluída |
| `npm test` | 20 casos, 20 passando, 0 falhando, 0 ignorados |
| `npm run check` | 44 arquivos aprovados |
| `npm audit --audit-level=high` | 0 altas/críticas; 2 moderadas (`ip-address`, `qs`) |
| `git diff --check` | Aprovado |
| Setup, seed duas vezes e `npm start` | Aprovados; HTML e JavaScript retornados por HTTP |

O novo caso cobre a demo integrada e replay do cookie após logout. Os testes já
existentes cobrem adulteração de ciphertext/metadados, AES-GCM, uploads, permissões,
expiração e auditoria. Isso não equivale a auditoria completa de segurança.

O workflow usa Bash com `pipefail` para que `tee` não mascare falhas e verifica
o SHA da branch do PR. O resultado do commit final deve ser consultado no PR #4.
Artefato `presentation-validation`: somente logs, sem `.env` ou banco.

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

O fluxo de backend e instalação Linux foram validados no CI. Ainda não declarar
pronta para demonstração enquanto a instalação/seed/início no computador da banca
e o checklist visual não forem validados. A instalação Windows local segue bloqueada
pelo certificado da rede. Sem merge automático; sem tag enquanto houver bloqueadores.
