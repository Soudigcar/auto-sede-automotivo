begin;

-- Cache durável, privado e versionado das fotos de perfil do WhatsApp.
-- Não há policies para anon/authenticated: somente o backend com service_role
-- pode ler ou gravar objetos, sempre por meio do proxy autenticado da aplicação.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'whatsapp-profile-pictures-v1',
  'whatsapp-profile-pictures-v1',
  false,
  1048576,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
