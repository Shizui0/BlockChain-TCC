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

Prontuários aceitam somente PDF, PNG e JPEG, com validação de MIME e assinatura binária. O upload usa memória limitada, cifra os bytes com AES-256-GCM e grava somente ciphertext sob um nome UUID em `backend/data/uploads`. Nome original e descrição são cifrados no banco. O limite padrão é 10 MiB.

## Integridade

O SHA-256 cobre identificadores, metadados mínimos e todos os campos do conteúdo protegido de registros e documentos. O hash é comparado em tempo constante e confrontado com o último evento correspondente do ledger local, incluindo algoritmo e timestamp. Divergências impedem a leitura e produzem evento de auditoria sem conteúdo clínico. A verificação de registros e documentos pela API exige autorização.

Para documentos há duas provas: `content_hash` representa exatamente os bytes enviados antes da cifragem; `protected_hash` cobre a projeção técnica, os metadados cifrados e o hash do arquivo cifrado. Uma divergência bloqueia o download; a rota de verificação retorna `valid: false`.

O pacote `.medchain` v2 inclui um fingerprint SHA-256 da representação canônica de todos os seus campos protegidos, excluindo a própria seção `integrity`. `medchain:verify` o compara sem descriptografar. O pacote v1 continua legível, mas não possui fingerprint. O digest interno detecta corrupção; um atacante que possa editar o pacote também pode recalculá-lo. A autenticação contra alteração maliciosa é fornecida pela tag AES-GCM com AAD de toda a metadata técnica do v2.

AES-GCM oferece confidencialidade e autenticação do ciphertext/AAD. SHA-256 fornece uma impressão determinística para comparação e ancoragem futura; não substitui a authTag. O ledger atual é uma tabela no mesmo SQLite, útil para detectar divergências entre registros, mas não é uma fonte independente e imutável: quem puder alterar banco e ledger pode forjar ambas as referências. Uma ancoragem distribuída/externa permanece trabalho futuro.

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

## Chaves na Fase 2.3

As chaves de banco, transferência `.medchain` e assinatura JWT devem ser distintas.
`MEDCHAIN_TRANSFER_KEY` aceita somente Base64 canônico de 32 bytes. Gere-a com
`npm run medchain:keygen`, copie uma única vez para um gerenciador de segredos e
não a registre no Git ou em logs. `MEDCHAIN_TRANSFER_PREVIOUS_KEYS` e
`MEDCHAIN_PREVIOUS_MASTER_KEYS` são keyrings opcionais de leitura histórica:
proteja-os como segredos e remova versões antigas somente depois de confirmar que
nenhum dado necessário depende delas. Descriptografia CLI falha com mensagem externa
genérica; o erro interno `UNKNOWN_KEY_ID` não revela o identificador recebido.
O fingerprint SHA-256 sem chave não substitui a autenticação AES-GCM.

## Transporte LAN da Fase 2.4

O receptor exige TLS com certificado e chave privada fornecidos pelo operador;
o remetente exige cópia confiável do certificado (`--ca`) e valida o nome/IP.
Não existe opção para desabilitar a validação TLS. A chave privada TLS e a chave
de transferência não devem ser compartilhadas no mesmo canal do pacote.
O HMAC do pedido usa chave derivada por HKDF, evitando uso direto da chave AES
para outra finalidade. Timestamp e nonce limitam replay em vida do processo;
o arquivo com criação exclusiva impede sobrescrita do mesmo `packageId`.
Isto não fornece identidade individual, autorização clínica, persistência de
nonces, proteção contra negação de serviço em LAN hostil ou conformidade para
dados reais. Restrinja a porta no firewall e use somente dados sintéticos.
