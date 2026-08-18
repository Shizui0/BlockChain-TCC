# Segurança

## Escopo

Os controles abaixo protegem uma demonstração acadêmica com dados sintéticos. Eles não constituem certificação, pentest ou conformidade LGPD.

## Identidade e sessão

- senhas processadas por bcrypt com custo 12;
- mensagens de login não distinguem usuário inexistente de senha incorreta;
- rate limiting aplicado a cadastro, login e logout;
- JWT HS256 com emissor, audiência e validade de uma hora;
- cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção;
- CORS aceita somente a origem configurada.

Em produção, substituir o cadastro/login local por OpenID Connect com MFA, políticas institucionais e revogação centralizada.

## Proteção de dados clínicos

`CryptoService` usa AES-256-GCM da biblioteca padrão do Node.js. Cada cifragem recebe IV aleatório de 96 bits e AAD contendo identificador do registro, paciente e tipo FHIR. São persistidos:

- ciphertext em base64;
- IV;
- authentication tag;
- versão da chave.

`MEDCHAIN_MASTER_KEY` deve conter exatamente 32 bytes, em base64 ou hexadecimal, e nunca deve ser commitida. A chave fica na memória do processo durante a execução.

## Integridade

O SHA-256 cobre identificadores, metadados mínimos e todos os campos do conteúdo protegido. O hash é comparado em tempo constante e confrontado com o último evento correspondente do ledger local.

Criptografia não substitui hash de auditoria: a primeira restringe leitura e autentica o ciphertext; o segundo permite registrar uma prova determinística separada.

## Logs e auditoria

Metadados cujas chaves indiquem conteúdo clínico, diagnóstico, resultado, condição, genética, documento ou notas são descartados pelo serviço de auditoria. Erros HTTP não retornam stack trace.

## Operação segura

- usar TLS e proxy reverso;
- manter `.env` fora do versionamento e do backup não cifrado;
- executar o processo com usuário sem privilégio;
- restringir acesso ao arquivo SQLite;
- não copiar o banco de demonstração para ambientes reais;
- rotacionar segredos e chaves após qualquer suspeita de exposição;
- testar restauração e resposta a incidentes.
