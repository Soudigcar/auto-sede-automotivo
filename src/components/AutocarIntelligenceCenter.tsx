'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  MessageCircleMore,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Target,
  UsersRound
} from 'lucide-react';
import { sanitizeAutocarStoreKnowledgeConfig } from '@/lib/autocar/storeKnowledgeConfig';

type SectionKey = 'metodo' | 'loja' | 'regras' | 'tom' | 'conhecimento' | 'autonomia' | 'teste';

type StoreConfig = {
  address: string;
  city: string;
  businessHours: string;
  commercialPhone: string;
  financePartners: string;
  paymentMethods: string;
  tradeInPolicy: string;
  reservationPolicy: string;
  warrantyPolicy: string;
  deliveryPolicy: string;
  testDrivePolicy: string;
  documentation: string;
  differentiators: string;
  discountPolicy: string;
  negotiationLimit: string;
  humanHandoffRules: string;
  followUpRules: string;
  tone: string;
  preferredWords: string;
  avoidedWords: string;
  faq: string;
  commercialNotes: string;
  autonomyMode: 'off' | 'copilot' | 'autopilot';
};

const initialConfig: StoreConfig = {
  address: '', city: '', businessHours: '', commercialPhone: '', financePartners: '', paymentMethods: '',
  tradeInPolicy: '', reservationPolicy: '', warrantyPolicy: '', deliveryPolicy: '', testDrivePolicy: '',
  documentation: '', differentiators: '', discountPolicy: '', negotiationLimit: '', humanHandoffRules: '',
  followUpRules: '', tone: 'Consultivo, humano, objetivo e comercial.', preferredWords: '', avoidedWords: '',
  faq: '', commercialNotes: '', autonomyMode: 'copilot'
};

const methodStages = [
  ['1. Conexão', 'Criar rapport, personalizar a abertura e entender o contexto antes de ofertar.'],
  ['2. Descoberta', 'Investigar necessidade, momento de compra, uso do veículo, urgência e motivadores.'],
  ['3. Qualificação', 'Mapear veículo, entrada, financiamento, troca, prazo e decisores da compra.'],
  ['4. Valor', 'Conectar estoque, diferenciais da loja e benefícios ao que o cliente realmente busca.'],
  ['5. Objeções', 'Identificar a objeção real, responder sem confronto e manter avanço comercial.'],
  ['6. Próximo passo', 'Conduzir para visita, test-drive, simulação, avaliação ou contato do vendedor.'],
  ['7. Follow-up', 'Manter cadência útil, contextual e sem mensagens genéricas repetitivas.'],
  ['8. Fechamento', 'Reconhecer intenção de compra e transferir/solicitar aprovação quando necessário.']
];

const navItems: Array<{ key: SectionKey; label: string; icon: React.ReactNode; helper: string }> = [
  { key: 'metodo', label: 'Método Venda Mais', icon: <BrainCircuit size={18} />, helper: 'Cérebro comercial oficial' },
  { key: 'loja', label: 'Minha Loja', icon: <Building2 size={18} />, helper: 'Informações exclusivas' },
  { key: 'regras', label: 'Regras Comerciais', icon: <SlidersHorizontal size={18} />, helper: 'Negociação e limites' },
  { key: 'tom', label: 'Tom de Atendimento', icon: <MessageCircleMore size={18} />, helper: 'Como a IA conversa' },
  { key: 'conhecimento', label: 'Conhecimento', icon: <ClipboardCheck size={18} />, helper: 'FAQ e diferenciais' },
  { key: 'autonomia', label: 'Autonomia', icon: <Gauge size={18} />, helper: 'OFF, Copilot ou automático' },
  { key: 'teste', label: 'Treinar e Testar', icon: <FlaskConical size={18} />, helper: 'Simular antes de ativar' }
];

