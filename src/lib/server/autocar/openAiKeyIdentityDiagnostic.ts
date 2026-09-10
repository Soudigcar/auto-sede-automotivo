import { createHash } from 'node:crypto';

export const OPENAI_KEY_IDENTITY_DIAGNOSTIC_BRANCH = 'test/autocar-follow-up-v2-generation-canary';
export const OPENAI_KEY_IDENTITY_DIAGNOSTIC_CONFIRMATION = 'synthetic-key-identity-only';

export type OpenAiKeyIdentityDiagnosticEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

export type OpenAiKeyIdentityDiagnosticPorts = {
  fetchFn: typeof fetch;
};

const defaultPorts: OpenAiKeyIdentityDiagnosticPorts = {
  fetchFn: fetch
};

function fingerprint(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function safeText(value: unknown, maxLength = 120) {
  const normalized = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeCode(value: unknown, fallback: string) {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return normalized || fallback;
}

function safeRequestId(value: unknown) {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9._:-]+/g, '').slice(0, 160);
  return normalized || null;
}

export function assertOpenAiKeyIdentityDiagnosticEnvironment(environment: OpenAiKeyIdentityDiagnosticEnvironment) {
  if (environment.VERCEL_ENV !== 'preview') throw new Error('openai_key_identity_diagnostic_preview_only');
  if (environment.VERCEL_GIT_COMMIT_REF !== OPENAI_KEY_IDENTITY_DIAGNOSTIC_BRANCH) {
    throw new Error('openai_key_identity_diagnostic_branch_only');
  }
}

function currentEnvironment(): OpenAiKeyIdentityDiagnosticEnvironment {
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF
  };
}

export async function runOpenAiKeyIdentityDiagnostic(options: {
  environment?: OpenAiKeyIdentityDiagnosticEnvironment;
  apiKey?: string | null;
  ports?: OpenAiKeyIdentityDiagnosticPorts;
} = {}) {
  const environment = options.environment || currentEnvironment();
  const ports = options.ports || defaultPorts;
  assertOpenAiKeyIdentityDiagnosticEnvironment(environment);

  const apiKey = String(options.apiKey ?? process.env.OPENAI_API_KEY ?? '').trim();
  if (!apiKey) {
    return {
      ok: false,
      diagnostic: 'openai_key_identity_only',
      reason: 'missing_api_key',
      safety: { preview_only: true, branch_only: true, key_exposed: false, persistence_enabled: false, outbound_enabled: false }
    };
  }

  let response: Response;
  try {
    response = await ports.fetchFn('https://api.openai.com/v1/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store'
    });
  } catch (error) {
    return {
      ok: false,
      diagnostic: 'openai_key_identity_only',
      reason: 'transport_failure',
      safety: { preview_only: true, branch_only: true, key_exposed: false, persistence_enabled: false, outbound_enabled: false },
      error: { code: safeCode((error as any)?.code || (error as any)?.name, 'transport_error') }
    };
  }

  const payload = await response.json().catch(() => ({}));
  const requestId = safeRequestId(response.headers.get('x-request-id'));

  if (!response.ok) {
    return {
      ok: false,
      diagnostic: 'openai_key_identity_only',
      reason: 'identity_request_failed',
      safety: { preview_only: true, branch_only: true, key_exposed: false, persistence_enabled: false, outbound_enabled: false },
      error: {
        status: response.status,
        code: safeCode(payload?.error?.code || payload?.error?.type, `http_${response.status}`),
        request_id: requestId
      }
    };
  }

  const rawOrganizations = Array.isArray(payload?.orgs?.data) ? payload.orgs.data : [];
  const requestOrganizationId = String(
    response.headers.get('openai-organization') || response.headers.get('x-openai-organization') || ''
  ).trim();

  const organizations = rawOrganizations.map((organization: any) => {
    const id = String(organization?.id || '').trim();
    return {
      title: safeText(organization?.title || organization?.name),
      id_fingerprint: fingerprint(id),
      matches_request_context: Boolean(requestOrganizationId && id && requestOrganizationId === id)
    };
  });
  const matchedOrganization = organizations.find((organization: any) => organization.matches_request_context) || null;

  return {
    ok: true,
    diagnostic: 'openai_key_identity_only',
    reason: 'identity_resolved',
    safety: { preview_only: true, branch_only: true, key_exposed: false, persistence_enabled: false, outbound_enabled: false },
    user: { id_fingerprint: fingerprint(payload?.id) },
    organizations,
    request_context: {
      organization_fingerprint: fingerprint(requestOrganizationId),
      organization_title: matchedOrganization?.title || null,
      organization_match_found: Boolean(matchedOrganization),
      request_id: requestId
    }
  };
}
