alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (
    origin::text = any (
      array[
        'street_survey',
        'quick_registration',
        'manual',
        'Facebook Lead Ads',
        'facebook_lead_ads',
        'WhatsApp Oficial',
        'whatsapp_official'
      ]::text[]
    )
  );

