# Environment Setup

Create a local environment file in your development environment with these variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key

# Webhooks e proteções (server only; use valores aleatórios distintos)
META_APP_SECRET=your_meta_app_secret
META_PAGE_ACCESS_TOKEN=your_meta_page_access_token
META_LEADS_VERIFY_TOKEN=your_random_meta_verify_token
WHATSAPP_APP_SECRET=your_whatsapp_meta_app_secret
WHATSAPP_VERIFY_TOKEN=your_random_whatsapp_verify_token
UMBLER_WEBHOOK_TOKEN=your_random_umbler_webhook_token
RATE_LIMIT_SECRET=your_random_rate_limit_hmac_secret
CRON_SECRET=your_random_vercel_cron_secret

# Billing Asaas (server only)
# O enforcement deve permanecer false durante implantacao, trial e conciliacao inicial.
BILLING_ENFORCEMENT_ENABLED=false
# Preview: as quatro chaves sao exclusivas deste ambiente e da branch autorizada.
BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF=your_saas_dev_project_ref
BILLING_PREVIEW_ENVIRONMENT_NAME=saas-dev
BILLING_PREVIEW_READS_ENABLED=true
BILLING_PREVIEW_MUTATIONS_ENABLED=false
BILLING_PREVIEW_ENFORCEMENT_ENABLED=false
# Production: mantenha todas desligadas ate uma autorizacao posterior especifica.
BILLING_PRODUCTION_ALLOWED_SUPABASE_PROJECT_REF=
BILLING_PRODUCTION_ENVIRONMENT_NAME=production
BILLING_PRODUCTION_READS_ENABLED=false
BILLING_PRODUCTION_MUTATIONS_ENABLED=false
BILLING_PRODUCTION_ENFORCEMENT_ENABLED=false
BILLING_TRIAL_START_ENABLED=false
BILLING_ASAAS_SANDBOX_ENABLED=false
BILLING_ASAAS_SYNTHETIC_STORE_ID=your_saas_dev_synthetic_store_uuid
BILLING_ASAAS_PREVIEW_BASE_URL=https://your-branch-preview.vercel.app
ASAAS_ENV=sandbox
ASAAS_API_KEY=your_asaas_sandbox_api_key
ASAAS_WEBHOOK_TOKEN=your_random_asaas_webhook_token_32_to_255_chars

# Retenção LGPD: mantenha false até o prazo ser aprovado e a migration validada.
LGPD_RETENTION_ENABLED=false
LGPD_LEAD_RETENTION_DAYS=730
LGPD_WEBHOOK_RETENTION_DAYS=90

# Evolution API (server only)
EVOLUTION_API_URL=https://api.example.com
EVOLUTION_API_KEY=your_global_evolution_api_key
EVOLUTION_WEBHOOK_SECRET=your_random_webhook_hmac_secret
EVOLUTION_WEBHOOK_URL=https://your-app.example.com/api/webhooks/evolution
VERCEL_AUTOMATION_BYPASS_SECRET=your_preview_only_vercel_automation_bypass_secret
```

Nenhuma variável desta seção, nem `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET` ou `SUPABASE_SERVICE_ROLE_KEY`, pode usar o prefixo `NEXT_PUBLIC_`.
`EVOLUTION_WEBHOOK_URL` must be a public HTTPS endpoint reachable from the Evolution API server.
`VERCEL_AUTOMATION_BYPASS_SECRET` is provided by Vercel after Protection Bypass for Automation is enabled and is used by the application only when `VERCEL_ENV=preview`.

Do not commit real credentials to GitHub.

Antes de ativar um webhook, configure o mesmo verify token no provedor e na Vercel. Os tokens previsíveis antigos são deliberadamente rejeitados. Rotacione segredos comprometidos no provedor antes de remover a versão antiga da Vercel.

`UMBLER_WEBHOOK_TOKEN` é exclusivamente server-side: o painel informa apenas se a variável está configurada e nunca aceita, persiste ou exibe seu valor. Configure o mesmo segredo manualmente na Umbler usando um header de webhook suportado pelo provedor; não inclua o token em URLs compartilhadas.

As configurações `BILLING_PREVIEW_*` e `BILLING_PRODUCTION_*` são independentes. Cada ambiente precisa de sua própria allowlist, nome, chave de leitura, chave de mutação e chave de enforcement. Variáveis antigas (`BILLING_ALLOWED_SUPABASE_PROJECT_REF` e `BILLING_STAGE6_*`) não liberam a etapa 9. A leitura falha fechada quando a chave do ambiente está desligada, o project ref não coincide ou faltam credenciais server-side. Production nasce com leitura, mutação e enforcement desligados.

Mesmo quando a leitura de Production for autorizada futuramente, mutações exigirão `BILLING_PRODUCTION_MUTATIONS_ENABLED=true`; enforcement exigirá simultaneamente `BILLING_ENFORCEMENT_ENABLED=true`, `BILLING_PRODUCTION_ENFORCEMENT_ENABLED=true` e `access_enforcement_mode='enforce'` na assinatura individual. `BILLING_TRIAL_START_ENABLED` permanece `false` até uma autorização específica para persistir trials.

`BILLING_ASAAS_SANDBOX_ENABLED` libera exclusivamente o Checkout Sandbox. A liberação exige simultaneamente `VERCEL_ENV=preview`, `ASAAS_ENV=sandbox`, URL HTTPS `*.vercel.app`, o UUID exato do seed sintético em `BILLING_ASAAS_SYNTHETIC_STORE_ID` e `VERCEL_AUTOMATION_BYPASS_SECRET`. O segredo de bypass é usado somente na URL server-side cadastrada no Webhook e nunca é retornado à interface.

`ASAAS_ENV` aceita somente `sandbox` ou `production`, mas a etapa 9 continua recusando toda chamada HTTP ao Asaas Production com `ASAAS_PRODUCTION_FORBIDDEN`. As URLs são definidas pelo servidor e não por variável arbitrária. O `ASAAS_WEBHOOK_TOKEN` deve ser diferente da API Key, ter entre 32 e 255 caracteres e ser configurado no header `asaas-access-token` do Webhook. Nunca habilite `BILLING_ENFORCEMENT_ENABLED` antes de todas as lojas com acesso ao sistema possuírem assinatura conciliada e modo individual `enforce` aprovado.