export function AutocarIntelligenceCenter({ storeName, slug, canManage }: { storeName: string; slug: string; canManage: boolean }) {
  const [section, setSection] = useState<SectionKey>('metodo');
  const [config, setConfig] = useState<StoreConfig>(initialConfig);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState('Cliente: Gostei do carro, mas estou só pesquisando por enquanto.');
  const storageKey = useMemo(() => `autocar-intelligence-draft:${slug}`, [slug]);

  useEffect(() => {
    let active = true;
    try {
      const draft = window.localStorage.getItem(storageKey);
      if (draft) setConfig({ ...initialConfig, ...JSON.parse(draft) });
    } catch {
      // Rascunho local é opcional e nunca bloqueia a tela.
    }

    void fetch(`/api/store/portal/autocar/store-knowledge-config?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (!active || !payload?.success || Number(payload?.knowledge?.version || 0) < 1) return;
        const saved = sanitizeAutocarStoreKnowledgeConfig(payload.knowledge.config);
        setConfig((current) => ({
          ...current,
          differentiators: saved.differentiators,
          faq: saved.faq,
          commercialNotes: saved.commercialNotes
        }));
      })
      .catch(() => {
        // Se o ambiente isolado estiver indisponível, preserva o rascunho local sem bloquear a tela.
      });

    return () => { active = false; };
  }, [slug, storageKey]);

  function update<K extends keyof StoreConfig>(key: K, value: StoreConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    if (!canManage) {
      setMessage('Seu perfil pode visualizar a AUTOCAR, mas não alterar a configuração da loja.');
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(config));
    if (section !== 'conhecimento') {
      setMessage('Rascunho salvo neste navegador. Esta seção ainda não altera o cérebro da AUTOCAR.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/store/portal/autocar/store-knowledge-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          config: {
            differentiators: config.differentiators,
            faq: config.faq,
            commercialNotes: config.commercialNotes
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Não foi possível salvar o conhecimento da loja.');
      setMessage('Conhecimento salvo no ambiente isolado da AUTOCAR e disponível para o contexto desta loja.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o conhecimento da loja. O rascunho local foi preservado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800 p-5 text-white md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-red-400"><Sparkles size={17} /><span className="text-[10px] font-black uppercase tracking-[0.18em]">Central de Inteligência AUTOCAR</span></div>
            <h2 className="mt-2 text-2xl font-black md:text-3xl">Venda Mais + inteligência da {storeName}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">A AUTOCAR combina o método comercial oficial com regras, conhecimento e contexto exclusivos desta loja. O Método Venda Mais é protegido; a loja configura somente sua operação.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-400">Camadas da decisão</p>
            <p className="mt-1 text-xs font-bold text-white">Segurança → Venda Mais → Loja → Lead → Conversa → Próxima ação</p>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="border-b border-zinc-200 bg-zinc-50 p-3 xl:border-b-0 xl:border-r xl:p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {navItems.map((item) => {
              const active = section === item.key;
              return (
                <button key={item.key} type="button" onClick={() => setSection(item.key)} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-red-200 bg-white text-red-600 shadow-sm' : 'border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-white'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-red-50' : 'bg-zinc-100'}`}>{item.icon}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-xs font-black">{item.label}</strong><small className="mt-0.5 block text-[10px] font-bold text-zinc-400">{item.helper}</small></span>
                  <ChevronRight size={15} className="hidden shrink-0 xl:block" />
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 p-4 md:p-6">
          {section === 'metodo' ? <MethodSection /> : null}
          {section === 'loja' ? <StoreSection config={config} update={update} /> : null}
          {section === 'regras' ? <RulesSection config={config} update={update} /> : null}
          {section === 'tom' ? <ToneSection config={config} update={update} /> : null}
          {section === 'conhecimento' ? <KnowledgeSection config={config} update={update} /> : null}
          {section === 'autonomia' ? <AutonomySection config={config} update={update} /> : null}
          {section === 'teste' ? <TestSection testMessage={testMessage} setTestMessage={setTestMessage} /> : null}

          {section !== 'metodo' && section !== 'teste' ? (
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black text-amber-900">{section === 'conhecimento' ? 'Conhecimento da AUTOCAR' : 'Preview de configuração'}</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">{section === 'conhecimento' ? 'Esta seção salva apenas FAQ, diferenciais e observações no ambiente isolado da AUTOCAR desta loja. Hard Policies e configurações Master permanecem acima deste conteúdo.' : 'Nesta etapa, o botão salva apenas um rascunho local neste navegador. Nenhuma informação é gravada no Supabase Production.'}</p>
              </div>
              <button type="button" onClick={() => void saveDraft()} disabled={!canManage || saving} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Save size={15} /> {saving ? 'Salvando...' : section === 'conhecimento' ? 'Salvar conhecimento' : 'Salvar rascunho'}</button>
            </div>
          ) : null}

          {message ? <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold text-zinc-700">{message}</div> : null}
        </div>
      </div>
    </section>
  );
}

function MethodSection() {
  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div><p className="premium-eyebrow">Método oficial</p><h3 className="mt-2 text-2xl font-black text-zinc-950">Venda Mais</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Esta camada será administrada pelo AUTO CONTROLE e herdada por todas as lojas. A loja pode adaptar seu contexto, mas não substituir as etapas essenciais do método.</p></div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-700"><ShieldCheck size={13} /> Protegido</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {methodStages.map(([title, text]) => <div key={title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center gap-2"><Target size={16} className="text-red-600" /><strong className="text-sm font-black text-zinc-900">{title}</strong></div><p className="mt-2 text-xs leading-5 text-zinc-600">{text}</p></div>)}
      </div>
      <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/60 p-4"><p className="text-xs font-black text-red-700">Próxima camada</p><p className="mt-1 text-xs leading-5 text-zinc-700">Quando você nos passar o conteúdo completo do seu Método Venda Mais, cada etapa poderá ter objetivos, perguntas obrigatórias, sinais de avanço, objeções, exemplos de resposta e critérios de handoff.</p></div>
    </div>
  );
}

