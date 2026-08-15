import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import type { AutocarCapability, AutocarPolicyDecision } from '@/lib/server/autocar/types';

export type OperationalPreview = {
  availability?: { configured?: boolean; available?: boolean; reason?: string } | null;
  location?: { configured?: boolean } | null;
  photos?: { configured?: boolean; photos?: string[] } | null;
};

function deny(reason: string): AutocarPolicyDecision {
  return { effect: 'deny', source: 'operational_guard', reason };
}

export function evaluateAutocarOperationalShadowPolicy(input: {
  capability: AutocarCapability;
  operationalPreview?: OperationalPreview | null;
}) {
  const base = evaluateAutocarPolicy({ mode: 'autopilot', capability: input.capability });
  if (base.effect !== 'allow') return base;

  const preview = input.operationalPreview || {};

  if (input.capability === 'send_photos') {
    const photos = Array.isArray(preview.photos?.photos) ? preview.photos!.photos! : [];
    if (!preview.photos?.configured || photos.length === 0) {
      return deny('Fotos não liberadas: o backend não encontrou imagens reais do veículo no estoque da loja.');
    }
  }

  if (input.capability === 'send_location') {
    if (!preview.location?.configured) {
      return deny('Localização não liberada: a loja ainda não possui localização operacional configurada.');
    }
  }

  if (input.capability === 'schedule_visit' || input.capability === 'schedule_test_drive') {
    if (!preview.availability?.configured) {
      return deny('Agendamento não liberado: horário e Perfil Operacional ainda não foram validados pelo backend.');
    }
    if (!preview.availability?.available) {
      return deny(`Agendamento não liberado: ${preview.availability?.reason || 'horário indisponível'}.`);
    }
  }

  return base;
}
