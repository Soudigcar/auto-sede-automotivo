begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.store_registration_links
  add column if not exists public_token_hash text;

update public.store_registration_links
set public_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
where public_token is not null
  and public_token_hash is null;

alter table public.store_team_registration_links
  add column if not exists token_hash text;

update public.store_team_registration_links
set token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
where token is not null
  and token_hash is null;

commit;
