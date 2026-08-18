export const PRIVACY_CONSENT_VERSION = '2026-08-18';
export const PRIVACY_CONSENT_KEY = 'auto-controle-privacy-consent';
export const PRIVACY_CONSENT_EVENT = 'auto-controle-privacy-consent-change';

export type PrivacyConsent = {
  version: string;
  decidedAt: string;
  essential: true;
  analytics: boolean;
  advertising: boolean;
};

export function readPrivacyConsent(): PrivacyConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(PRIVACY_CONSENT_KEY) || 'null');
    if (!value || value.version !== PRIVACY_CONSENT_VERSION || value.essential !== true) return null;
    return {
      version: value.version,
      decidedAt: String(value.decidedAt || ''),
      essential: true,
      analytics: value.analytics === true,
      advertising: value.advertising === true
    };
  } catch {
    return null;
  }
}

export function hasAdvertisingConsent() {
  return readPrivacyConsent()?.advertising === true;
}

export function savePrivacyConsent(optional: boolean) {
  const consent: PrivacyConsent = {
    version: PRIVACY_CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    essential: true,
    analytics: optional,
    advertising: optional
  };

  window.localStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify(consent));
  document.cookie = `auto_controle_consent=${encodeURIComponent(JSON.stringify(consent))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_EVENT, { detail: consent }));
  return consent;
}
