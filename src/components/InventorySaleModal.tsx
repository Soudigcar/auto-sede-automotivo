'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, DoorOpen, Globe2, Loader2, Search, TicketCheck, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type InventorySaleModalProps = {
  slug: string;
  vehicleId: string;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
};

type LeadOption = {
  id: string;
  customer_name: string;
  customer_phone_masked?: string;
  email?: string | null;
  cpf?: string | null;
  event_id?: string | null;
  origin?: string | null;
  status?: string;
  interested_vehicle?: string | null;
};

type TeamMember = { id: string; full_name: string; role: string };
type EventOption = { id: string; event_name: string; start_date?: string | null; end_date?: string | null; status?: string | null; city?: string | null; state?: string | null };
type Vehicle = { id: string; display_name: string; price?: number | null; image_url?: string | null; status: string; sold_at?: string | null };
type SaleChannel = 'door' | 'internet' | 'event';

const paymentOptions = [
  ['cash', 'À vista'],
  ['financed', 'Financiamento'],
  ['consortium', 'Consórcio'],
  ['other', 'Outra forma']
] as const;

function inputClass() {
  return 'w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-950 outline-none transition focus:border-emerald-500';
}

function roleLabel(role: string) {
  return ({ store: 'Gestor', pre_sales: 'Pré-vendas', seller: 'Vendedor', prospector: 'Prospectador' } as Record<string, string>)[role] || role;
}

function eventPeriod(event: EventOption) {
  if (!event.start_date && !event.end_date) return '';
  const format = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '';
  return [format(event.start_date), format(event.end_date)].filter(Boolean).join(' a ');
}

