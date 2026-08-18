begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- O segredo do webhook Umbler passa a existir somente na configuração
-- server-side da Vercel. A aplicação não lê nem persiste mais este campo.
update public.marketing_integrations
set settings = coalesce(settings, '{}'::jsonb) - 'verify_token',
    updated_at = now()
where integration_type = 'umbler_talk'
  and coalesce(settings, '{}'::jsonb) ? 'verify_token';

-- Mantém a mesma autorização, mas isola auth.jwt() em um InitPlan explícito.
-- O advisor do Supabase reconhece a função apenas quando o SELECT envolve a
-- chamada, e não toda a expressão que extrai o e-mail do JWT.
drop policy if exists secure_users_select on public.users;
create policy secure_users_select
on public.users for select to authenticated
using (
  (select private.is_master())
  or auth_user_id = (select auth.uid())
  or lower(email::text) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  or (
    store_id = (select private.current_app_store_id())
    and (select private.current_app_role()) in ('store','pre_sales','seller','prospector')
  )
);

commit;
