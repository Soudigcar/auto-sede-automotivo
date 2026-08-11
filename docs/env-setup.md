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
```

`EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` must never use a `NEXT_PUBLIC_` prefix.
`EVOLUTION_WEBHOOK_URL` must be a public HTTPS endpoint reachable from the Evolution API server.

Do not commit real credentials to GitHub.
