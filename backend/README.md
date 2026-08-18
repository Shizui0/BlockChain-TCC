# Backend MedChain

API Express do MVP. A composição ocorre em `src/app.js`; `src/server.js` inicia o processo HTTP.

## Organização

```text
src/
├── db/          schema SQLite e seed sintético
├── middleware/  autenticação, validação e erros
├── routes/      contratos REST
├── services/    criptografia, integridade, consentimento, auditoria e ledger
└── utils/       serialização canônica e utilitários HTTP
```

As rotas nunca retornam `ciphertext`, IV, tag ou hashes internos junto com o conteúdo clínico. O conteúdo só é descriptografado após autenticação e autorização por propriedade ou consentimento ativo.

O banco de desenvolvimento é criado em `backend/data/` e nunca deve ser versionado.