function StoreSection({ config, update }: SectionProps) {
  return <SectionShell eyebrow="Contexto exclusivo" title="Minha Loja" description="Informações que a AUTOCAR precisa saber para representar esta loja sem inventar dados."><Field label="Endereço completo" value={config.address} onChange={(v) => update('address', v)} /><Field label="Cidade / região de atendimento" value={config.city} onChange={(v) => update('city', v)} /><Field label="Horário comercial" value={config.businessHours} onChange={(v) => update('businessHours', v)} /><Field label="Telefone comercial" value={config.commercialPhone} onChange={(v) => update('commercialPhone', v)} /><TextArea label="Bancos / financeiras com que trabalha" value={config.financePartners} onChange={(v) => update('financePartners', v)} /><TextArea label="Formas de pagamento aceitas" value={config.paymentMethods} onChange={(v) => update('paymentMethods', v)} /><TextArea label="Política de veículo na troca" value={config.tradeInPolicy} onChange={(v) => update('tradeInPolicy', v)} /><TextArea label="Política de reserva" value={config.reservationPolicy} onChange={(v) => update('reservationPolicy', v)} /><TextArea label="Garantia" value={config.warrantyPolicy} onChange={(v) => update('warrantyPolicy', v)} /><TextArea label="Entrega do veículo" value={config.deliveryPolicy} onChange={(v) => update('deliveryPolicy', v)} /><TextArea label="Test-drive" value={config.testDrivePolicy} onChange={(v) => update('testDrivePolicy', v)} /><TextArea label="Documentos normalmente solicitados" value={config.documentation} onChange={(v) => update('documentation', v)} /></SectionShell>;
}

function RulesSection({ config, update }: SectionProps) {
  return <SectionShell eyebrow="Operação comercial" title="Regras Comerciais" description="A loja reduz a autonomia da IA e define quando ela deve pedir ajuda. As regras globais de segurança continuam acima destas configurações."><TextArea label="Política de desconto" value={config.discountPolicy} onChange={(v) => update('discountPolicy', v)} placeholder="Ex.: a IA nunca oferece desconto espontaneamente; qualquer desconto precisa de aprovação do gestor." /><TextArea label="Limite de negociação" value={config.negotiationLimit} onChange={(v) => update('negotiationLimit', v)} placeholder="Ex.: pode explicar preço e benefícios, mas não pode alterar valor ou prometer condição final." /><TextArea label="Quando transferir para um humano" value={config.humanHandoffRules} onChange={(v) => update('humanHandoffRules', v)} placeholder="Ex.: intenção clara de compra, contraproposta, reclamação, condição excepcional..." /><TextArea label="Cadência de follow-up" value={config.followUpRules} onChange={(v) => update('followUpRules', v)} placeholder="Ex.: 2h, 24h, 3 dias, sempre com contexto e valor novo." /></SectionShell>;
}

function ToneSection({ config, update }: SectionProps) {
  return <SectionShell eyebrow="Personalidade da loja" title="Tom de Atendimento" description="Define a forma de falar sem alterar o raciocínio comercial do Venda Mais."><TextArea label="Estilo de comunicação" value={config.tone} onChange={(v) => update('tone', v)} /><TextArea label="Palavras / expressões preferidas" value={config.preferredWords} onChange={(v) => update('preferredWords', v)} /><TextArea label="Palavras / expressões que deve evitar" value={config.avoidedWords} onChange={(v) => update('avoidedWords', v)} /></SectionShell>;
}

