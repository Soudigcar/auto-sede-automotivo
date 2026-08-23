export const AUTOCAR_PROTECTED_RESUME_SOURCE = 'autocar_handoff';
export const AUTOCAR_PROTECTED_RESUME_MIN_REASON_LENGTH = 12;
export const AUTOCAR_DEFAULT_RESUME_REASON = 'Retomada manual pelo Portal da Loja.';

type ResumeRuntimeState = {
  human_state?: unknown;
  paused_by_source?: unknown;
};

type ResumeDecisionInput = {
  runtime?: ResumeRuntimeState | null;
  actorRole?: unknown;
  resumeReason?: unknown;
  confirmed?: unknown;
};

export type AutocarResumeDecision =
  | {
      allowed: true;
      protectedResume: boolean;
      resumeReason: string;
      status: 200;
    }
  | {
      allowed: false;
      protectedResume: boolean;
      error: string;
      status: 400 | 403 | 409;
    };

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isProtectedAutocarResumeState(runtime?: ResumeRuntimeState | null) {
  if (!runtime) return false;
  const humanState = normalize(runtime.human_state);
  const pauseSource = normalize(runtime.paused_by_source);
  return (humanState === 'human_active' || humanState === 'paused')
    && pauseSource === AUTOCAR_PROTECTED_RESUME_SOURCE;
}

export function evaluateAutocarResumeRequest(input: ResumeDecisionInput): AutocarResumeDecision {
  const runtime = input.runtime || null;
  const humanState = normalize(runtime?.human_state);
  const role = normalize(input.actorRole);
  const protectedResume = isProtectedAutocarResumeState(runtime);

  if (humanState !== 'human_active' && humanState !== 'paused') {
    return {
      allowed: false,
      protectedResume,
      error: 'A conversa não está em atendimento humano e não pode ser retomada.',
      status: 409
    };
  }

  if (role !== 'master' && role !== 'store') {
    return {
      allowed: false,
      protectedResume,
      error: 'Usuário sem permissão para reativar a AUTOCAR nesta conversa.',
      status: 403
    };
  }

  const resumeReason = String(input.resumeReason || '').trim();

  if (protectedResume) {
    if (role !== 'master') {
      return {
        allowed: false,
        protectedResume: true,
        error: 'Retomada protegida por handoff: somente Master pode devolver esta conversa para a AUTOCAR.',
        status: 403
      };
    }

    if (resumeReason.length < AUTOCAR_PROTECTED_RESUME_MIN_REASON_LENGTH) {
      return {
        allowed: false,
        protectedResume: true,
        error: `Informe um motivo com pelo menos ${AUTOCAR_PROTECTED_RESUME_MIN_REASON_LENGTH} caracteres para a retomada protegida.`,
        status: 400
      };
    }

    if (input.confirmed !== true) {
      return {
        allowed: false,
        protectedResume: true,
        error: 'A retomada protegida exige confirmação explícita do Master.',
        status: 400
      };
    }
  }

  return {
    allowed: true,
    protectedResume,
    resumeReason: resumeReason || AUTOCAR_DEFAULT_RESUME_REASON,
    status: 200
  };
}
