# MedChain Presentation v1 — roteiro oficial

**Protótipo acadêmico / MVP. Exclusivamente dados sintéticos.** Não é um sistema
para uso hospitalar e não representa conformidade total com a LGPD. O ledger é
local, sem consenso distribuído. Estado dos ensaios: [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md).

## Preparação

1. Use a branch `release/medchain-presentation-v1` e registre `git rev-parse HEAD`.
   Não atualize dependências nem troque de branch no dia da banca.
2. Instale Node.js **22.x** e npm. Confira `node --version`; Node 24/25 não são a
   plataforma desta release. `better-sqlite3` usa um binário nativo: acesso à rede
   é necessário na primeira instalação; se não houver binário para a plataforma,
   serão necessárias ferramentas C++/Python ou outro computador compatível.
3. Na raiz do projeto, execute:

   ```bash
   npm ci
   npm run demo:setup
   npm run seed
   ```

4. `demo:setup` cria `.env` local com segredos aleatórios; nunca imprime as chaves
   e nunca sobrescreve um `.env` existente. O arquivo não deve ser commitado.
   Caso já exista um `.env` com placeholders, configure-o conforme o README.
5. O seed em banco novo cria quatro usuários, três registros (Observation,
   Encounter, Immunization), um histórico familiar e **zero consentimentos**.
   Reexecutá-lo não duplica esses dados nem apaga registros ou autorizações.
   IDs das contas são fixos; timestamps, IDs de registros, IVs e hashes variam.
6. Para ensaio totalmente limpo, prefira outra cópia da release em nova pasta.
   Gere ali outro `.env` e execute o seed. Não apague o banco de uma instalação
   que queira preservar e não troque sua chave: isso impede a descriptografia.
7. Valide antes da banca:

   ```bash
   npm test
   npm run check
   npm audit --audit-level=high
   git diff --check
   ```

8. Prepare duas sessões de navegador isoladas (janela normal e anônima, ou
   navegadores diferentes). Duas abas da mesma sessão compartilham o cookie.
   Use apenas localhost; não exponha as credenciais de demonstração na internet.

## Como iniciar

```bash
npm start
```

Abra `http://localhost:4173`. O seed é explícito; `SEED_DEMO=false` evita executá-lo
a cada inicialização. Encerre pelo terminal com Ctrl+C. Depois da preparação,
o fluxo principal usa recursos locais e não exige acesso à internet.

## Usuários sintéticos

Senha de demonstração comum: `MedChainDemo123!` (pública e somente para demo local).

| Identidade | E-mail | Uso |
|---|---|---|
| Paciente Teste | paciente@demo.medchain.local | Sessão A, dono dos registros |
| Médico Teste | medico@demo.medchain.local | Sessão B, leitura autorizada |
| Hospital Teste | hospital@demo.medchain.local | Fora do roteiro mínimo |
| Laboratório Teste | laboratorio@demo.medchain.local | Fora do roteiro mínimo |

## Fluxo da demonstração

| Etapa | Ação | Resultado esperado |
|---|---|---|
| 1 | Iniciar o servidor e abrir localhost | Tela de login e indicação de MVP |
| 2 | Sessão A: Paciente Teste → Entrar | Três registros sintéticos no banco novo |
| 3 | Meu histórico → Novo registro | Selecionar Observation; título `Exame fictício da banca`, resultado `DEMO-TCC-SINTETICO`, observação `Não representa pessoa real`; salvar |
| 4 | Ver o registro e clicar Verificar hash | Registro legível após autorização; integridade confirmada com SHA-256 |
| 5 | Ver detalhes, no cartão de segurança | Explicar AES-256-GCM, SHA-256 e limite do ledger local |
| 6 | Consentimentos → Novo consentimento | Médico Teste, Somente leitura, 24 horas → Conceder acesso; status ATIVO |
| 7 | Sessão B: Médico Teste → Entrar | Seleção do Paciente Teste e acesso ao registro criado |
| 8 | Sessão A: Auditoria → Atualizar | Eventos de criação, consentimento e RECORD_VIEWED, sem conteúdo clínico |
| 9 | Sessão A: Consentimentos → Revogar | Status REVOGADO |
| 10 | Sessão B ainda aberta: Meu histórico → Verificar hash do registro | Nova requisição negada por falta de consentimento; no Network, HTTP 403 |
| 11 | Atualizar a página da sessão B | Sem paciente com acesso ativo e sem registros acessíveis |
| 12 | Sessão A: Auditoria → Atualizar | ACCESS_DENIED e revogação registrados; finalizar ambas as sessões com Sair |

