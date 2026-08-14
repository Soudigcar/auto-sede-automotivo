-- AUTO CONTROLE AUTOMOTIVO
-- Fundacao para multiplos canais WhatsApp por loja.
--
-- IMPORTANTE:
-- Esta migration apenas prepara o schema para um WhatsApp principal por loja
-- e canais opcionais vinculados a colaboradores. Ela deve ser aplicada ao
-- banco somente mediante autorizacao explicita.
--
-- Compatibilidade:
-- - todas as integracoes existentes permanecem como channel_type = 'primary';
-- - instance_name e crm_number_id existentes nao sao alterados;
-- - a Master continua com uma unica integracao e sem owner_user_id;
-- - nenhum canal de colaborador e criado por esta migration.

begin;

alter table public.store_whatsapp_integrations
  add column if not exists channel_type text;

alter table public.store_whatsapp_integrations
  add column if not exists owner_user_id uuid references public.users(id) on delete set null;

update public.store_whatsapp_integrations
set channel_type = 'primary'
where channel_type is null;

alter table public.store_whatsapp_integrations
  alter column channel_type set default 'primary',
  alter column channel_type set not null;

alter table public.store_whatsapp_integrations
  drop constraint if exists store_whatsapp_integrations_channel_type_check;

alter table public.store_whatsapp_integrations
  add constraint store_whatsapp_integrations_channel_type_check
  check (channel_type in ('primary', 'employee'));

alter table public.store_whatsapp_integrations
  drop constraint if exists store_whatsapp_integrations_channel_owner_check;

alter table public.store_whatsapp_integrations
  add constraint store_whatsapp_integrations_channel_owner_check
  check (
    (scope = 'master' and channel_type = 'primary' and owner_user_id is null)
    or
    (scope = 'store' and channel_type = 'primary' and owner_user_id is null)
    or
    (scope = 'store' and channel_type = 'employee' and owner_user_id is not null)
  );

-- Remove somente a restricao que hoje limita toda loja a uma unica integracao.
-- Ela e substituida por unicidade especifica do canal principal.
drop index if exists public.store_whatsapp_integrations_store_scope_key;

create unique index if not exists store_whatsapp_integrations_store_primary_key
  on public.store_whatsapp_integrations(store_id)
  where scope = 'store' and channel_type = 'primary';

create unique index if not exists store_whatsapp_integrations_store_employee_owner_key
  on public.store_whatsapp_integrations(store_id, owner_user_id)
  where scope = 'store' and channel_type = 'employee';

create index if not exists store_whatsapp_integrations_owner_user_idx
  on public.store_whatsapp_integrations(owner_user_id)
  where owner_user_id is not null;

comment on column public.store_whatsapp_integrations.channel_type is
  'Tipo do canal: primary para o WhatsApp principal da loja/Master ou employee para um canal opcional de colaborador.';

comment on column public.store_whatsapp_integrations.owner_user_id is
  'Colaborador proprietario do canal quando channel_type=employee; nulo para canais principais.';

commit;
