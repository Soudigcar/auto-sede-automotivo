export const AUTOCAR_HANDOFF_SEMANTICS_VERSION = 'autocar-handoff-semantics-v2-foundation';

export type ProposedActionV2 = {
  capability?: string | null;
  reason?: string | null;
  decision?: { effect?: string | null } | null;
};

export function resolveAutocarHandoffV2(input: {
  customerRequestedHuman: boolean;
  proposedActions?: ProposedActionV2[] | null;
}) {
  const actions = Array.isArray(input.proposedActions) ? input.proposedActions : [];
  const protectedActions = actions.filter((action) => {
    const effect = String(action?.decision?.effect || '');
    return effect === 'handoff' || effect === 'approval' || effect === 'deny';
  });

  if (input.customerRequestedHuman) {
    return {
      version: AUTOCAR_HANDOFF_SEMANTICS_VERSION,
      should_handoff: true,
      reason: 'O cliente solicitou semanticamente atendimento humano.',
      protected_actions: protectedActions,
      continue_ai_conversation: false
    };
  }

  return {
    version: AUTOCAR_HANDOFF_SEMANTICS_VERSION,
    should_handoff: false,
    reason: protectedActions.length
      ? 'Há ações protegidas ou não executáveis, mas isso não equivale a pedido de atendimento humano.'
      : 'Nenhum pedido de atendimento humano foi identificado.',
    protected_actions: protectedActions,
    continue_ai_conversation: true
  };
}
