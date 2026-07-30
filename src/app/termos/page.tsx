import type { Metadata } from 'next';
import { PublicInformationPage } from '@/components/marketplace/PublicInformationPage';
import { loadPortalSettings } from '@/lib/server/portalSettings';

const canonical = 'https://www.autosede.com.br/termos';

export const metadata: Metadata = {
  title: 'Termos de Uso | Auto Sede',
  description: 'Condições de utilização do portal Auto Sede, dos anúncios, das simulações e do encaminhamento de contatos às lojas.',
  alternates: { canonical },
  robots: { index: true, follow: true }
};

export default async function TermsPage() {
  const settings = await loadPortalSettings();

  return (
    <PublicInformationPage
      settings={settings}
      eyebrow="Condições de utilização"
      title="Termos de Uso"
      description="Ao utilizar o portal, você concorda com estas condições e reconhece o papel do Auto Sede como ambiente de divulgação e encaminhamento comercial."
      sections={[
        {
          title: '1. Finalidade do portal',
          content: <p>O Auto Sede reúne anúncios de veículos e campanhas de lojas participantes, permite consultas e simulações estimativas e encaminha manifestações de interesse à loja responsável pelo anúncio ou às lojas participantes do evento informado.</p>
        },
        {
          title: '2. Anúncios e disponibilidade',
          content: <p>Preços, características, fotografias, quilometragem, disponibilidade e demais informações são fornecidos pelas lojas anunciantes e podem ser atualizados ou retirados. A publicação não representa reserva, promessa de venda ou garantia de disponibilidade até a confirmação direta da loja.</p>
        },
        {
          title: '3. Simulações e financiamento',
          content: <><p>As simulações exibidas são apenas estimativas matemáticas e não constituem proposta, aprovação de crédito ou contratação. Taxas, entrada, prazo, tarifas, seguros, condições e valor final dependem da instituição financeira, da análise de crédito e dos documentos apresentados.</p><p>O portal não solicita senha bancária, token, código de autenticação ou pagamento antecipado para liberar aprovação de financiamento.</p></>
        },
        {
          title: '4. Relação com as lojas',
          content: <p>A negociação, vistoria, documentação, garantia, entrega, transferência, avaliação de usado e contratação financeira são realizadas entre o usuário, a loja e, quando aplicável, a instituição financeira. Cada loja responde por seus anúncios, atendimento e obrigações legais.</p>
        },
        {
          title: '5. Responsabilidades do usuário',
          content: <p>O usuário deve fornecer informações verdadeiras, utilizar o portal de forma lícita, proteger seus próprios dispositivos e não tentar acessar áreas restritas, explorar falhas, automatizar abusivamente solicitações, enviar conteúdo malicioso ou utilizar dados de terceiros sem autorização.</p>
        },
        {
          title: '6. Propriedade intelectual',
          content: <p>Marcas, identidade visual, textos, estrutura, software e demais conteúdos próprios do portal são protegidos pela legislação aplicável. Materiais de veículos e lojas permanecem vinculados aos respectivos titulares e anunciantes.</p>
        },
        {
          title: '7. Disponibilidade e alterações',
          content: <p>O serviço pode passar por manutenção, indisponibilidade temporária ou atualização. Estes termos podem ser revisados para refletir mudanças operacionais, técnicas ou legais, com publicação da versão atualizada nesta página.</p>
        },
        {
          title: '8. Legislação e atendimento',
          content: <><p>Aplicam-se as leis brasileiras, preservados os direitos assegurados ao consumidor e ao titular de dados pessoais. Dúvidas podem ser enviadas pelos canais publicados na página de contato.</p><p className="text-xs font-bold text-slate-400">Última atualização: 30 de julho de 2026.</p></>
        }
      ]}
    />
  );
}
