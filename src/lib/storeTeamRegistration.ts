export const TEAM_REGISTRATION_PASSWORD_MIN_LENGTH = 12;

export const TEAM_REGISTRATION_PASSWORD_HINT =
  'Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo.';

export function teamRegistrationPasswordError(password: string) {
  if (
    password.length < TEAM_REGISTRATION_PASSWORD_MIN_LENGTH ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'Use ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo.';
  }

  return null;
}

export function asTeamRegistrationUrl(value: unknown) {
  if (typeof value !== 'string') return null;

  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 3 || segments[0] !== 'equipe' || segments[1] !== 'cadastro' || !segments[2]) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
