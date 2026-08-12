# Environment Setup

Create a local environment file in your development environment with these variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key

# Evolution API (server only)
EVOLUTION_API_URL=https://api.example.com
EVOLUTION_API_KEY=your_global_evolution_api_key
EVOLUTION_WEBHOOK_SECRET=your_random_webhook_hmac_secret
EVOLUTION_WEBHOOK_URL=https://your-app.example.com/api/webhooks/evolution
VERCEL_AUTOMATION_BYPASS_SECRET=your_preview_only_vercel_automation_bypass_secret
```

`EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` must never use a `NEXT_PUBLIC_` prefix.
`EVOLUTION_WEBHOOK_URL` must be a public HTTPS endpoint reachable from the Evolution API server.
`VERCEL_AUTOMATION_BYPASS_SECRET` is provided by Vercel after Protection Bypass for Automation is enabled and is used by the application only when `VERCEL_ENV=preview`.

Do not commit real credentials to GitHub.