A revogação bloqueia **novas requisições**. Conteúdo já exibido ou baixado não é
apagado retroativamente e a tela aberta não recebe atualização por push.
Por isso a etapa 10 solicita novamente o registro/hash e a etapa 11 recarrega.
Se houver mais de um consentimento ativo para o mesmo médico, revogue todos antes
da prova de bloqueio. Execute o roteiro a partir de banco novo quando possível.

## O que mostrar

- Registros do histórico compõem o prontuário estruturado. O fluxo mínimo não
  depende de upload. A área Prontuários aceita documentos sintéticos PDF/PNG/JPEG
  como recurso já existente, opcional, fora do tempo reservado ao roteiro mínimo.
- Criptografia é demonstrada pelos testes `registros cifrados e integridade` e
  `demo: seed repetível...`: verificam que o marcador clínico não aparece na linha
  persistida e que a leitura autorizada recupera o conteúdo original.
- Hash sozinho não demonstra sigilo. AES-GCM protege o conteúdo, SHA-256 verifica
  a projeção protegida; o ledger local é uma prova acadêmica, não uma rede blockchain.
- O teste de adulteração deve rodar em banco temporário da suíte. Nunca adulterar
  o banco usado ao vivo. Nomes/e-mails das contas sintéticas e metadados de operação
  não são todos cifrados; não afirmar que o arquivo SQLite inteiro é criptografado.
- `npm test` também demonstra expiração, falta de permissão, adulteração e logout.
  A regressão da demo reapresenta explicitamente o cookie capturado após logout.

## Resultado esperado

O paciente cria e consulta conteúdo sintético cifrado; o profissional só consulta
com consentimento; ações ficam auditadas; revogar impede a próxima requisição;
sair invalida a sessão. Todos os itens devem ser ensaiados no computador da banca.
Use o checklist de validação e registre qualquer pendência, sem marcar como feita.

## Plano B em caso de falha

1. Antes da apresentação, guarde localmente a saída de `npm test`, `npm run check`
   e os logs do CI (`presentation-validation`). O artefato do CI expira em 30 dias.
   Um relatório automatizado não substitui uma demonstração visual validada.
2. Após um ensaio bem-sucedido, capture telas do histórico sintético, hash confirmado,
   consentimento ativo/revogado, auditoria e bloqueio. Identifique SHA e data do ensaio.
   Não use screenshots inventadas nem exponha `.env`, cookies ou chaves.
3. Mantenha uma cópia local ensaiada, com dependências já instaladas. Se preservar
   um banco sintético para contingência, preserve seu `.env` correspondente fora do
   Git, com acesso restrito. Não transportar `node_modules` entre sistemas distintos.
4. Se a porta 4173 estiver ocupada, encerre a instância anterior. Para usar outra,
   ajuste `PORT` e `FRONTEND_ORIGIN` juntos no `.env`, reinicie e ensaie novamente.
5. Se o login falhar, confira Node 22, seed, URL e credenciais. Após muitas tentativas,
   aguarde a janela do rate limit (15 minutos); não remova a proteção para a banca.
6. Se houver falha de chave/integridade, preserve a instalação e use outra cópia
   preparada. Se o problema persistir, apresente as evidências prévias e declare
   claramente que se trata de execução anterior, não de fluxo ao vivo.

**Transferência PC→PC não faz parte da demo.** Não foi homologada nesta release;
fica como evolução futura, assim como consenso distribuído, Electron, infraestrutura
hospitalar, MFA/KMS e interoperabilidade FHIR completa.
