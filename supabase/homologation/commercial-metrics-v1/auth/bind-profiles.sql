-- Audit tags only: these settings do NOT prove database identity.
-- Require a fresh official branch preflight and an explicit verified connection before applying.
-- Isolated project installation only. No operational migrations or integrations.
do $$
declare ref text := current_setting('app.metrics_project_ref',true);
begin
 if current_setting('app.metrics_homologation',true) is distinct from 'synthetic-only'
 or ref is null or ref !~ '^[a-z]{20}$'
 or ref in ('wufikrdgyxrsszlbpfmv','icmwdggbvijexjgrvsbl','azszzdotbrczlhrmhrlw','hfzmzfhuhukmxkxbkxay')
 or current_setting('app.metrics_preflight',true) is distinct from 'branch-metadata-v1'
 then raise exception 'Unverified homologation database'; end if;
end $$;
-- Run only after separately authorized synthetic Auth provisioning.
-- Does not create users, send email, or set passwords.
do $$ begin
 if (select count(*) from auth.users where email in(select email from public.users where email ~ '^synthetic-[1-9]@metrics\.invalid$')) <> 9 then
 raise exception 'Synthetic Auth accounts must be provisioned first'; end if;
end $$;
update public.users p set auth_user_id=a.id from auth.users a
where p.email=a.email and p.email ~ '^synthetic-[1-9]@metrics\.invalid$';
