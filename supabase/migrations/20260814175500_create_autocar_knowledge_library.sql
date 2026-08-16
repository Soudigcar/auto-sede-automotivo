begin;

create extension if not exists vector with schema extensions;

create table public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('method', 'store')),
  store_id uuid references public.stores(id) on delete cascade,
  title text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  checksum_sha256 text not null,
  storage_bucket text not null default 'autocar-knowledge',
  storage_path text not null unique,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed', 'archived')),
  extracted_characters integer not null default 0 check (extracted_characters >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  embedding_model text,
  extraction_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_documents_scope_store_check check (
    (scope = 'method' and store_id is null)
    or (scope = 'store' and store_id is not null)
  )
);

create table public.ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ai_knowledge_documents(id) on delete cascade,
  scope text not null check (scope in ('method', 'store')),
  store_id uuid references public.stores(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  content_hash text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  embedding extensions.vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_knowledge_chunks_document_index_unique unique (document_id, chunk_index),
  constraint ai_knowledge_chunks_scope_store_check check (
    (scope = 'method' and store_id is null)
    or (scope = 'store' and store_id is not null)
  )
);

create unique index ai_knowledge_documents_method_checksum_unique
  on public.ai_knowledge_documents(checksum_sha256)
  where scope = 'method' and status <> 'archived';

create unique index ai_knowledge_documents_store_checksum_unique
  on public.ai_knowledge_documents(store_id, checksum_sha256)
  where scope = 'store' and status <> 'archived';

create index ai_knowledge_documents_scope_status_idx
  on public.ai_knowledge_documents(scope, store_id, status, created_at desc);

create index ai_knowledge_chunks_document_idx
  on public.ai_knowledge_chunks(document_id, chunk_index);

create index ai_knowledge_chunks_store_idx
  on public.ai_knowledge_chunks(store_id, scope)
  where store_id is not null;

create or replace function private.enforce_autocar_knowledge_scope()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  document_scope text;
  document_store_id uuid;
begin
  if tg_table_name = 'ai_knowledge_documents' then
    if new.scope = 'method' and new.store_id is not null then
      raise exception 'AUTOCAR method knowledge cannot belong to one store';
    end if;
    if new.scope = 'store' and new.store_id is null then
      raise exception 'AUTOCAR store knowledge requires store_id';
    end if;
    return new;
  end if;

  select d.scope, d.store_id
    into document_scope, document_store_id
  from public.ai_knowledge_documents d
  where d.id = new.document_id;

  if document_scope is null then
    raise exception 'AUTOCAR knowledge document not found';
  end if;

  if new.scope is distinct from document_scope or new.store_id is distinct from document_store_id then
    raise exception 'AUTOCAR knowledge chunk scope does not match document';
  end if;

  return new;
end;
$$;

create trigger ai_knowledge_documents_scope_guard
before insert or update on public.ai_knowledge_documents
for each row execute function private.enforce_autocar_knowledge_scope();

create trigger ai_knowledge_chunks_scope_guard
before insert or update on public.ai_knowledge_chunks
for each row execute function private.enforce_autocar_knowledge_scope();

create or replace function public.match_autocar_knowledge(
  p_store_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  scope text,
  store_id uuid,
  title text,
  content text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id as chunk_id,
    d.id as document_id,
    d.scope,
    d.store_id,
    d.title,
    c.content,
    (1 - (c.embedding <=> p_query_embedding))::double precision as similarity
  from public.ai_knowledge_chunks c
  join public.ai_knowledge_documents d on d.id = c.document_id
  where d.status = 'ready'
    and (
      d.scope = 'method'
      or (d.scope = 'store' and d.store_id = p_store_id)
    )
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 8), 20));
$$;

revoke all on function public.match_autocar_knowledge(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_autocar_knowledge(uuid, extensions.vector, integer) to service_role;

alter table public.ai_knowledge_documents enable row level security;
alter table public.ai_knowledge_chunks enable row level security;

revoke all on table public.ai_knowledge_documents from anon, authenticated;
revoke all on table public.ai_knowledge_chunks from anon, authenticated;
grant all on table public.ai_knowledge_documents to service_role;
grant all on table public.ai_knowledge_chunks to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'autocar-knowledge',
  'autocar-knowledge',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.ai_knowledge_documents is 'Private AUTOCAR document library. Method documents are global; store documents are tenant-scoped.';
comment on table public.ai_knowledge_chunks is 'Semantic chunks used by AUTOCAR retrieval. Global method chunks and current-store chunks are the only eligible scopes.';
comment on function public.match_autocar_knowledge(uuid, extensions.vector, integer) is 'Service-role semantic retrieval for AUTOCAR using official Venda Mais knowledge plus the current store knowledge.';

commit;
