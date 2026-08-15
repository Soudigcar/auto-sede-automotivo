export const autocarModes = ['off', 'copilot', 'autopilot'] as const;
export type AutocarMode = (typeof autocarModes)[number];

export const autocarPolicyEffects = ['allow', 'deny', 'approval', 'handoff'] as const;
export type AutocarPolicyEffect = (typeof autocarPolicyEffects)[number];

export const autocarCapabilities = [
  'respond_first_contact',
  'qualify_lead',
  'consult_stock',
  'send_vehicles',
  'send_photos',
  'send_location',
  'respond_audio_with_audio',
  'schedule_visit',
  'schedule_test_drive',
  'create_follow_up',
  'transfer_lead',
  'alter_pipeline',
  'negotiate_price',
  'grant_discount',
  'alter_stock_price',
  'confirm_sale',
  'promise_credit_approval',
  'final_trade_appraisal'
] as const;
export type AutocarCapability = (typeof autocarCapabilities)[number];

export const autocarReadToolNames = [
  'consultar_dados_loja',
  'consultar_regras_comerciais',
  'consultar_estoque',
  'buscar_veiculo',
  'consultar_preco',
  'buscar_fotos_veiculo',
  'consultar_lead',
  'consultar_pipeline',
  'consultar_agenda'
] as const;
export type AutocarReadToolName = (typeof autocarReadToolNames)[number];

export type AutocarToolDefinition = {
  name: AutocarReadToolName;
  description: string;
  capability: AutocarCapability;
  parameters: {
    type: 'object';
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
  };
};

export type AutocarPolicyDecision = {
  effect: AutocarPolicyEffect;
  source: 'global_hard_policy' | 'store_policy' | 'mode_guard' | 'operational_guard' | 'default';
  reason: string;
};
