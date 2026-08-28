# Billing Production-ready — etapa 14

> **SUBSTITUÍDO / NÃO EXECUTAR.** A auditoria read-only da etapa 15A encontrou
> falhas no preflight anterior, no rollback parcial e na concorrência de
> webhooks. A única allowlist candidata a uma autorização futura é
> `supabase/production_ready/billing_stage15b/`.

Este diretório é uma allowlist manual. Ele não é aplicado por `supabase db push`
e não autoriza qualquer alteração em Production.

## Ordem aprovada para uma autorização futura

1. `supabase/migrations/20260827044014_billing_foundation_asaas.sql`
2. `20260828160000_store_billing_registration_profiles.sql`
3. `20260828161000_billing_observe_hardening.sql`

O executor deve validar os hashes do `manifest.json`, executar cada arquivo em
uma transação curta e rodar `preflight_read_only.sql` antes e depois.

## Exclusões obrigatórias

- `supabase/billing-stage-13-synthetic-activation-seed.sql`
- `supabase/migrations/20260828131550_store_registration_profiles_stage12.sql`
- qualquer arquivo com loja, usuário, CNPJ, e-mail ou telefone sintético;
- qualquer migration AUTOCAR ou de outro domínio do CRM.

O arquivo da etapa 12 permanece no histórico DEV porque já foi aplicado no
`saas-dev`; sua RPC está travada em uma loja sintética e não integra este pacote.

## Estado obrigatório

- leituras de Production: desligadas até autorização posterior;
- mutações: desligadas;
- início de trial: desligado;
- confirmação de pagamento: desligada;
- enforcement global e por ambiente: desligado;
- Asaas Production: sem credencial;
- rollback: permitido somente antes de qualquer dado operacional.

`rollback_before_activation.sql` falha se houver qualquer assinatura, pagamento,
webhook, auditoria ou cadastro. Ele também exige a configuração local e
transacional `app.billing_stage14_rollback_confirm=true`.
