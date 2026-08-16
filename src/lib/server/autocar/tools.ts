import type { AutocarToolDefinition } from '@/lib/server/autocar/types';

export const autocarReadTools: AutocarToolDefinition[] = [
  {
    name: 'consultar_dados_loja',
    description: 'Consulta dados públicos e operacionais básicos da loja atual. A loja é definida pelo backend.',
    capability: 'consult_stock',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] }
  },
  {
    name: 'consultar_regras_comerciais',
    description: 'Consulta conhecimento e políticas comerciais ativas da loja atual, sem dados de outras lojas.',
    capability: 'qualify_lead',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] }
  },
  {
    name: 'consultar_estoque',
    description: 'Lista veículos disponíveis no estoque da loja atual usando filtros opcionais.',
    capability: 'consult_stock',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        brand: { type: 'string' }, model: { type: 'string' }, year: { type: 'string' }, max_price: { type: 'number' }
      },
      required: []
    }
  },
  {
    name: 'buscar_veiculo',
    description: 'Busca um veículo disponível específico da loja atual pelo identificador interno.',
    capability: 'consult_stock',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { vehicle_id: { type: 'string' } }, required: ['vehicle_id']
    }
  },
  {
    name: 'consultar_preco',
    description: 'Consulta o preço atual de um veículo disponível da loja atual.',
    capability: 'consult_stock',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { vehicle_id: { type: 'string' } }, required: ['vehicle_id']
    }
  },
  {
    name: 'buscar_fotos_veiculo',
    description: 'Retorna somente as URLs de fotos reais cadastradas para um veículo disponível da loja atual.',
    capability: 'consult_stock',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { vehicle_id: { type: 'string' } }, required: ['vehicle_id']
    }
  },
  {
    name: 'consultar_lead',
    description: 'Consulta o lead da conversa atual e seus dados comerciais permitidos. O lead é definido pelo backend.',
    capability: 'qualify_lead',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] }
  },
  {
    name: 'consultar_pipeline',
    description: 'Consulta a etapa atual do lead desta conversa. O lead é definido pelo backend.',
    capability: 'qualify_lead',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] }
  },
  {
    name: 'consultar_agenda',
    description: 'Consulta compromissos já vinculados ao lead desta conversa, sem revelar agenda de outros clientes.',
    capability: 'qualify_lead',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] }
  }
];

function assertNoStoreIdParameter() {
  for (const tool of autocarReadTools) {
    if (Object.prototype.hasOwnProperty.call(tool.parameters.properties, 'store_id')) {
      throw new Error(`Tool AUTOCAR inválida: ${tool.name} não pode aceitar store_id.`);
    }
  }
}

assertNoStoreIdParameter();

export function openAiAutocarReadTools() {
  return autocarReadTools.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    strict: true,
    parameters: tool.parameters
  }));
}