function KnowledgeSection({ config, update }: SectionProps) {
  return <SectionShell eyebrow="Conhecimento local" title="Conhecimento da Loja" description="Conteúdo que ajuda a IA a responder dúvidas recorrentes e explicar por que comprar nesta loja."><TextArea label="Diferenciais da loja" value={config.differentiators} onChange={(v) => update('differentiators', v)} placeholder="Ex.: procedência, revisão, pós-venda, localização, tradição..." /><TextArea label="Perguntas frequentes e respostas" value={config.faq} onChange={(v) => update('faq', v)} placeholder="Ex.: aceita troca? faz financiamento? entrega em outra cidade?" /><TextArea label="Observações comerciais adicionais" value={config.commercialNotes} onChange={(v) => update('commercialNotes', v)} /></SectionShell>;
}

function AutonomySection({ config, update }: SectionProps) {
  return (
    <div><p className="premium-eyebrow">Controle operacional</p><h3 className="mt-2 text-2xl font-black text-zinc-950">Autonomia</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">O modo define até onde a AUTOCAR pode agir. Nesta fase funcional do projeto, somente o Copilot está sendo usado no Inbox.</p><div className="mt-5 grid gap-3 md:grid-cols-3">{([['off','OFF','Apenas configuração. Não analisa nem sugere.'],['copilot','COPILOT','Analisa, qualifica e sugere para o vendedor revisar.'],['autopilot','PILOTO AUTOMÁTICO','Futuro: executa somente ações previamente autorizadas.']] as const).map(([value,label,text]) => <button type="button" key={value} onClick={() => update('autonomyMode', value)} className={`rounded-2xl border p-4 text-left ${config.autonomyMode === value ? 'border-red-300 bg-red-50' : 'border-zinc-200 bg-zinc-50'}`}><strong className="text-sm font-black text-zinc-900">{label}</strong><p className="mt-2 text-xs leading-5 text-zinc-600">{text}</p>{config.autonomyMode === value ? <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase text-red-600"><CheckCircle2 size={13} /> Selecionado</span> : null}</button>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2"><SafetyItem icon={<BadgeDollarSign size={17} />} title="Desconto" text="Sempre sujeito a aprovação e às regras globais." /><SafetyItem icon={<UsersRound size={17} />} title="Handoff" text="Pode transferir para humano quando a conversa atingir gatilhos definidos." /></div></div>
  );
}

function TestSection({ testMessage, setTestMessage }: { testMessage: string; setTestMessage: (value: string) => void }) {
  return <div><p className="premium-eyebrow">Sandbox comercial</p><h3 className="mt-2 text-2xl font-black text-zinc-950">Treinar e Testar</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Antes de ativar qualquer comportamento automático, você poderá testar cenários usando Venda Mais + contexto desta loja + políticas. Nesta primeira versão visual, o simulador ainda não dispara a OpenAI.</p><textarea className="premium-input mt-5 min-h-32 resize-y" value={testMessage} onChange={(event) => setTestMessage(event.target.value)} /><button type="button" disabled className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-zinc-300 px-5 text-xs font-black text-white"><FlaskConical size={16} /> Simular com AUTOCAR — próxima etapa</button><div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-xs font-black text-zinc-900">O teste deverá mostrar</p><div className="mt-3 grid gap-2 md:grid-cols-2"><MiniPoint text="Etapa atual do Venda Mais" /><MiniPoint text="O que já sabemos do lead" /><MiniPoint text="O que ainda falta descobrir" /><MiniPoint text="Próxima melhor pergunta" /><MiniPoint text="Resposta sugerida" /><MiniPoint text="Regra/política que limitou a resposta" /></div></div></div>;
}

type SectionProps = { config: StoreConfig; update: <K extends keyof StoreConfig>(key: K, value: StoreConfig[K]) => void };

function SectionShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <div><p className="premium-eyebrow">{eyebrow}</p><h3 className="mt-2 text-2xl font-black text-zinc-950">{title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p><div className="mt-5 grid gap-3 md:grid-cols-2">{children}</div></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-black text-zinc-700"><span>{label}</span><input className="premium-input mt-1.5" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="text-xs font-black text-zinc-700 md:col-span-2"><span>{label}</span><textarea className="premium-input mt-1.5 min-h-24 resize-y" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SafetyItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center gap-2 text-red-600">{icon}<strong className="text-xs font-black text-zinc-900">{title}</strong></div><p className="mt-2 text-xs leading-5 text-zinc-600">{text}</p></div>;
}

function MiniPoint({ text }: { text: string }) {
  return <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-bold text-zinc-700"><CheckCircle2 size={14} className="text-emerald-600" />{text}</div>;
}
