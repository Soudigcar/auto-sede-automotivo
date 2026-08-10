# Baseline do Supabase

Este diretório documenta o baseline consolidado do AUTO CONTROLE AUTOMOTIVO.

## Estado desta branch

- O fluxo ativo contém somente `supabase/migrations/20260809212450_baseline_current_schema.sql`.
- O baseline serve para reconstruir um banco vazio.
- Ele **não deve ser executado sobre o banco de produção existente**, porque os
  objetos já existem lá.
- Nenhum `migration repair`, `db push`, alteração de schema ou escrita de dados
  foi executado na produção durante a preparação desta branch.

## Composição

O arquivo ativo consolida, na ordem validada:

1. a migration inicial registrada no Supabase;
2. as duas camadas fundacionais em `sources/`;
3. as 45 migrations históricas restantes;
4. a finalização de privilégios;
5. a camada de buckets e policies de Storage;
6. `20260805173249_apply_pick_next_lead_store_by_event`, que é a 46ª migration
   registrada atualmente na produção.

As fontes validadas permanecem separadas em `sources/` para auditoria. O
arquivo `MANIFEST.sha256` permite confirmar que elas não foram alteradas.

## Sanitização para repositório público

A migration histórica de integração WhatsApp continha um valor concreto como
`DEFAULT` de `verify_token`. O literal foi removido do arquivo histórico e do
baseline ativo; a coluna continua `NOT NULL` e deverá receber um valor por fluxo
seguro de configuração. Nenhum token ou credencial de produção foi versionado.

## Próxima etapa, fora do escopo desta branch

Depois de revisar e aprovar o diff, o histórico do Supabase precisará ser
alinhado separadamente. Esse alinhamento deve alterar apenas
`supabase_migrations.schema_migrations`; ele não deve reaplicar o baseline nem
alterar tabelas ou dados existentes. A operação exige plano, dry-run e nova
autorização explícita.

Referência: [Local development workflow do Supabase](https://supabase.com/docs/guides/local-development/cli-workflows).
