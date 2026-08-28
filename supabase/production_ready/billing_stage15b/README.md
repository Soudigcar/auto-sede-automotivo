# Billing Production-ready — etapa 15B

Este diretório é a única allowlist candidata à futura entrada do billing em
Production. A etapa 15B não autoriza sua aplicação e substitui integralmente o
pacote da etapa 14.

## Ordem versionada

1. `20260828170000_billing_foundation_asaas.sql` —
   `billing_stage15b_foundation_asaas`
2. `20260828171000_store_billing_registration_profiles.sql` —
   `billing_stage15b_registration_profiles`
3. `20260828172000_billing_observe_hardening.sql` —
   `billing_stage15b_observe_hardening`
4. `20260828173000_billing_webhook_atomicity.sql` —
   `billing_stage15b_webhook_atomicity`

Cada arquivo inicia sua própria transação com `lock_timeout='5s'` e
`statement_timeout='30s'`. Os hashes do `manifest.json` devem ser validados
imediatamente antes da execução.

## Histórico obrigatório

- aplicar cada arquivo com `apply_migration`, usando exatamente o nome indicado;
- registrar a versão retornada em um recibo da janela;
- conferir os quatro nomes em `supabase_migrations.schema_migrations`;
- nunca usar SQL Editor, `execute_sql` ou `supabase db push` em Production para
  este pacote;
- nunca apagar nem marcar migrations anteriores como `reverted` para desfazer o
  pacote.

Se uma reversão ainda for permitida, aplicar
`20260828174000_billing_stage15b_forward_rollback.sql` como uma nova migration
chamada `billing_stage15b_forward_rollback`. Isso preserva o histórico forward.

## Gates read-only

1. Rodar `preflight_before_read_only.sql` antes das migrations. O gate exige
   zero tabelas e zero funções de billing, dependências compatíveis e nenhuma
   sessão aguardando lock ou transação longa.
2. Rodar `postflight_after_read_only.sql` somente depois das quatro migrations.
3. Repetir os advisors de segurança e performance.

O preflight não faz cast `::regclass` de objetos ausentes nem consulta tabelas
de billing diretamente. O postflight pode fazer contagens exatas porque só é
executado depois da criação.

## Rollback fail-closed

O rollback é seguro em estados parciais: cada tabela é descoberta com
`to_regclass` antes de qualquer leitura. Ele exige
`app.billing_stage15b_rollback_confirm=true` na mesma transação e recusa
assinaturas, pagamentos, webhooks, auditorias, cadastros financeiros ou planos
fora do catálogo genérico esperado. Não usa `CASCADE`.

## Exclusões

- todo o diretório `billing_stage14/`;
- `supabase/migrations/20260827044014_billing_foundation_asaas.sql`;
- `supabase/migrations/20260828131550_store_registration_profiles_stage12.sql`;
- `supabase/billing-stage-13-synthetic-activation-seed.sql`;
- qualquer migration de outro domínio do CRM ou do AUTOCAR.

## Ensaio isolado

`node scripts/build-billing-stage15b-rehearsal.mjs --schema <schema>` gera um
SQL executável que aplica e reverte o pacote em uma única transação. O ensaio
valida estado parcial, RLS, grants, funções `SECURITY INVOKER`, constraints
compostas, claim/token, transição financeira atômica e evento atrasado. O
arquivo sempre termina em `ROLLBACK`; depois, o schema deve estar ausente.

O deploy do código em Vercel Preview pode anteceder o provisionamento do schema
15B. Nesse estado, o webhook falha fechado com HTTP 503 quando as RPCs atômicas
não existem; não há fallback para as escritas não atômicas da etapa anterior.

Production, trials, cobranças, enforcement e Asaas Production continuam fora do
escopo até uma nova autorização explícita.
