-- AUTO CONTROLE AUTOMOTIVO
-- CAMADA DE STORAGE DO CANDIDATO DE BASELINE - NAO APLICAR EM PRODUCAO
-- Definicoes reproduzidas do catalogo atual exclusivamente para replay descartavel.
-- Aplicar como camada final do replay, depois das 45 migrations historicas e
-- de baseline_privileges_finalization_candidate.sql.

begin;

-- Buckets ausentes do historico versionado.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  type,
  avif_autodetection
)
values
  (
    'vehicle-images',
    'vehicle-images',
    true,
    null,
    null,
    'STANDARD',
    false
  ),
  (
    'stock-imports',
    'stock-imports',
    false,
    20971520,
    array[
      'text/csv',
      'text/plain',
      'text/xml',
      'application/xml',
      'application/vnd.ms-excel',
      'application/octet-stream'
    ]::text[],
    'STANDARD',
    false
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    type = excluded.type,
    avif_autodetection = excluded.avif_autodetection;

-- vehicle-images: quatro policies existentes no catalogo atual.
drop policy if exists "Authenticated can delete vehicle images" on storage.objects;
create policy "Authenticated can delete vehicle images"
on storage.objects as permissive
for delete to authenticated
using (bucket_id = 'vehicle-images'::text);

drop policy if exists "Authenticated can update vehicle images" on storage.objects;
create policy "Authenticated can update vehicle images"
on storage.objects as permissive
for update to authenticated
using (bucket_id = 'vehicle-images'::text)
with check (bucket_id = 'vehicle-images'::text);

drop policy if exists "Authenticated can upload vehicle images" on storage.objects;
create policy "Authenticated can upload vehicle images"
on storage.objects as permissive
for insert to authenticated
with check (bucket_id = 'vehicle-images'::text);

drop policy if exists "Public can read vehicle images" on storage.objects;
create policy "Public can read vehicle images"
on storage.objects as permissive
for select to public
using (bucket_id = 'vehicle-images'::text);

-- stock-imports: sete policies existentes no catalogo atual.
drop policy if exists stock_imports_master_delete on storage.objects;
create policy stock_imports_master_delete
on storage.objects as permissive
for delete to authenticated
using ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_master_insert on storage.objects;
create policy stock_imports_master_insert
on storage.objects as permissive
for insert to authenticated
with check ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_master_select on storage.objects;
create policy stock_imports_master_select
on storage.objects as permissive
for select to authenticated
using ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_master_update on storage.objects;
create policy stock_imports_master_update
on storage.objects as permissive
for update to authenticated
using ((bucket_id = 'stock-imports'::text) and is_master())
with check ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_store_insert_own on storage.objects;
create policy stock_imports_store_insert_own
on storage.objects as permissive
for insert to authenticated
with check (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
);

drop policy if exists stock_imports_store_select_own on storage.objects;
create policy stock_imports_store_select_own
on storage.objects as permissive
for select to authenticated
using (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
);

drop policy if exists stock_imports_store_update_own on storage.objects;
create policy stock_imports_store_update_own
on storage.objects as permissive
for update to authenticated
using (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
)
with check (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
);

commit;
