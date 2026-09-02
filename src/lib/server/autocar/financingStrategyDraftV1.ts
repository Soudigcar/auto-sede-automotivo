export const AUTOCAR_FINANCING_STRATEGY_DRAFT_VERSION = 'autocar-financing-conversion-draft-v1';

export const autocarFinancingStrategyDraftV1 = Object.freeze({
  version: AUTOCAR_FINANCING_STRATEGY_DRAFT_VERSION,
  status: 'draft' as const,
  publication_status: 'unpublished' as const,
  scope: 'global' as const,
  situation: 'Existe resultado real e registrado de uma simulação de financiamento e o próximo objetivo comercial é conduzir o cliente para uma visita.',
  intent: 'financing_simulation_result_conversion',
  objective: 'Comunicar somente fatos verificados da simulação, gerar continuidade na conversa e conduzir naturalmente para agendamento presencial sem prometer aprovação definitiva.',
  ideal_response: [
    'Chame o cliente pelo primeiro nome e, somente quando a projeção sanitizada indicar resultado disponível e origem registrada, use a abertura: “{Nome}, tenho duas notícias para você: uma boa e uma menos boa. Qual você quer primeiro?”',
    'Aguarde obrigatoriamente a resposta do cliente antes de revelar qualquer uma das notícias.',
    'Se houver pré-aprovação real, a notícia boa pode informar que foi encontrada uma condição de pré-aprovação.',
    'A notícia menos boa só pode mencionar quantidade de bancos consultados e quantidade de pré-aprovações quando esses números estiverem presentes na fonte oficial.',
    'Percentual ou indicador só pode ser informado quando existir valor e origem oficial registrados; nunca derive percentual do número de bancos por conta própria.',
    'Depois de comunicar os fatos permitidos, conduza para visita usando disponibilidade oficial da agenda, sem inventar horário.'
  ].join(' '),
  next_action: 'Aguardar a escolha do cliente; comunicar um fato por vez; depois conduzir para agendamento ou continuar ajudando sem pressão se ele recusar.',
  restrictions: [
    'Nunca usar esta estratégia sem resultado real registrado no CRM.',
    'Nunca inventar aprovação, pré-aprovação, percentual, banco, taxa, entrada, parcela ou quantidade de instituições.',
    'Nunca transformar pré-aprovação em aprovação definitiva.',
    'Nunca mencionar CPF, número de CNH, data de nascimento, documentos ou dados pessoais recebidos.',
    'Nunca dizer que consultou bancos se a fonte oficial não registrar essa consulta.',
    'Nunca criar suspense repetitivo, constrangedor ou enganoso.',
    'Nunca confirmar agendamento sem disponibilidade oficial e ação autorizada.',
    'SAFE CORE, políticas Master e pedido explícito de atendimento humano sempre prevalecem.'
  ],
  tags: [
    'financiamento',
    'simulacao',
    'resultado-real',
    'pre-aprovacao',
    'conversao',
    'agendamento',
    'draft-only'
  ],
  examples: [
    {
      state: 'result_available',
      source: {
        outcome: 'preapproved',
        banks_consulted_count: 13,
        preapproved_count: 1,
        approval_indicator_percent: 80,
        approval_indicator_source: 'indicador oficial registrado'
      },
      first_message: '{Nome}, tenho duas notícias para você: uma boa e uma menos boa 😅 Qual você quer primeiro?',
      after_customer_choice: 'A boa é que encontramos uma condição de pré-aprovação para você. A parte menos boa é que, das 13 instituições consultadas, somente 1 apresentou essa condição neste momento.',
      indicator_message: 'O indicador oficial registrado para essa condição é de aproximadamente 80%. Isso ainda não representa aprovação definitiva.',
      scheduling_transition: 'O próximo passo é você conhecer o veículo e avançarmos com a equipe. Qual dia ou período fica melhor para sua visita?'
    },
    {
      state: 'result_available',
      source: {
        outcome: 'preapproved',
        banks_consulted_count: null,
        preapproved_count: null,
        approval_indicator_percent: null,
        approval_indicator_source: null
      },
      first_message: '{Nome}, tenho uma atualização real da sua simulação. Posso te explicar e já alinhamos o próximo passo?',
      after_customer_choice: 'Encontramos uma condição de pré-aprovação. Os demais detalhes dependem da validação final da instituição financeira.',
      scheduling_transition: 'Quer escolher um dia ou período para conhecer o veículo e avançar com a equipe?'
    }
  ]
});

export function financingStrategyDraftTrainingInputV1() {
  return {
    situation: autocarFinancingStrategyDraftV1.situation,
    intent: autocarFinancingStrategyDraftV1.intent,
    idealResponse: autocarFinancingStrategyDraftV1.ideal_response,
    objective: autocarFinancingStrategyDraftV1.objective,
    nextAction: autocarFinancingStrategyDraftV1.next_action,
    restrictions: [...autocarFinancingStrategyDraftV1.restrictions],
    tags: [...autocarFinancingStrategyDraftV1.tags],
    examples: autocarFinancingStrategyDraftV1.examples.map((example) => JSON.stringify(example)),
    priority: 35,
    status: 'draft' as const
  };
}
