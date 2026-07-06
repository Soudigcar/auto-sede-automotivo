# Phase 2 — Supabase Setup

This phase connects the MVP screens to real Supabase tables.

## 1. Create Supabase project

Create a project named:

```txt
auto-controle-automotivo
```

## 2. Run SQL files

Open Supabase SQL Editor and run the files in this order:

```txt
1. supabase/schema.sql
2. supabase/mvp-policies.sql
3. supabase/seed.sql
```

## 3. Create initial master user

In Supabase Auth, create the first user:

```txt
email: evento@bradesco.com.br
password: bradesco
```

After first login, change this password before using the system in a real event.

## 4. Configure environment variables

In GitHub Codespaces and Vercel, configure:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Use the values from Supabase Project Settings > API.

## 5. Connected MVP routes

Use these routes to test real data:

```txt
/login
/master/stores
/prospector/live
/store/live
/master/dashboard/live
```

## 6. Test sequence

1. Login using the master account.
2. Open `/master/stores` and create at least one participating store.
3. Open `/prospector/live` and create a Cadastro Rápido.
4. Open `/store/live` and select the store.
5. Update the lead status.
6. Open `/master/dashboard/live` and confirm KPI changes.

## Current limitation

The MVP policies are broad and intended only for first-stage development. Before production, replace them with strict role-based access policies.
