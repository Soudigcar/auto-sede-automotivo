import { PRIVACY_CONSENT_VERSION } from '@/lib/privacyConsent';

export const CONTACT_CONSENT_PURPOSES = ['commercial_contact_phone', 'commercial_contact_email', 'commercial_contact_whatsapp'];

export async function recordLeadContactConsent(input: {
  supabase: any;
  leadBaseId: string;
  source: string;
  privacyNoticeVersion?: string;
  proof?: Record<string, unknown>;
}) {
  const at = new Date().toISOString();
  const privacyNoticeVersion = input.privacyNoticeVersion || PRIVACY_CONSENT_VERSION;

  const { error: updateError } = await input.supabase
    .from('leads_base')
    .update({
      consent_given: true,
      consent_at: at,
      consent_version: PRIVACY_CONSENT_VERSION,
      consent_source: input.source,
      consent_purposes: CONTACT_CONSENT_PURPOSES,
      privacy_notice_version: privacyNoticeVersion,
      legal_basis: 'consent'
    })
    .eq('id', input.leadBaseId);
  if (updateError) throw updateError;

  const { error: proofError } = await input.supabase.from('privacy_consents').insert({
    lead_base_id: input.leadBaseId,
    consent_version: PRIVACY_CONSENT_VERSION,
    privacy_notice_version: privacyNoticeVersion,
    source: input.source,
    purposes: CONTACT_CONSENT_PURPOSES,
    granted: true,
    proof: input.proof || {},
    granted_at: at
  });
  if (proofError) throw proofError;
}
