import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF,
  type AutocarRuntimePublicStatus
} from '@/lib/server/autocar/runtimeEnvironment';

export type StoreAutocarModeMutationScope =
  | 'preview_dev'
  | 'development_dev'
  | 'production_live'
  | 'blocked';

export type StoreAutocarModeMutationGovernance = {
  allowed: boolean;
  scope: StoreAutocarModeMutationScope;
  writes_to: 'autocar-dev' | 'autocar-production' | 'none';
  live_configuration: boolean;
  reason: string;
};

export function evaluateStoreAutocarModeMutationGovernance(
  runtimeStatus: Pick<
    AutocarRuntimePublicStatus,
    | 'vercel_environment'
    | 'runtime_environment'
    | 'project_ref'
    | 'schema'
    | 'transition_mode'
    | 'external_execution_allowed'
    | 'automatic_replies_enabled'
    | 'autopilot_preview_only'
  >
): StoreAutocarModeMutationGovernance {
  const vercelEnvironment = String(runtimeStatus.vercel_environment || '').trim();

  if (vercelEnvironment === 'preview') {
    const isolated = runtimeStatus.runtime_environment === 'autocar-dev'
      && runtimeStatus.project_ref === AUTOCAR_DEV_REF
      && runtimeStatus.schema === 'dev_v1'
      && runtimeStatus.transition_mode === 'development_dev'
      && runtimeStatus.external_execution_allowed === false
      && runtimeStatus.automatic_replies_enabled === false
      && runtimeStatus.autopilot_preview_only === true;

    return isolated
      ? {
          allowed: true,
          scope: 'preview_dev',
          writes_to: 'autocar-dev',
          live_configuration: false,
          reason: 'Preview isolado: alterações de modo ficam exclusivamente em autocar-dev e não habilitam execução externa.'
        }
      : {
          allowed: false,
          scope: 'blocked',
          writes_to: 'none',
          live_configuration: false,
          reason: 'SAFE CORE: Preview não está comprovadamente isolado em autocar-dev; alteração de modo bloqueada.'
        };
  }

  if (vercelEnvironment === 'production') {
    const production = runtimeStatus.runtime_environment === 'autocar-production'
      && runtimeStatus.project_ref === AUTOCAR_PRODUCTION_REF
      && runtimeStatus.schema === 'production_v2'
      && runtimeStatus.transition_mode === 'cutover_production';

    return production
      ? {
          allowed: true,
          scope: 'production_live',
          writes_to: 'autocar-production',
          live_configuration: true,
          reason: 'Production: a seleção de modo é gravada em AUTOCAR Production e pode afetar o atendimento real dentro dos gates Master e SAFE CORE.'
        }
      : {
          allowed: false,
          scope: 'blocked',
          writes_to: 'none',
          live_configuration: false,
          reason: 'SAFE CORE: Vercel Production não está apontando para a AUTOCAR Production autorizada; alteração de modo bloqueada.'
        };
  }

  const development = runtimeStatus.runtime_environment === 'autocar-dev'
    && runtimeStatus.project_ref === AUTOCAR_DEV_REF
    && runtimeStatus.schema === 'dev_v1'
    && runtimeStatus.transition_mode === 'development_dev';

  return development
    ? {
        allowed: true,
        scope: 'development_dev',
        writes_to: 'autocar-dev',
        live_configuration: false,
        reason: 'Desenvolvimento isolado: alteração restrita ao autocar-dev.'
      }
    : {
        allowed: false,
        scope: 'blocked',
        writes_to: 'none',
        live_configuration: false,
        reason: 'SAFE CORE: ambiente AUTOCAR não reconhecido para alteração de modo.'
      };
}
