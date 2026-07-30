import type { Metadata } from 'next';
import { PublicInformationPage } from '@/components/marketplace/PublicInformationPage';
import { loadPortalSettings } from '@/lib/server/portalSettings';

const canonical = 'https://www.autosede.com.br/privacidade';

export const metadata: Metadata = {
  title: 'Política de Privacidade | Auto Sede',
  description: 'Saiba como o portal Auto Sede trata dados pessoais, direciona solicitações às lojas e atende aos direitos dos titulares.',
  alternates: { canonical },
  robots: { index: true, follow: true }
};

function contactText(email: string, phone: string, whatsapp: string) {
  const channels = [email, phone, whatsapp].filter(Boolean);
  return channels.length ? channels.join(' • ') : 'os canais disponíveis na página de contato';
}

export default async function PrivacyPage() {
  const settings = await loadPortalSettings();
  const contact = contactText(settings.email, settings.phone, settings.whatsapp_number);

  return (
    <PublicInformationPage
      settings={settings}
      eyebrow="Privacidade e proteção de dados"
      title="Política de Privacidade"
      description="Este aviso explica quais dados podem ser tratados no portal, por que eles são utilizados e como você pode exercer seus direitos."
      sections={[
        {
          title: '1. Quem participa do tratamento',
          content: <p>O Auto Sede opera o portal e encaminha solicitações comerciais. Quando você demonstra interesse em um veículo ou campanha, os dados necessários ao atendimento podem ser enviados à loja proprietária do anúncio ou às lojas participantes da campanha, conforme o fluxo informado na página.</p>
        },
        {
          title: '2. Dados que podem ser coletados',
          content: <p>Podem ser tratados dados de identificação e contato, como nome, telefone, e-mail e CPF quando solicitado; informações sobre o veículo de interesse, entrada e prazo pretendidos; consentimentos; além de registros técnicos de acesso, segurança e interação com o portal.</p>
        },
        {
          title: '3. Finalidades de uso',
          content: <><p>Os dados podem ser utilizados para realizar simulações estimativas, responder solicitações, direcionar o atendimento à loja correta, registrar o histórico comercial, prevenir fraudes, manter a segurança do serviço, cumprir obrigações legais e aprimorar a experiência.</p><p>Comunicações promocionais e tecnologias de medição ou publicidade serão utilizadas quando houver fundamento jurídico aplicável e configuração ativa no portal.</p></>
        },
        {
          title: '4. Compartilhamento',
          content: <p>O compartilhamento é limitado às lojas responsáveis pelo atendimento, fornecedores essenciais de hospedagem, banco de dados, comunicação, segurança e análise, e autoridades públicas quando houver obrigação legal ou ordem válida. Não comercializamos listas de dados pessoais.</p>
        },
        {
          title: '5. Bases legais e retenção',
          content: <p>O tratamento pode se apoiar em consentimento, procedimentos preliminares relacionados a uma possível contratação, cumprimento de obrigação legal ou regulatória, exercício regular de direitos e legítimo interesse avaliado de forma compatível com os direitos do titular. Os dados são mantidos pelo período necessário às finalidades informadas, às obrigações legais e à defesa de direitos, sendo depois eliminados ou anonimizados quando aplicável.</p>
        },
        {
          title: '6. Direitos do titular',
          content: <p>Você pode solicitar confirmação de tratamento, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio ou eliminação quando cabíveis, portabilidade nos termos da regulamentação, revisão de decisões automatizadas quando aplicável e revogação do consentimento.</p>
        },
        {
          title: '7. Cookies e tecnologias semelhantes',
          content: <p>O portal pode utilizar recursos estritamente necessários ao funcionamento, à segurança e à manutenção da sessão. Ferramentas adicionais de análise ou publicidade podem registrar interações quando estiverem configuradas. As preferências disponíveis no navegador também podem ser usadas para restringir cookies.</p>
        },
        {
          title: '8. Segurança e contato',
          content: <><p>Adotamos medidas técnicas e administrativas proporcionais para reduzir riscos de acesso não autorizado, perda, alteração ou divulgação indevida. Nenhum sistema é totalmente imune a incidentes.</p><p>Para exercer direitos ou esclarecer dúvidas, utilize: <strong>{contact}</strong>.</p><p className="text-xs font-bold text-slate-400">Última atualização: 30 de julho de 2026.</p></>
        }
      ]}
    />
  );
}
