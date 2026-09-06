const optOutSignals = [
  /não\s+(quero|desejo)\s+(mais\s+)?(receber|mensagens|contato)/i,
  /pare\s+de\s+(mandar|enviar|me\s+chamar)/i,
  /não\s+me\s+(chame|mande|envie)\s+mais/i,
  /remov(a|e)\s+(meu\s+)?(número|numero|contato)/i,
  /retir(a|e)\s+(meu\s+)?(número|numero|contato)/i,
  /descadastr(a|e)/i,
  /^\s*(stop|unsubscribe|sair)\s*[.!]?\s*$/i
];

export function hasFollowUpOptOut(messages: Array<{ direction?: unknown; body?: unknown }>) {
  const inbound = messages.filter((message) => String(message.direction) === 'inbound');
  return inbound.some((message) => {
    const body = String(message.body || '').trim();
    return body.length > 0 && optOutSignals.some((pattern) => pattern.test(body));
  });
}

export function contextualAutopilotQuality(plan: any) {
  const text = String(plan?.suggested_message || '').trim();
  const structural = Boolean(
    plan?.is_commercial_conversation === true &&
    !plan?.block_reason &&
    String(plan?.last_topic || '').trim() &&
    String(plan?.pending_thread || '').trim() &&
    String(plan?.reopening_hook || '').trim() &&
    String(plan?.commercial_objective || '').trim() &&
    text
  );
  if (!structural) return { safe: false, score: 0.35, reason: 'Mapa contextual incompleto ou conversa não comercial.' };
  if (text.length > 600 || (text.match(/\?/g) || []).length > 1) {
    return { safe: false, score: 0.68, reason: 'Mensagem longa ou com perguntas múltiplas; requer revisão humana.' };
  }
  if (/como posso ajudar|qual veículo você procura|qual veiculo voce procura/i.test(text)) {
    return { safe: false, score: 0.62, reason: 'Abertura genérica detectada; requer revisão humana.' };
  }
  if (/aprova(d[oa])?|aprovação garantida|credito garantido|crédito garantido|desconto garantido/i.test(text)) {
    return { safe: false, score: 0.2, reason: 'Promessa financeira/comercial protegida detectada.' };
  }
  const avoid = Array.isArray(plan?.avoid_repeating) ? plan.avoid_repeating.length : 0;
  const score = avoid > 0 ? 0.93 : 0.84;
  return { safe: score >= 0.85, score, reason: score >= 0.85 ? 'Reabertura contextual apta ao canário.' : 'Contexto insuficiente para AUTOPILOT.' };
}

