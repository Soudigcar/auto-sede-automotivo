'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { BadgeDollarSign, Banknote, CarFront, CheckCircle2, Landmark, Loader2, UserRoundCheck, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Seller = {
  id: string;
  full_name: string;
  email: string | null;
};

type SaleContext = {
  lead: {
    id: string;
    customer_name: string | null;
    customer_phone: string | null;
    interested_vehicle: string | null;
    interested_vehicle_price: number | string | null;
    customer_bank: string | null;
    vehicle_category_interest: string | null;
    status: string;
    assigned_store_id: string;
  };
  store: { id: string; store_name: string; slug: string };
  sellers: Seller[];
  suggested_seller_id: string | null;
  sale: any | null;
};

const bankOptions = [
  'Bradesco',
  'Itaú',
  'Santander',
  'Banco do Brasil',
  'Caixa Econômica Federal',
  'Banco BV',
  'Banco PAN',
  'Banco Safra',
  'Daycoval',
  'C6 Bank',
  'Banco Inter'
];

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

function findLegacySaleModal() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50'));
  return candidates.find((candidate) =>
    normalized(candidate.querySelector('h2')?.textContent) === 'confirmar venda'
  ) || null;
}

function cardLeadId(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const card = element?.closest<HTMLElement>('[data-pipeline-card="true"], [role="button"][draggable="true"]');
  return card?.dataset.leadId || '';
}

