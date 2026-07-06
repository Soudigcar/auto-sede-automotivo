# AUTO CONTROLE AUTOMOTIVO

Sistema de gestão de leads, fluxo de pessoas, lojas participantes, pré-vendas, estoque, vendas, perdas e dashboards para eventos automotivos.

## Technical Standard

- Codebase, database, variables, API routes and technical files: English.
- User interface, labels, buttons, menus and dashboard copy: Brazilian Portuguese.

## MVP Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Vercel Deploy
- GitHub Codespaces for cloud development

## Main Modules

- Master Dashboard
- Prospector Panel
- Street Survey
- Quick Registration
- Store Panel
- Lead Pipeline
- Pre-sales Panel
- Inventory
- Sales
- Losses
- Audit Logs

## Development Flow

1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env.local`.
4. Add Supabase credentials.
5. Run the app in GitHub Codespaces.
6. Deploy to Vercel.

## Initial Master Access

The initial master account should be created in Supabase Auth and linked to the `users` table.

```txt
email: evento@bradesco.com.br
password: bradesco
```

For production, force password change after first login.
