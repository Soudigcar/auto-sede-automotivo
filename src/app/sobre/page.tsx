import type { Metadata } from 'next';
import { PublicInformationPage } from '@/components/marketplace/PublicInformationPage';
import { loadPortalSettings } from '@/lib/server/portalSettings';

const canonical = 'https://www.autosede.com.br/sobre';

export const metadata: Metadata = {
  title: 'Sobre o Auto Sede',
  description: 'Conheça o portal Auto Sede, seu modelo de catálogo automotivo e o direcionamento seguro de clientes às lojas responsáveis.',
  alternates: { canonical },
  robots: { index: true, follow: true }
};

export default async function AboutPage() {
  const settings = await loadPortalSettings();

  return (
    <PublicInformationPage
      settings={settings}
      eyebrow="Portal automotivo integrado"
      title={`Sobre o ${settings.brand_name}`}
      description="Uma estrutura digital para conectar compradores a veículos reais, campanhas e lojas identificadas, com atendimento direcionado e gestão integrada."
      sections={[
        {
          title: 'Catálogo conectado às lojas',
          content: <p>O portal reúne veículos publicados por lojas participantes. Cada anúncio permanece associado à sua proprietária, permitindo que a solicitação do cliente seja encaminhada diretamente para quem responde por aquele estoque.</p>
        },
        {
          title: 'Eventos e campanhas',
          content: <p>Além do catálogo permanente, o Auto Sede pode operar páginas de campanhas automotivas. Nesses casos, a página informa o evento e o atendimento pode seguir as regras de distribuição configuradas para as lojas participantes.</p>
        },
        {
          title: 'Tecnologia para o processo comercial',
          content: <p>A plataforma integra captação de leads, acompanhamento comercial, estoque, agenda, equipes e confirmação de vendas, mantendo o portal público separado do sistema operacional utilizado pelas lojas.</p>
        },
        {
          title: 'Compromisso com transparência',
          content: <p>O objetivo é tornar mais claro qual loja está associada ao veículo, como funciona o encaminhamento e quais informações são apenas estimativas. Preços, disponibilidade e contratação são confirmados diretamente com a loja responsável.</p>
        }
      ]}
    />
  );
}
