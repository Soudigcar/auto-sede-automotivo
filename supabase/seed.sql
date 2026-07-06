insert into public.events (event_name, start_date, end_date, location, status)
values ('Evento MVP AUTO CONTROLE AUTOMOTIVO', current_date, current_date, 'Evento automotivo', 'active');

insert into public.stores (event_id, store_name, responsible_name, responsible_phone, responsible_email, status)
select id, 'Loja Participante Demo', 'Responsavel Demo', '00000000000', 'loja@demo.com', 'active'
from public.events
where event_name = 'Evento MVP AUTO CONTROLE AUTOMOTIVO'
limit 1;
