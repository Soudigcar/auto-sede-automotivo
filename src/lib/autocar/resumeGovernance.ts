export const AUTOCAR_PROTECTED_RESUME_SOURCE = 'autocar_handoff';
export const AUTOCAR_PROTECTED_RESUME_MIN_REASON_LENGTH = 12;
export const AUTOCAR_DEFAULT_RESUME_REASON = 'Retomada manual pelo Portal da Loja.';
export const AUTOCAR_RESUME_AUDIT_SOURCE = 'store_portal_runtime';

export type AutocarResumeRuntimeState = {
  effective_mode?: unknown;
  human_state?: unknown;
  paused_by_source?: unknown;
};

export type AutocarResumeAuditRecord = {
  id?: unknown;
  request_id?: unknown;
  store_id?: unknown;
  production_conversation_id?: unknown;
  actor_profile_id?: unknown;
  actor_role?: unknown;
  resume_source?: unknown;
  protected_resume?: unknown;
  created_at?: unknown;
};

type ResumeDecisionInput = {
  runtime?: AutocarResumeRuntimeState | null;
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

type ResumeReplayContext = {
  requestId: unknown;
  storeId: unknown;
  productionConversationId: unknown;
  actorProfileId: unknown;
  actorRole: unknown;
  resumeSource?: unknown;
};

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeAutocarResumeRequestId(value: unknown) {
  const requestId = normalize(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId)) {
    return null;
  }
  return requestId;
}

export function isProtectedAutocarResumeState(runtime?: AutocarResumeRuntimeState | null) {
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
        error: 'Retomada protegida por handoff: somente o Master pode devolver esta conversa para a AUTOCAR.',
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

export function isAutocarResumeAuditReplayMatch(
  audit: AutocarResumeAuditRecord | null | undefined,
  context: ResumeReplayContext
) {
  if (!audit) return false;
  const expectedRequestId = normalizeAutocarResumeRequestId(context.requestId);
  const auditRequestId = normalizeAutocarResumeRequestId(audit.request_id);
  if (!expectedRequestId || auditRequestId !== expectedRequestId) return false;

  return normalize(audit.store_id) === normalize(context.storeId)
    && normalize(audit.production_conversation_id) === normalize(context.productionConversationId)
    && normalize(audit.actor_profile_id) === normalize(context.actorProfileId)
    && normalize(audit.actor_role) === normalize(context.actorRole)
    && normalize(audit.resume_source) === normalize(context.resumeSource || AUTOCAR_RESUME_AUDIT_SOURCE);
}

export function buildAutocarResumeSuccessMessage(input: {
  runtime?: AutocarResumeRuntimeState | null;
  protectedResume?: boolean;
  idempotentReplay?: boolean;
}) {
  const mode = normalize(input.runtime?.effective_mode);
  const prefix = input.idempotentReplay
    ? 'A retomada já havia sido concluída e foi recuperada sem repetir a transição.'
    : input.protectedResume
      ? 'Retomada protegida concluída com trilha de auditoria.'
      : 'Conversa devolvida para a AUTOCAR.';

  if (mode === 'autopilot') {
    return `${prefix} A próxima mensagem poderá ser atendida automaticamente, sempre respeitando o SAFE CORE.`;
  }
  if (mode === 'copilot') {
    return `${prefix} O modo efetivo é COPILOT, sem envio automático.`;
  }
  if (mode === 'off') {
    return `${prefix} A AUTOCAR está em OFF e não enviará respostas automáticas.`;
  }
  return `${prefix} O modo efetivo será confirmado na próxima atualização do atendimento.`;
}
