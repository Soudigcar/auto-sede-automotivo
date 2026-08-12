-- AUTO CONTROLE AUTOMOTIVO
-- Etapa 1 - isolamento estrito de carteira para Pipeline e Inbox.
--
-- IMPORTANTE:
-- Esta migration foi versionada para Preview/revisao e NAO deve ser aplicada
-- ao banco de Production sem autorizacao explicita.
--
-- Regra central:
--   leads.assigned_user_id = responsavel ATUAL pelo lead.
-- Campos especializados (pre_sales_user_id, seller_user_id, captured_by_user_id)
-- preservam funcao/historico, mas nao concedem acesso de carteira.

begin;

create or replace function private.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and (
        public.current_app_role() = 'master'
        or (
          public.current_app_role() = 'store'
          and l.assigned_store_id = public.current_app_store_id()
        )
        or (
          public.current_app_role() in ('pre_sales', 'seller', 'prospector')
          and l.assigned_store_id = public.current_app_store_id()
          and l.assigned_user_id = public.current_app_user_id()
        )
      )
  );
$$;

revoke all on function private.can_access_lead(uuid) from public, anon;
grant execute on function private.can_access_lead(uuid) to authenticated, service_role;

create or replace function private.can_access_whatsapp_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.whatsapp_conversations c
    left join public.leads l on l.id = c.lead_id
    where c.id = p_conversation_id
      and (
        public.current_app_role() = 'master'
        or (
          public.current_app_role() = 'store'
          and c.store_id = public.current_app_store_id()
        )
        or (
          public.current_app_role() in ('pre_sales', 'seller', 'prospector')
          and c.store_id = public.current_app_store_id()
          and l.assigned_store_id = public.current_app_store_id()
          and l.assigned_user_id = public.current_app_user_id()
        )
      )
  );
$$;

revoke all on function private.can_access_whatsapp_conversation(uuid) from public, anon;
grant execute on function private.can_access_whatsapp_conversation(uuid) to authenticated, service_role;

-- Conversas: colaborador ve somente conversas cujo lead esta em sua carteira atual.
drop policy if exists whatsapp_conversations_master_or_store_select on public.whatsapp_conversations;
create policy whatsapp_conversations_master_or_store_select
on public.whatsapp_conversations
for select to authenticated
using (private.can_access_whatsapp_conversation(id));

-- Mensagens herdam exatamente o acesso da conversa.
drop policy if exists whatsapp_messages_master_or_store_select on public.whatsapp_messages;
create policy whatsapp_messages_master_or_store_select
on public.whatsapp_messages
for select to authenticated
using (private.can_access_whatsapp_conversation(conversation_id));

-- Contatos deixam de ser visiveis para qualquer colaborador da mesma loja.
-- Gestor continua vendo todos os contatos da loja; colaboradores precisam ter
-- ao menos uma conversa acessivel vinculada ao contato.
drop policy if exists whatsapp_contacts_master_or_store_select on public.whatsapp_contacts;
create policy whatsapp_contacts_master_or_store_select
on public.whatsapp_contacts
for select to authenticated
using (
  public.current_app_role() = 'master'
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
  or (
    public.current_app_role() in ('pre_sales', 'seller', 'prospector')
    and store_id = public.current_app_store_id()
    and exists (
      select 1
      from public.whatsapp_conversations c
      where c.contact_id = whatsapp_contacts.id
        and private.can_access_whatsapp_conversation(c.id)
    )
  )
);

create index if not exists idx_leads_store_assigned_user
  on public.leads (assigned_store_id, assigned_user_id)
  where assigned_user_id is not null;

create index if not exists idx_whatsapp_conversations_store_lead
  on public.whatsapp_conversations (store_id, lead_id)
  where lead_id is not null;

commit;