function moneyInput(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '';
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PipelineSaleConfirmation() {
  const pathname = usePathname() || '';
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
  const supabase = useMemo(() => createClient(), []);
  const pendingLeadId = useRef('');
  const legacyModal = useRef<HTMLElement | null>(null);

  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [context, setContext] = useState<SaleContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [sellerUserId, setSellerUserId] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [bank, setBank] = useState('');
  const [otherBank, setOtherBank] = useState('');
  const [tradeIn, setTradeIn] = useState<'' | 'yes' | 'no'>('');
  const [saleValue, setSaleValue] = useState('');

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  function resetForm() {
    setContext(null);
    setLoading(false);
    setSaving(false);
    setMessage('');
    setSuccess(false);
    setSellerUserId('');
    setPaymentType('');
    setBank('');
    setOtherBank('');
    setTradeIn('');
    setSaleValue('');
  }

  function closeLegacyModal() {
    const modal = legacyModal.current;
    if (!modal) return;

    modal.style.display = '';
    modal.removeAttribute('aria-hidden');
    modal.removeAttribute('data-sale-flow-replaced');

    const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>('button'));
    const closeButton = buttons.find((button) => normalized(button.textContent) === 'voltar')
      || buttons.find((button) => button.getAttribute('aria-label')?.toLowerCase() === 'fechar')
      || buttons[0];
    closeButton?.click();
    legacyModal.current = null;
  }

  function close() {
    if (saving) return;
    setOpen(false);
    setLeadId('');
    resetForm();
    closeLegacyModal();
  }

  async function loadSale(currentLeadId: string) {
    setLoading(true);
    setMessage('Carregando vendedores e informações da venda...');
    setSuccess(false);

    try {
      const accessToken = await token();
      const response = await fetch(`/api/store/sale-confirmation?lead_id=${encodeURIComponent(currentLeadId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar a venda.');

      const loaded = payload as SaleContext;
      const existingPayment = ['cash', 'financed'].includes(loaded.sale?.payment_type) ? loaded.sale.payment_type : '';
      const existingBank = String(loaded.sale?.financing_bank || '').trim();
      const knownBank = bankOptions.includes(existingBank);

      setContext(loaded);
      setSellerUserId(loaded.suggested_seller_id || '');
      setPaymentType(existingPayment);
      setBank(existingPayment === 'financed' ? (knownBank ? existingBank : existingBank && existingBank !== 'Não informado' ? 'other' : '') : '');
      setOtherBank(existingPayment === 'financed' && existingBank && !knownBank && existingBank !== 'Não informado' ? existingBank : '');
      setTradeIn(typeof loaded.sale?.has_trade_in === 'boolean' ? (loaded.sale.has_trade_in ? 'yes' : 'no') : '');
      setSaleValue(moneyInput(loaded.sale?.sale_value ?? loaded.lead.interested_vehicle_price));
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível preparar a venda.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;

    function rememberClick(event: MouseEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      const button = target.closest<HTMLButtonElement>('button');
      if (!button) return;
      const label = normalized(button.textContent);
      if (label === 'venda' || label === 'confirmar venda') {
        const id = cardLeadId(target);
        if (id) pendingLeadId.current = id;
      }
    }

    function rememberDrag(event: DragEvent) {
      const id = cardLeadId(event.target);
      if (id) pendingLeadId.current = id;
    }

    function connect() {
      const modal = findLegacySaleModal();
      if (!modal || modal.dataset.saleFlowReplaced === 'true') return;

      const currentLeadId = pendingLeadId.current;
      modal.dataset.saleFlowReplaced = 'true';
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      legacyModal.current = modal;
      setLeadId(currentLeadId);
      setOpen(true);

      if (!currentLeadId) {
        setMessage('Não foi possível identificar o lead. Feche esta janela e tente novamente pelo botão Venda do card.');
        return;
      }

      void loadSale(currentLeadId);
    }

    document.addEventListener('click', rememberClick, true);
    document.addEventListener('dragstart', rememberDrag, true);
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    connect();

    return () => {
      document.removeEventListener('click', rememberClick, true);
      document.removeEventListener('dragstart', rememberDrag, true);
      observer.disconnect();
      if (legacyModal.current) {
        legacyModal.current.style.display = '';
        legacyModal.current.removeAttribute('aria-hidden');
        legacyModal.current.removeAttribute('data-sale-flow-replaced');
      }
      legacyModal.current = null;
    };
  }, [active]);

  async function confirmSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadId || saving) return;

    if (!sellerUserId) {
      setMessage('Selecione o vendedor responsável pelo fechamento.');
      return;
    }
    if (!paymentType) {
      setMessage('Selecione se a venda foi à vista ou financiada.');
      return;
    }
    const selectedBank = paymentType === 'cash' ? 'Não se aplica' : bank === 'other' ? otherBank.trim() : bank;
    if (paymentType === 'financed' && !selectedBank) {
      setMessage('Selecione ou informe o banco do financiamento.');
      return;
    }
    if (!tradeIn) {
      setMessage('Informe se houve veículo na troca.');
      return;
    }

    setSaving(true);
    setSuccess(false);
    setMessage('Confirmando venda e atualizando o dashboard Master...');

    try {
      const accessToken = await token();
      const response = await fetch('/api/store/sale-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          lead_id: leadId,
          seller_user_id: sellerUserId,
          payment_type: paymentType,
          financing_bank: selectedBank,
          has_trade_in: tradeIn === 'yes',
          sale_value: saleValue
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível confirmar a venda.');

      setSuccess(true);
      setMessage(payload.message || 'Venda confirmada com sucesso.');

      window.setTimeout(() => {
        setOpen(false);
        resetForm();
        closeLegacyModal();
        const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          normalized(button.textContent).includes('atualizar pipeline')
        );
        refreshButton?.click();
      }, 900);
    } catch (error: any) {
      setSuccess(false);
      setMessage(error?.message || 'Não foi possível confirmar a venda.');
    } finally {
      setSaving(false);
    }
  }

  if (!active || !open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirmar venda completa" onMouseDown={close}>
      <section className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-[30px] bg-white text-slate-950 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur md:px-7">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><BadgeDollarSign size={24} /></div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Fechamento da negociação</p>
              <h2 className="mt-1 text-2xl font-black">Confirmar venda</h2>
              <p className="mt-1 text-sm text-slate-500">Registre o vendedor e os dados que alimentarão o dashboard Master.</p>
            </div>
          </div>
          <button type="button" onClick={close} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50"><X size={20} /></button>
        </header>

        {loading ? (
          <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
            <Loader2 className="animate-spin text-emerald-600" size={34} />
            <p className="mt-4 font-bold text-slate-600">Carregando vendedores e informações da venda...</p>
          </div>
        ) : context ? (
          <form onSubmit={confirmSale}>
            <div className="grid gap-5 p-5 md:p-7">
              <div className="rounded-3xl bg-[#071020] p-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Cliente e veículo</p>
                <h3 className="mt-2 text-2xl font-black">{context.lead.customer_name || 'Cliente sem nome'}</h3>
                <p className="mt-2 text-sm font-bold text-slate-300">{context.lead.interested_vehicle || 'Veículo não informado'}</p>
                {context.lead.interested_vehicle_price ? <p className="mt-2 text-sm font-black text-emerald-300">Valor de referência: R$ {moneyInput(context.lead.interested_vehicle_price)}</p> : null}
              </div>

              <label className="text-sm font-black text-slate-700">
                Vendedor responsável pelo fechamento
                <select value={sellerUserId} onChange={(event) => setSellerUserId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500" required>
                  <option value="">Selecione o vendedor</option>
                  {context.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name}</option>)}
                </select>
                {context.sellers.length === 0 ? <span className="mt-2 block text-xs font-bold text-red-600">Nenhum vendedor ativo foi encontrado na equipe desta loja.</span> : null}
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-black text-slate-700">
                  Forma de pagamento
                  <select value={paymentType} onChange={(event) => { setPaymentType(event.target.value); if (event.target.value === 'cash') { setBank(''); setOtherBank(''); } }} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500" required>
                    <option value="">Selecione</option>
                    <option value="cash">À vista</option>
                    <option value="financed">Financiado</option>
                  </select>
                </label>

                <label className="text-sm font-black text-slate-700">
                  Valor da venda
                  <div className="relative mt-2">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">R$</span>
                    <input value={saleValue} onChange={(event) => setSaleValue(event.target.value)} inputMode="decimal" placeholder="0,00" className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-emerald-500" />
                  </div>
                </label>
              </div>

              {paymentType === 'financed' ? (
                <div className="grid gap-4 rounded-3xl border border-blue-100 bg-blue-50/60 p-4 md:grid-cols-2">
                  <label className="text-sm font-black text-slate-700">
                    Banco do financiamento
                    <select value={bank} onChange={(event) => setBank(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" required>
                      <option value="">Selecione o banco</option>
                      {bankOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                      <option value="other">Outro banco</option>
                    </select>
                  </label>
                  {bank === 'other' ? (
                    <label className="text-sm font-black text-slate-700">
                      Nome do banco
                      <input value={otherBank} onChange={(event) => setOtherBank(event.target.value)} placeholder="Digite o banco" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" required />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-blue-700"><Landmark size={22} /><p className="text-sm font-bold">O banco será registrado no relatório financeiro da venda.</p></div>
                  )}
                </div>
              ) : null}

              <fieldset>
                <legend className="text-sm font-black text-slate-700">Houve veículo na troca?</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setTradeIn('yes')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${tradeIn === 'yes' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white'}`}>
                    <CarFront size={21} className="text-emerald-600" /><div><p className="font-black">Sim</p><p className="text-xs text-slate-500">Cliente deixou veículo na troca</p></div>
                  </button>
                  <button type="button" onClick={() => setTradeIn('no')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${tradeIn === 'no' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white'}`}>
                    <Banknote size={21} className="text-slate-600" /><div><p className="font-black">Não</p><p className="text-xs text-slate-500">Venda sem veículo usado na troca</p></div>
                  </button>
                </div>
              </fieldset>

              {message ? <div className={`flex items-center gap-2 rounded-2xl p-4 text-sm font-bold ${success ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{success ? <CheckCircle2 size={19} /> : null}<span>{message}</span></div> : null}
            </div>

            <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end md:px-7">
              <button type="button" onClick={close} disabled={saving} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-600 disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={saving || context.sellers.length === 0} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={19} /> : <UserRoundCheck size={19} />}
                {saving ? 'Confirmando venda...' : 'Confirmar venda e responsável'}
              </button>
            </footer>
          </form>
        ) : (
          <div className="p-8 text-center"><p className="font-bold text-red-600">{message || 'Não foi possível carregar a venda.'}</p><button type="button" onClick={close} className="mt-4 rounded-2xl border border-slate-300 px-5 py-3 font-black">Fechar</button></div>
        )}
      </section>
    </div>,
    document.body
  );
}
