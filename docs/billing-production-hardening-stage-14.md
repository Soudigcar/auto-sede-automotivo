# Billing — hardening e pacote Production-ready da etapa 14

## Escopo concluído

A etapa 14 prepara um pacote manual e verificável sem aplicar nada no Supabase
Production. O histórico DEV e os seeds sintéticos permanecem fora da allowlist.

O pacote adiciona:

- cadastro financeiro genérico, sem identidade de loja no SQL;
- exigência de Master ativo, loja ativa, usuário SaaS ativo e cadastro validado;
- trial único de sete dias sempre em `observe`;
- constraint que impede `access_enforcement_mode='enforce'`;
- RLS e grants mínimos somente para `service_role`;
- índices para as chaves estrangeiras consultadas e auditadas;
- rollback fail-closed antes da primeira ativação;
- preflight somente leitura e manifesto com SHA-256.

## Webhooks e tolerância a falhas

- `provider_event_id` continua único e duplicatas processadas não são repetidas;
- a tentativa de processamento usa compare-and-set por `processing_attempts`;
- confirmações antigas não regridem pagamentos liquidados;
- eventos posteriores não reabrem uma assinatura `cancelled`;
- falha ao criar Checkout devolve estado retryable, preserva o trial e mantém
  `payment_confirmed=false` e `access_enforcement_mode='observe'`;
- a expiração do trial altera apenas o diagnóstico observado; o acesso real
  continua permitido enquanto o enforcement global ou da assinatura estiver desligado.

## Ensaio autorizado

O SQL deve ser ensaiado em um schema descartável dentro do `saas-dev`, com nomes
de schema reescritos apenas para o teste. O ensaio precisa criar objetos, validar
RLS/grants/RPC/idempotência, testar o rollback e terminar em `ROLLBACK`.

Depois do ensaio, o schema `public` deve conservar exatamente as contagens e os
timestamps anteriores.

## Entrada futura em Production

Uma nova autorização será necessária para:

1. conferir o SHA-256 de cada arquivo da allowlist;
2. executar o preflight somente leitura;
3. aplicar as três migrations em transações curtas;
4. repetir o preflight e os advisors;
5. manter todas as variáveis desligadas;
6. publicar a interface em `observe` sem iniciar trials.

Não executar `supabase db push` indiscriminadamente: o diretório geral de
migrations também contém histórico DEV que não pertence à allowlist da etapa 14.

Referências:

- Supabase, migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase, RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, grants explícitos: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
