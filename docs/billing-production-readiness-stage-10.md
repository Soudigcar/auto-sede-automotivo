# Billing — etapa 10 — prontidão para Production

Esta etapa prepara a implantação sem alterar CRM Production, criar trials ou
configurar o Asaas Production. O resultado da auditoria de lojas não deve ser
versionado: nomes, UUIDs, logins e métricas reais permanecem fora do repositório.

## Critério de classificação

- `confirmed_saas`: loja ativa, ao menos um perfil ativo ligado a uma conta Auth
  e login ou atividade operacional nos últimos 90 dias;
- `manual_review`: loja ativa com perfil do sistema, mas sem evidência recente;
- `portal_only`: loja ativa e visível no portal, sem perfil ativo do sistema;
- `excluded`: loja inativa ou excluída.

Somente `confirmed_saas`, após revisão humana do Master, pode entrar no lote do
trial futuro. A classificação nunca inicia trial e nunca altera `stores` ou
`users`. O SQL reproduzível está em
`supabase/billing-stage-10-read-only-audit.sql` e abre uma transação read-only.

## Manifesto de migrations

`supabase/billing-stage-10-migration-manifest.json` é a lista canônica desta
etapa. Cada arquivo de `supabase/migrations` pertence exatamente a um alvo:

- CRM Production: 27 migrations já reconciliadas e a fundação do billing
  pendente de autorização específica;
- AUTOCAR Production: migrations próprias, não consultadas nesta etapa;
- `saas-dev`: histórico de bootstrap/alinhamento intencionalmente diferente do
  CRM; não se deve usar `db push` ou comparação apenas por timestamp.

Os itens `applied-alias` registram a versão remota real de migrations aplicadas
com timestamp diferente do nome local. A fundação do billing só pode ser
aplicada pelo arquivo exato `20260827044014_billing_foundation_asaas.sql`.

## Estado seguro das variáveis de Production

Antes e depois de qualquer deploy de código, Production deve permanecer:

```text
BILLING_PRODUCTION_ALLOWED_SUPABASE_PROJECT_REF=
BILLING_PRODUCTION_ENVIRONMENT_NAME=crm-production-observe
BILLING_PRODUCTION_READS_ENABLED=false
BILLING_PRODUCTION_MUTATIONS_ENABLED=false
BILLING_PRODUCTION_ENFORCEMENT_ENABLED=false
BILLING_ENFORCEMENT_ENABLED=false
BILLING_TRIAL_START_ENABLED=false
BILLING_ASAAS_SANDBOX_ENABLED=false
```

Não configurar `ASAAS_API_KEY` nem `ASAAS_WEBHOOK_TOKEN` em Production nesta
fase. A aplicação continua recusando o Asaas Production com
`ASAAS_PRODUCTION_FORBIDDEN`.

## Sequência futura de implantação

1. Criar snapshot/backup e registrar contagens das tabelas críticas.
2. Confirmar que as chaves acima continuam desligadas.
3. Aplicar somente a migration de fundação autorizada.
4. Validar plano único e tabelas de assinatura/pagamento/webhook/auditoria vazias.
5. Publicar código com leitura de Production ainda desligada.
6. Em autorização separada, ligar apenas `BILLING_PRODUCTION_READS_ENABLED` e a
   allowlist correta, mantendo mutação e enforcement desligados.
7. Revisar a lista de lojas com o Master e completar CNPJ antes do Asaas.
8. Somente depois, autorizar trials, Asaas Production e cobrança em fases
   independentes.

## Rollback

### Antes de qualquer trial ou pagamento

1. Desligar leitura, mutação e enforcement do billing.
2. Reimplantar o último artefato estável, sem promoção de Preview.
3. Confirmar que as tabelas de assinatura, pagamento, webhook e auditoria estão
   vazias e que apenas o plano seed existe.
4. Somente com autorização destrutiva específica, remover função e tabelas na
   ordem inversa das dependências. Nunca executar essa remoção automaticamente.

### Depois de existir dado financeiro

Não remover tabelas. Desligar as chaves, preservar os dados, reimplantar o código
estável e reconciliar manualmente. O acesso continua preservado porque o
enforcement global e individual permanece desligado/`observe`.

## Critérios de aprovação

- o CRM não possui objetos de billing antes da migration;
- cada migration local aparece uma única vez no manifesto;
- nenhuma migration do AUTOCAR é direcionada ao CRM;
- nenhuma loja é selecionada apenas por `portal_enabled`;
- CNPJ válido é obrigatório antes de criar cliente no Asaas;
- Master, loja, equipe, portal, WhatsApp e AUTOCAR continuam disponíveis quando
  o billing está desligado ou indisponível;
- nenhum segredo de Production é criado nesta etapa.
