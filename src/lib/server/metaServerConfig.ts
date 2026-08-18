import { createHash } from 'node:crypto';

const rejectedVerifyTokenDigests = new Set([
  '8a7df36378c5680db4b2ad9ded4dc6e963a3ca2f7ccdae79eb77921edb0c7c98'
]);

type Environment = Record<string, string | undefined>;

const cleanSecret = (value: unknown) => String(value || '').trim();
const secretDigest = (value: string) => createHash('sha256').update(value).digest('hex');

export type MetaServerConfig = {
  pageAccessToken: string;
  verifyToken: string;
  hasPageAccessToken: boolean;
  hasVerifyToken: boolean;
};

export function getMetaServerConfig(environment: Environment = process.env): MetaServerConfig {
  const pageAccessToken = cleanSecret(environment.META_PAGE_ACCESS_TOKEN);
  const candidateVerifyToken = cleanSecret(environment.META_LEADS_VERIFY_TOKEN);
  const verifyToken = rejectedVerifyTokenDigests.has(secretDigest(candidateVerifyToken)) ? '' : candidateVerifyToken;

  return {
    pageAccessToken,
    verifyToken,
    hasPageAccessToken: Boolean(pageAccessToken),
    hasVerifyToken: Boolean(verifyToken)
  };
}

export function stripStoredMetaSecrets(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const {
    page_access_token: _pageAccessToken,
    verify_token: _verifyToken,
    ...safeSettings
  } = value as Record<string, unknown>;

  return safeSettings;
}

export function publicMetaSettings(
  value: unknown,
  config: MetaServerConfig = getMetaServerConfig()
) {
  return {
    ...stripStoredMetaSecrets(value),
    has_page_access_token: config.hasPageAccessToken,
    has_verify_token: config.hasVerifyToken
  };
}

export function redactMetaSecrets<T>(value: T, config: MetaServerConfig = getMetaServerConfig()): T {
  const secrets = [config.pageAccessToken, config.verifyToken].filter(Boolean);

  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit);

    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([key]) => !/(?:^|_)(?:access_)?token$|secret/i.test(key))
          .map(([key, item]) => [key, visit(item)])
      );
    }

    if (typeof input === 'string') {
      return secrets.reduce((safe, secret) => safe.split(secret).join('[REDACTED]'), input);
    }

    return input;
  };

  return visit(value) as T;
}
