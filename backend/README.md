# Backend MedChain

API Express do MVP. A composição ocorre em `src/app.js`; `src/server.js` inicia o processo HTTP.

## Organização

```text
src/
├── config/      leitura e validação de variáveis de ambiente
├── db/          schema SQLite e seed sintético
├── middleware/  autenticação, validação e erros
├── routes/      contratos REST
├── services/    criptografia, documentos, integridade, consentimento, auditoria e ledger
└── utils/       serialização canônica e utilitários HTTP
```

As novas importações devem usar `src/config/index.js`. O arquivo `src/config.js` continua apenas como ponte de compatibilidade para importações internas anteriores.

As rotas nunca retornam `ciphertext`, IV, tag ou o `protectedHash` junto com o conteúdo clínico. Documentos expõem o SHA-256 dos bytes originais para conferência, mas só são descriptografados após autenticação, autorização e validação de integridade.

O banco de desenvolvimento e os arquivos cifrados de upload são criados em `backend/data/` e nunca devem ser versionados.
