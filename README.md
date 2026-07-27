# AUTO CONTROLE AUTOMOTIVO

Sistema de gestão de leads, fluxo de pessoas, lojas participantes, pré-vendas, estoque, vendas, perdas, marketplace permanente e dashboards para operações e eventos automotivos.

## Official Domains

- Public marketplace: `https://autosede.com.br`
- Internal system: `https://sistemaautomotivo.autosede.com.br`

DNS and production-domain settings are managed outside this repository through Vercel, Hostinger and Supabase Auth configuration.

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

- Public Automotive Marketplace
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
- Event Management

## Development Flow

1. Create a Supabase project.
2. Run the versioned database migrations.
3. Copy `.env.example` to `.env.local` when the example file is available.
4. Add the required Supabase credentials using environment variables.
5. Run the app in a controlled development environment.
6. Deploy to Vercel.

## Master Access

Create the initial Master account directly in Supabase Auth and link it to the `users` table.

Never store production e-mail addresses, passwords, tokens, service-role keys or recovery codes in this repository. Use a password manager and force password rotation whenever a credential may have been exposed.
