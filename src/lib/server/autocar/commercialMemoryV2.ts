export const AUTOCAR_COMMERCIAL_MEMORY_VERSION = 'autocar-commercial-memory-v2-foundation';

export type CommercialJourneyStage =
  | 'first_contact'
  | 'discovery'
  | 'qualification'
  | 'vehicle_presentation'
  | 'financing_trade'
  | 'objection'
  | 'scheduling'
  | 'scheduled'
  | 'post_visit'
  | 'negotiation'
  | 'closing'
  | 'won'
  | 'lost'
  | 'unknown';

export type CommercialMemoryV2 = {
  version: string;
  stage: CommercialJourneyStage;
  summary: string;
  active_vehicle: string | null;
  budget: string | null;
  down_payment: string | null;
  desired_installment: string | null;
  financing_term: string | null;
  trade_in: string | null;
  objections: string[];
  open_questions: string[];
  next_best_action: string | null;
  temperature: string;
  qualification_score: number | null;
  customer_requested_human: boolean;
  human_state: string;
};

function cleanText(value: unknown, max = 600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function cleanList(value: unknown, max = 8) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, 240))
    .filter((item): item is string => Boolean(item))
    .slice(0, max);
}

function stageFromMemory(memory: any): CommercialJourneyStage {
  const next = String(memory?.next_best_action || '').toLowerCase();
  const summary = String(memory?.rolling_summary || '').toLowerCase();
  const combined = `${summary} ${next}`;
  if (/vend(a|ido)|fechad[ao]|sale_confirmed/.test(combined)) return 'won';
  if (/perdid[ao]|sem interesse|lost/.test(combined)) return 'lost';
  if (/pós[- ]?visita|post.?visit|visitou/.test(combined)) return 'post_visit';
  if (/agendad[ao]|visita confirmada/.test(combined)) return 'scheduled';
  if (/agend|horário|visita|test drive/.test(combined)) return 'scheduling';
  if (/desconto|proposta|negocia|condição de fechamento/.test(combined)) return 'negotiation';
  if (/objeç|caro|parcela alta|pensar/.test(combined)) return 'objection';
  if (/financ|entrada|parcela|troca/.test(combined)) return 'financing_trade';
  if (/veículo|carro|estoque|modelo|fotos/.test(combined)) return 'vehicle_presentation';
  if (/qualific|orçamento|faixa|uso|prefer/.test(combined)) return 'qualification';
  if (/primeiro contato|saudação/.test(combined)) return 'first_contact';
  if (summary) return 'discovery';
  return 'unknown';
}

export function normalizeCommercialMemoryV2(memory: any): CommercialMemoryV2 {
  const score = Number(memory?.qualification_score);
  return {
    version: AUTOCAR_COMMERCIAL_MEMORY_VERSION,
    stage: stageFromMemory(memory),
    summary: cleanText(memory?.rolling_summary, 1200) || '',
    active_vehicle: cleanText(memory?.score_breakdown?.active_vehicle || memory?.score_breakdown?.vehicle, 220),
    budget: cleanText(memory?.score_breakdown?.budget, 120),
    down_payment: cleanText(memory?.score_breakdown?.down_payment, 120),
    desired_installment: cleanText(memory?.score_breakdown?.desired_installment, 120),
    financing_term: cleanText(memory?.score_breakdown?.financing_term, 120),
    trade_in: cleanText(memory?.score_breakdown?.trade_in, 220),
    objections: cleanList(memory?.active_objections),
    open_questions: cleanList(memory?.open_questions),
    next_best_action: cleanText(memory?.next_best_action, 500),
    temperature: cleanText(memory?.temperature, 80) || 'unknown',
    qualification_score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
    customer_requested_human: Boolean(memory?.score_breakdown?.customer_requested_human),
    human_state: cleanText(memory?.human_state, 80) || 'unknown'
  };
}

export function commercialMemoryPromptV2(memory: CommercialMemoryV2 | null) {
  if (!memory) return 'MEMÓRIA COMERCIAL V2: nenhuma memória consolidada disponível. Não invente contexto ausente.';
  return [
    `MEMÓRIA COMERCIAL V2 (${memory.version}).`,
    `Etapa atual: ${memory.stage}.`,
    memory.summary ? `Resumo: ${memory.summary}.` : '',
    memory.active_vehicle ? `Veículo ativo: ${memory.active_vehicle}.` : '',
    memory.budget ? `Orçamento: ${memory.budget}.` : '',
    memory.down_payment ? `Entrada: ${memory.down_payment}.` : '',
    memory.desired_installment ? `Parcela desejada: ${memory.desired_installment}.` : '',
    memory.financing_term ? `Prazo: ${memory.financing_term}.` : '',
    memory.trade_in ? `Troca: ${memory.trade_in}.` : '',
    memory.objections.length ? `Objeções ativas: ${memory.objections.join(' | ')}.` : '',
    memory.open_questions.length ? `Perguntas em aberto: ${memory.open_questions.join(' | ')}.` : '',
    memory.next_best_action ? `Próxima melhor ação: ${memory.next_best_action}.` : '',
    `Pedido explícito de humano registrado: ${memory.customer_requested_human ? 'sim' : 'não'}.`,
    'A mensagem atual prevalece sobre memória antiga quando houver mudança clara de assunto.'
  ].filter(Boolean).join(' ');
}
