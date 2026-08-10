alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (
    origin::text = any (
      array[
        'street_survey'::text,
        'quick_registration'::text,
        'manual'::text,
        'Facebook Lead Ads'::text,
        'facebook_lead_ads'::text,
        'WhatsApp Oficial'::text,
        'whatsapp_official'::text,
        'WATI / Click-to-WhatsApp'::text,
        'wati_leads'::text,
        'WATI'::text
      ]
    )
  );

