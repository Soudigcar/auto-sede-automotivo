-- Corrige as constraints de leads usadas pelo fluxo VENDIDO do Estoque.
-- Mantem todos os valores previamente aceitos e adiciona somente os valores
-- ja utilizados pela RPC store_confirm_inventory_sale_transaction.

begin;

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
        'event_landing'::text,
        'Facebook Lead Ads'::text,
        'facebook_lead_ads'::text,
        'WhatsApp Oficial'::text,
        'whatsapp_official'::text,
        'WATI / Click-to-WhatsApp'::text,
        'wati_leads'::text,
        'WATI'::text,
        'marketplace_site'::text,
        'Umbler Talk / WhatsApp'::text,
        'umbler_talk'::text,
        'inventory_sale_door'::text,
        'inventory_sale_internet'::text,
        'inventory_sale_event'::text
      ]
    )
  );

alter table public.leads
  drop constraint if exists leads_assigned_user_role_check;

alter table public.leads
  add constraint leads_assigned_user_role_check
  check (
    assigned_user_role is null
    or assigned_user_role = any (
      array[
        'store'::text,
        'pre_sales'::text,
        'seller'::text,
        'prospector'::text
      ]
    )
  );

commit;
