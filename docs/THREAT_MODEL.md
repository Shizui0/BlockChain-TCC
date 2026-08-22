# Modelo de ameaças

## Ativos

- credenciais e sessões;
- conteúdo clínico sintético e, futuramente, dados reais;
- chave mestra e futuras chaves de dados;
- consentimentos;
- trilha de auditoria e hashes de integridade;
- disponibilidade da API e do banco.

## Fronteiras de confiança

1. navegador ↔ API;
2. API ↔ banco;
3. processo ↔ variável de ambiente/KMS futuro;
4. LedgerService ↔ ledger permissionado futuro;
5. instituição ↔ identidade profissional.

## Ameaças e controles

| Ameaça | Impacto | Controle no MVP | Trabalho futuro |
|---|---|---|---|
| Roubo de senha | Acesso indevido | bcrypt, erro uniforme, rate limit | MFA, detecção de credenciais vazadas |
| Vazamento do banco | Exposição de dados | AES-256-GCM; chave fora do banco | envelope encryption, KMS/HSM |
| Roubo da chave | Descriptografia em massa | segredo fora do Git | rotação, KMS, escopo por paciente |
| Usuário interno malicioso | Consulta não autorizada | consentimento e auditoria | segregação de funções e alertas |
| Alteração de prontuário | Perda de integridade | SHA-256 + ledger local | ledger permissionado e assinaturas institucionais |
| Acesso sem consentimento | Violação de privacidade | autorização centralizada, `ACCESS_DENIED` | políticas ABAC e revisão periódica |
| Replay de tokens | Reutilização de sessão | validade de uma hora, cookie seguro | rotação, `jti`, revogação e proof-of-possession |
| Exposição de logs | Vazamento indireto | metadados filtrados, sem payload clínico | classificação e DLP centralizada |
| Comprometimento de nó | Ledger falso/indisponível | fora do escopo do mock | Fabric com governança, MSP e política de endorsement |
| XSS | Roubo de contexto/autorização | CSP, cookie HttpOnly, escape no frontend | SAST/DAST, Trusted Types |
| CSRF | Ação em nome do usuário | SameSite Strict e mesma origem | token anti-CSRF se houver integrações cross-site |
| Injeção SQL | Leitura ou alteração do banco | consultas preparadas e validação | revisão SAST e privilégio mínimo no PostgreSQL |
| Negação de serviço | Indisponibilidade | limite de corpo e rate limit de autenticação | rate limit global, WAF e observabilidade |
| Upload malicioso | execução, exaustão ou conteúdo disfarçado | limite de 10 MiB, MIME + assinatura, nome aleatório e arquivo nunca executado | antivírus/CDR, object storage isolado e varredura assíncrona |
| Vazamento de arquivo temporário | exposição de prontuário plaintext | upload em memória e persistência somente após AES-256-GCM | streaming cifrado e isolamento por tenant |

## Riscos aceitos no MVP

- chave única em variável de ambiente;
- SQLite no mesmo host da API;
- ledger local sem consenso;
- cadastro simplificado de profissionais;
- ausência de MFA e revogação central de tokens;
- ausência de pentest e validação jurídica.

Esses riscos impedem uso com dados reais.
