type Environment = Record<string, string | undefined>;

const cleanSecret = (value: unknown) => String(value || '').trim();

export type UmblerServerConfig = {
  verifyToken: string;
  hasVerifyToken: boolean;
};

export function getUmblerServerConfig(environment: Environment = process.env): UmblerServerConfig {
  const candidate = cleanSecret(environment.UMBLER_WEBHOOK_TOKEN);
  const verifyToken = candidate.length >= 16 ? candidate : '';

  return {
    verifyToken,
    hasVerifyToken: Boolean(verifyToken)
  };
}

export function stripStoredUmblerSecrets(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const { verify_token: _verifyToken, ...safeSettings } = value as Record<string, unknown>;
  return safeSettings;
}

export function publicUmblerSettings(
  value: unknown,
  config: UmblerServerConfig = getUmblerServerConfig()
) {
  return {
    ...stripStoredUmblerSecrets(value),
    has_verify_token: config.hasVerifyToken
  };
}
