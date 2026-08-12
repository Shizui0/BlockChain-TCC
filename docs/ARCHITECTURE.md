# Arquitetura proposta

## Princípios

1. **Privacidade por padrão:** nenhum dado clínico é público ou registrado diretamente no ledger.
2. **Controle do paciente:** acessos são explícitos, temporários, revogáveis e auditáveis.
3. **Interoperabilidade:** recursos clínicos seguem o padrão HL7 FHIR.
4. **Defesa em profundidade:** criptografia em trânsito e em repouso, MFA, segregação de funções e rotação de chaves.
5. **Evolução segura:** o protótipo visual não deve receber dados reais até que backend, identidade e governança estejam implementados e validados.

## Componentes futuros

```text
Web do paciente / Portal profissional
                │
          API Gateway + WAF
                │
      API clínica compatível FHIR
       ├── Identidade e consentimento
       ├── Cofre criptografado de documentos
       ├── Banco clínico transacional
       └── Ledger permissionado (hashes e auditoria)
```

## Modelo de confiança

- O dado clínico permanece fora da blockchain, cifrado com uma chave de dados por paciente.
- A chave privada do paciente não é enviada ao servidor; recuperação deve usar chaves sociais/institucionais com consentimento e política documentada.
- O ledger registra apenas hashes, concessões, revogações e identificadores não diretamente atribuíveis.
- Instituições são identificadas por certificados e todos os acessos geram eventos de auditoria.

## Roadmap

1. Definir personas, jornadas e requisitos legais com orientação especializada em LGPD e saúde.
2. Criar backend, banco e autenticação OpenID Connect com MFA.
3. Modelar recursos FHIR (`Patient`, `Encounter`, `Observation`, `Immunization`, `Consent`).
4. Implementar envelope encryption com KMS/HSM e trilha de auditoria.
5. Adicionar ledger permissionado após validar a necessidade e o modelo de governança.
6. Executar testes automatizados, threat modeling, pentest e piloto com dados sintéticos.
