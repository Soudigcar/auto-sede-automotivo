# Environment Setup

Create a local environment file in your development environment with these variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key

# Webhooks e proteções (server only; use valores aleatórios distintos)
META_APP_SECRET=your_meta_app_secret
META_LEADS_VERIFY_TOKEN=your_random_meta_verify_token
WHATSAPP_APP_SECRET=your_whatsapp_meta_app_secret
WHATSAPP_VERIFY_TOKEN=your_random_whatsapp_verify_token
WATI_WEBHOOK_TOKEN=your_random_wati_webhook_token
UMBLER_WEBHOOK_TOKEN=your_random_umbler_webhook_token
RATE_LIMIT_SECRET=your_random_rate_limit_hmac_secret
CRON_SECRET=your_random_vercel_cron_secret

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

Nenhuma variável desta seção, nem `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET` ou `SUPABASE_SERVICE_ROLE_KEY`, pode usar o prefixo `NEXT_PUBLIC_`.
`EVOLUTION_WEBHOOK_URL` must be a public HTTPS endpoint reachable from the Evolution API server.
`VERCEL_AUTOMATION_BYPASS_SECRET` is provided by Vercel after Protection Bypass for Automation is enabled and is used by the application only when `VERCEL_ENV=preview`.

Do not commit real credentials to GitHub.

Antes de ativar um webhook, configure o mesmo verify token no provedor e na Vercel. Os tokens previsíveis antigos são deliberadamente rejeitados. Rotacione segredos comprometidos no provedor antes de remover a versão antiga da Vercel.
