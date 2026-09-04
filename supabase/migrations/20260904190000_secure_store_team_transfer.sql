begin;

create table if not exists public.user_store_transfer_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  from_store_id uuid references public.stores(id) on delete restrict,
  to_store_id uuid not null references public.stores(id) on delete restrict,
  from_role text,
  to_role text not null,
  from_status text,
  invitation_link_id uuid references public.store_team_registration_links(id) on delete set null,
  full_name_snapshot text not null,
  email_snapshot text,
  transferred_at timestamptz not null default now()
);

create index if not exists user_store_transfer_history_user_idx
  on public.user_store_transfer_history(user_id, transferred_at desc);
create index if not exists user_store_transfer_history_from_store_idx
  on public.user_store_transfer_history(from_store_id, transferred_at desc);
create index if not exists user_store_transfer_history_to_store_idx
  on public.user_store_transfer_history(to_store_id, transferred_at desc);

alter table public.user_store_transfer_history enable row level security;
revoke all on table public.user_store_transfer_history from anon, authenticated;
grant select, insert on table public.user_store_transfer_history to service_role;

create or replace function private.current_app_store_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select store_id
  from public.users
  where status = 'active'
    and (
      auth_user_id = (select auth.uid())
      or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  order by case when auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;
$function$;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select role::text
  from public.users
  where status = 'active'
    and (
      auth_user_id = (select auth.uid())
      or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  order by case when auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;
$function$;

create or replace function private.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select id
  from public.users
  where status = 'active'
    and (
      auth_user_id = (select auth.uid())
      or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  order by case when auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;
$function$;

create or replace function public.transfer_store_team_member(
  p_user_id uuid,
  p_target_store_id uuid,
  p_target_role text,
  p_invitation_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user public.users%rowtype;
  v_store public.stores%rowtype;
  v_link public.store_team_registration_links%rowtype;
  v_next_routing_order integer;
  v_next_usage integer;
  v_link_status text;
begin
  if p_target_role not in ('pre_sales', 'seller', 'prospector') then
    raise exception 'INVALID_TARGET_ROLE';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.role not in ('pre_sales', 'seller', 'prospector') then
    raise exception 'USER_NOT_TRANSFERABLE';
  end if;

  select * into v_store
  from public.stores
  where id = p_target_store_id
    and status = 'active'
    and portal_enabled = true;

  if not found then
    raise exception 'TARGET_STORE_UNAVAILABLE';
  end if;

  select * into v_link
  from public.store_team_registration_links
  where id = p_invitation_link_id
  for update;

  if not found
     or v_link.store_id <> p_target_store_id
     or v_link.role::text <> p_target_role
     or v_link.status <> 'active'
     or (v_link.expires_at is not null and v_link.expires_at <= now())
     or (v_link.max_uses is not null and v_link.usage_count >= v_link.max_uses) then
    raise exception 'INVITATION_NOT_VALID';
  end if;

  if v_user.store_id = p_target_store_id then
    return jsonb_build_object(
      'status', 'already_member',
      'user_id', v_user.id,
      'store_id', p_target_store_id,
      'role', v_user.role
    );
  end if;

  insert into public.user_store_transfer_history (
    user_id,
    from_store_id,
    to_store_id,
    from_role,
    to_role,
    from_status,
    invitation_link_id,
    full_name_snapshot,
    email_snapshot
  ) values (
    v_user.id,
    v_user.store_id,
    p_target_store_id,
    v_user.role,
    p_target_role,
    v_user.status,
    v_link.id,
    v_user.full_name,
    v_user.email
  );

  if v_user.role = 'prospector' then
    update public.prospectors
    set status = 'inactive', updated_at = now()
    where user_id = v_user.id
      and store_id = v_user.store_id
      and status <> 'inactive';
  end if;

  select coalesce(max(routing_order), -1) + 1
    into v_next_routing_order
  from public.users
  where store_id = p_target_store_id
    and role::text = p_target_role;

  update public.users
  set store_id = p_target_store_id,
      role = p_target_role,
      status = 'active',
      receives_leads = false,
      routing_order = greatest(0, coalesce(v_next_routing_order, 0)),
      max_open_leads = null,
      must_change_password = false,
      updated_at = now()
  where id = v_user.id;

  if p_target_role = 'prospector' then
    update public.prospectors
    set event_id = v_store.event_id,
        full_name = v_user.full_name,
        phone = v_user.phone,
        email = v_user.email,
        status = 'active',
        updated_at = now()
    where id = (
      select id
      from public.prospectors
      where user_id = v_user.id
        and store_id = p_target_store_id
      order by created_at desc
      limit 1
    );

    if not found then
      insert into public.prospectors (
        user_id,
        event_id,
        full_name,
        phone,
        email,
        status,
        store_id
      ) values (
        v_user.id,
        v_store.event_id,
        v_user.full_name,
        v_user.phone,
        v_user.email,
        'active',
        p_target_store_id
      );
    end if;
  end if;

  v_next_usage := coalesce(v_link.usage_count, 0) + 1;
  v_link_status := case
    when v_link.max_uses is not null and v_next_usage >= v_link.max_uses then 'expired'
    else 'active'
  end;

  update public.store_team_registration_links
  set usage_count = v_next_usage,
      last_used_at = now(),
      status = v_link_status,
      updated_at = now()
  where id = v_link.id;

  insert into public.audit_logs (
    event_id,
    action_type,
    entity_type,
    entity_id,
    new_value
  ) values (
    v_store.event_id,
    'team_member_store_transferred',
    'users',
    v_user.id,
    jsonb_build_object(
      'from_store_id', v_user.store_id,
      'to_store_id', p_target_store_id,
      'from_role', v_user.role,
      'to_role', p_target_role,
      'invitation_link_id', v_link.id,
      'source', 'team_registration_link'
    )
  );

  return jsonb_build_object(
    'status', 'transferred',
    'user_id', v_user.id,
    'from_store_id', v_user.store_id,
    'to_store_id', p_target_store_id,
    'role', p_target_role,
    'store_slug', v_store.slug
  );
end;
$function$;

revoke all on function public.transfer_store_team_member(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.transfer_store_team_member(uuid, uuid, text, uuid) to service_role;

commit;
