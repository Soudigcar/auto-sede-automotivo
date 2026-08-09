update public.users u
set auth_user_id = au.id,
    updated_at = now()
from auth.users au
where u.auth_user_id is null
  and u.email is not null
  and au.email is not null
  and lower(trim(u.email)) = lower(trim(au.email))
  and lower(coalesce(u.role, '')) = 'master'
  and lower(coalesce(u.status, '')) = 'active';

