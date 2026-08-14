# Baseline do Supabase

Este diretório documenta o baseline consolidado do AUTO CONTROLE AUTOMOTIVO.

## Estado atual

O fluxo ativo de migrations parte do baseline consolidado e continua com as migrations posteriores registradas no Supabase Production:

1. `supabase/migrations/20260809212450_baseline_current_schema.sql`;
2. `supabase/migrations/20260811032505_inventory_sale_flow.sql`;
3. `supabase/migrations/20260811144525_create_store_whatsapp_evolution_integrations.sql`;
4. `supabase/migrations/20260811163935_support_master_and_store_whatsapp_scopes.sql`.

O baseline serve para reconstruir um banco vazio. Ele **não deve ser executado sobre o banco de produção existente**, porque os objetos já existem lá.

## Composição do baseline

O arquivo `20260809212450_baseline_current_schema.sql` consolida, na ordem validada:

1. a migration inicial registrada no Supabase;
2. as duas camadas fundacionais em `sources/`;
3. as 45 migrations históricas restantes;
4. a finalização de privilégios;
5. a camada de buckets e policies de Storage;
6. `20260805173249_apply_pick_next_lead_store_by_event`, que foi a 46ª migration histórica incorporada ao baseline.

As fontes validadas permanecem separadas em `sources/` para auditoria. O arquivo `MANIFEST.sha256` permite confirmar que elas não foram alteradas.

## Sanitização para repositório público

A migration histórica de integração WhatsApp continha um valor concreto como `DEFAULT` de `verify_token`. O literal foi removido do arquivo histórico e do baseline ativo; a coluna continua `NOT NULL` e deverá receber um valor por fluxo seguro de configuração. Nenhum token ou credencial de produção foi versionado.

## Histórico remoto de migrations

O baseline foi consolidado no GitHub sem reaplicar seu SQL ao banco Production. Por isso, o registro remoto `20260809212450_baseline_current_schema` pode precisar ter seus `statements` reparados a partir do arquivo versionado para que ambientes novos de Branching consigam reconstruir o schema.

Qualquer reparo deve alterar somente `supabase_migrations.schema_migrations`; não deve executar novamente o baseline nem alterar tabelas ou dados existentes. Novas migrations posteriores ao baseline devem permanecer como arquivos individuais em `supabase/migrations/`, com os mesmos timestamps e conteúdos registrados no Supabase.

Referência: [Local development workflow do Supabase](https://supabase.com/docs/guides/local-development/cli-workflows).
