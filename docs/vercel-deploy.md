# Vercel Deployment Guide

## Repository

https://github.com/Soudigcar/auto-sede-automotivo

## Deploy flow

1. Open Vercel Dashboard.
2. Click New Project.
3. Import the GitHub repository `Soudigcar/auto-sede-automotivo`.
4. Keep the framework preset as Next.js.
5. Add the environment variables below.
6. Click Deploy.

## Required environment variables

```txt
NEXT_PUBLIC_SUPABASE_URL=https://wufikrdgyxrsszlbpfmv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
```

## Main UX routes after deploy

```txt
/routes
/login
/master/dashboard/live
/master/stores
/prospector/live
/store/live
/store/operation
/pre-sales
```

## Master access

Create the master user in Supabase Auth before testing login.

```txt
email: evento@bradesco.com.br
password: bradesco
```

Change this password before production usage.