export default function InventorySaleModal({ slug, vehicleId, onClose, onCompleted }: InventorySaleModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [context, setContext] = useState<{ vehicle: Vehicle; team: TeamMember[]; events: EventOption[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<SaleChannel | ''>('');
  const [registerCustomer, setRegisterCustomer] = useState<boolean | null>(null);
  const [eventId, setEventId] = useState('');
  const [leadQuery, setLeadQuery] = useState('');
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [hasTradeIn, setHasTradeIn] = useState('');
  const [duplicate, setDuplicate] = useState<LeadOption | null>(null);

  async function request(url: string, options: RequestInit = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error: any = new Error(payload.error || 'Não foi possível concluir a operação.');
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void request(`/api/store/portal/inventory-sale?slug=${encodeURIComponent(slug)}&vehicle_id=${encodeURIComponent(vehicleId)}`)
      .then((payload) => { if (active) setContext(payload); })
      .catch((error: any) => { if (active) setMessage(error?.message || 'Não foi possível carregar a venda.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, vehicleId]);

  useEffect(() => {
    if (!channel || channel === 'door' || manualMode || selectedLead || leadQuery.trim().length < 2) {
      setLeadOptions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const eventFilter = channel === 'event' && eventId ? `&event_id=${encodeURIComponent(eventId)}` : '';
      void request(`/api/store/portal/inventory-sale?slug=${encodeURIComponent(slug)}&action=search-leads&q=${encodeURIComponent(leadQuery)}${eventFilter}`)
        .then((payload) => setLeadOptions(payload.leads || []))
        .catch(() => setLeadOptions([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [leadQuery, channel, eventId, manualMode, selectedLead, slug]);

  useEffect(() => {
    if (!manualMode || selectedLead || (!phone.trim() && !email.trim())) {
      setDuplicate(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void request('/api/store/portal/inventory-sale', {
        method: 'POST',
        body: JSON.stringify({ action: 'duplicate-check', slug, phone, email })
      }).then((payload) => setDuplicate(payload.duplicate || null)).catch(() => setDuplicate(null));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [manualMode, selectedLead, phone, email, slug]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', handleKey); };
  }, [busy, onClose]);

  function resetCustomerSelection() {
    setSelectedLead(null);
    setManualMode(false);
    setLeadQuery('');
    setLeadOptions([]);
    setName(''); setPhone(''); setEmail(''); setCpf(''); setBirthDate(''); setDuplicate(null);
  }

  function chooseChannel(value: SaleChannel) {
    setChannel(value);
    setMessage('');
    setRegisterCustomer(value === 'door' ? null : true);
    setEventId('');
    resetCustomerSelection();
  }

  function selectLead(lead: LeadOption) {
    setSelectedLead(lead);
    setManualMode(false);
    setLeadOptions([]);
    setLeadQuery(lead.customer_name);
    setName(lead.customer_name || '');
    setEmail(lead.email || '');
    setCpf(lead.cpf || '');
    setDuplicate(null);
  }

  async function confirmSale() {
    if (!channel) return setMessage('Selecione a origem da venda.');
    if (channel === 'door' && registerCustomer === null) return setMessage('Informe se deseja cadastrar cliente e responsável.');
    if (channel === 'event' && !eventId) return setMessage('Selecione o evento da venda.');

    const detailedSale = channel !== 'door' || registerCustomer === true;
    if (detailedSale && !selectedLead && !manualMode) return setMessage('Busque um lead ou escolha cadastrar o cliente manualmente.');
    if (detailedSale && manualMode && duplicate) return setMessage('Já existe um lead com este telefone ou e-mail. Use o cadastro encontrado.');
    if (detailedSale && !responsibleUserId) return setMessage('Selecione o responsável pela venda.');
    if (detailedSale && !paymentType) return setMessage('Selecione a forma de pagamento.');
    if (detailedSale && !hasTradeIn) return setMessage('Informe se houve veículo na troca.');

    setBusy(true); setMessage('');
    try {
      const payload = await request('/api/store/portal/inventory-sale', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          slug,
          vehicle_id: vehicleId,
          sale_channel: channel,
          event_id: channel === 'event' ? eventId : null,
          lead_id: selectedLead?.id || null,
          register_customer: channel === 'door' ? registerCustomer === true : true,
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          customer_cpf: cpf,
          birth_date: birthDate || null,
          responsible_user_id: responsibleUserId || null,
          payment_type: paymentType || null,
          has_trade_in: hasTradeIn === 'yes' ? true : hasTradeIn === 'no' ? false : null
        })
      });
      setMessage(payload.message || 'Venda registrada com sucesso.');
      await onCompleted();
      window.setTimeout(onClose, 700);
    } catch (error: any) {
      if (error?.payload?.duplicate) {
        setDuplicate(error.payload.duplicate);
        setManualMode(true);
      }
      setMessage(error?.message || 'Não foi possível registrar a venda.');
    } finally {
      setBusy(false);
    }
  }

  const detailedSale = channel !== '' && (channel !== 'door' || registerCustomer === true);
  const canUseManual = channel === 'internet' || channel === 'event' || (channel === 'door' && registerCustomer === true);

  return <div className="fixed inset-0 z-[2147483646] overflow-y-auto bg-black/80 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
    <div className="mx-auto flex min-h-full max-w-4xl items-start justify-center">
      <section className="my-2 w-full overflow-hidden rounded-[28px] bg-white text-zinc-950 shadow-2xl sm:my-4">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 sm:px-7">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Registrar venda</p><h2 className="mt-1 text-2xl font-black">Veículo vendido</h2></div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"><X /></button>
        </header>

        <div className="grid gap-5 bg-zinc-50 p-4 sm:p-7">
          {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-emerald-600" size={36} /></div> : context ? <>
            <section className="rounded-[24px] bg-[#071020] p-5 text-white">
              <div className="flex gap-4"><div className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-white/10">{context.vehicle.image_url ? <img src={context.vehicle.image_url} alt="Veículo" className="h-full w-full object-cover" /> : null}</div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Venda do estoque</p><h3 className="mt-1 text-xl font-black">{context.vehicle.display_name || 'Veículo selecionado'}</h3><p className="mt-1 text-sm text-zinc-300">Ao concluir, a data/hora da venda será registrada e o anúncio deixará de ficar disponível publicamente.</p></div></div>
            </section>

            {!channel ? <section><h3 className="text-lg font-black">Onde esta venda aconteceu?</h3><div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ChannelButton icon={<DoorOpen size={22} />} title="Porta" description="Cliente chegou diretamente à loja." onClick={() => chooseChannel('door')} />
              <ChannelButton icon={<Globe2 size={22} />} title="Internet" description="Venda originada de lead digital." onClick={() => chooseChannel('internet')} />
              <ChannelButton icon={<TicketCheck size={22} />} title="Evento" description="Venda vinculada a um evento." onClick={() => chooseChannel('event')} />
            </div></section> : <>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4"><div><p className="text-xs font-black uppercase text-zinc-500">Origem selecionada</p><p className="mt-1 font-black">{channel === 'door' ? 'Porta' : channel === 'internet' ? 'Internet' : 'Evento'}</p></div><button type="button" className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black" onClick={() => setChannel('')}>Alterar</button></section>

              {channel === 'door' && registerCustomer === null ? <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><h3 className="font-black text-emerald-950">Deseja cadastrar o lead e o responsável pela venda?</h3><p className="mt-2 text-sm text-emerald-800">Isso alimenta os indicadores comerciais e aumenta a precisão dos relatórios.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" className="rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white" onClick={() => { setRegisterCustomer(true); setManualMode(true); }}>Sim, cadastrar</button><button type="button" className="rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm font-black text-emerald-800" onClick={() => setRegisterCustomer(false)}>Não, registrar venda rápida</button></div></section> : null}

              {channel === 'event' ? <label className="grid gap-2 text-xs font-black uppercase text-zinc-600">Evento da venda<select className={inputClass()} value={eventId} onChange={(e) => { setEventId(e.target.value); resetCustomerSelection(); }}><option value="">Selecione o evento</option>{context.events.map((event) => <option key={event.id} value={event.id}>{event.event_name}{eventPeriod(event) ? ` · ${eventPeriod(event)}` : ''}</option>)}</select></label> : null}

              {detailedSale ? <section className="grid gap-4 rounded-[24px] border border-zinc-200 bg-white p-5">
                <div><h3 className="font-black">Cliente / lead da venda</h3><p className="mt-1 text-sm text-zinc-500">Busque antes de cadastrar. Telefone e e-mail também são usados para detectar duplicidade.</p></div>

                {!manualMode && !selectedLead ? <div className="relative"><Search className="absolute left-4 top-3.5 text-zinc-400" size={18} /><input className={`${inputClass()} pl-11`} placeholder="Buscar por nome, telefone ou e-mail" value={leadQuery} onChange={(e) => setLeadQuery(e.target.value)} disabled={channel === 'event' && !eventId} />{leadOptions.length ? <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">{leadOptions.map((lead) => <button key={lead.id} type="button" onClick={() => selectLead(lead)} className="block w-full rounded-xl px-3 py-3 text-left hover:bg-zinc-50"><span className="block text-sm font-black">{lead.customer_name}</span><span className="mt-1 block text-xs text-zinc-500">{[lead.customer_phone_masked, lead.email, lead.interested_vehicle].filter(Boolean).join(' · ')}</span></button>)}</div> : null}</div> : null}

                {selectedLead ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">Lead selecionado</p><p className="mt-1 font-black text-emerald-950">{selectedLead.customer_name}</p><p className="mt-1 text-sm text-emerald-800">{[selectedLead.customer_phone_masked, selectedLead.email].filter(Boolean).join(' · ')}</p></div><button type="button" className="text-xs font-black text-emerald-800 underline" onClick={resetCustomerSelection}>Trocar</button></div></div> : null}

                {canUseManual && !selectedLead ? <button type="button" className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-black" onClick={() => { setManualMode(true); setLeadOptions([]); }}><UserPlus size={17} />Cadastrar cliente manualmente</button> : null}

                {manualMode && !selectedLead ? <div className="grid gap-3 sm:grid-cols-2"><input className={inputClass()} placeholder="Nome *" value={name} onChange={(e) => setName(e.target.value)} /><input className={inputClass()} placeholder="Telefone / WhatsApp *" value={phone} onChange={(e) => setPhone(e.target.value)} /><input className={inputClass()} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} /><input className={inputClass()} placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} /><label className="grid gap-2 text-xs font-black uppercase text-zinc-600 sm:col-span-2">Data de nascimento<input className={inputClass()} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label></div> : null}

                {duplicate && !selectedLead ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black uppercase text-amber-700">Cadastro já encontrado</p><p className="mt-1 font-black text-amber-950">{duplicate.customer_name}</p><p className="mt-1 text-sm text-amber-800">{[duplicate.customer_phone_masked, duplicate.email].filter(Boolean).join(' · ')}</p><button type="button" className="mt-3 rounded-xl bg-amber-900 px-4 py-2 text-xs font-black text-white" onClick={() => selectLead(duplicate)}>Usar este lead</button></div> : null}

                <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-xs font-black uppercase text-zinc-600">Responsável pela venda<select className={inputClass()} value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}><option value="">Selecione</option>{context.team.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {roleLabel(member.role)}</option>)}</select></label><label className="grid gap-2 text-xs font-black uppercase text-zinc-600">Forma de pagamento<select className={inputClass()} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}><option value="">Selecione</option>{paymentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
                <label className="grid gap-2 text-xs font-black uppercase text-zinc-600">Houve veículo na troca?<select className={inputClass()} value={hasTradeIn} onChange={(e) => setHasTradeIn(e.target.value)}><option value="">Selecione</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
              </section> : null}
            </>}

            {message ? <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-black text-zinc-700">{message}</div> : null}

            {channel && !(channel === 'door' && registerCustomer === null) ? <button type="button" disabled={busy} onClick={() => void confirmSale()} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}Confirmar veículo vendido</button> : null}
          </> : null}
        </div>
      </section>
    </div>
  </div>;
}

function ChannelButton({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-[22px] border border-zinc-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">{icon}</span><span className="mt-4 block text-base font-black">{title}</span><span className="mt-1 block text-sm text-zinc-500">{description}</span></button>;
}
