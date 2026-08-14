-- Distingue agendamento comum de visita no Pipeline da Loja.

begin;

alter table public.leads
  add column if not exists appointment_type text;

alter table public.leads
  drop constraint if exists leads_appointment_type_check;

alter table public.leads
  add constraint leads_appointment_type_check
  check (
    appointment_type is null
    or appointment_type in ('appointment', 'visit')
  );

comment on column public.leads.appointment_type is
  'Tipo do compromisso do lead: appointment (agendamento) ou visit (visita).';

commit;
