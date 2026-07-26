'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  BadgeDollarSign,
  Banknote,
  Calculator,
  Car,
  CarFront,
  CheckCircle2,
  Clock3,
  Landmark,
  Loader2,
  MessageSquarePlus,
  Save,
  Tag
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

type StockVehicle = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: string | null;
  price: number | string | null;
  status: string | null;
};

type LeadNote = {
  id: string;
  note_type: 'general' | 'service' | 'appointment';
  content: string;
  author_name: string | null;
  created_at: string;
};

type LeadSummary = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  interested_vehicle: string | null;
  interested_vehicle_id?: string | null;
  interested_vehicle_price?: number | null;
  notes?: string | null;
  appointment_notes?: string | null;
};

type SaleDetails = {
  id: string;
  payment_type: string | null;
  financing_bank: string | null;
  sale_value: number | string | null;
  has_trade_in: boolean | null;
  installment_count: number | null;
  has_down_payment: boolean | null;
  down_payment_value: number | string | null;
  financed_amount: number | string | null;
  installment_value: number | string | null;
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

const installmentOptions = ['12', '24', '36', '48', '60'];

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

function money(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Valor não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function moneyInput(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '';
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function vehicleLabel(vehicle: StockVehicle) {
  return [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function findControl(modal: HTMLElement | null, labelText: string) {
  if (!modal) return null;
  const label = Array.from(modal.querySelectorAll<HTMLLabelElement>('label')).find((item) =>
    normalized(item.textContent).startsWith(normalized(labelText))
  );
  return label?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select') || null;
}

function setNativeInputValue(input: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!input) return;
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function noteLabel(type: LeadNote['note_type']) {
  if (type === 'appointment') return 'Agendamento';
  if (type === 'general') return 'Observação geral';
  return 'Atendimento';
}

function paymentTypeLabel(value: string) {
  if (value === 'cash') return 'À vista';
  if (value === 'financed') return 'Financiado';
  if (value === 'consortium') return 'Consórcio';
  if (value === 'other') return 'Outro';
  return 'Não informado';
}

export function PipelineLeadEditorEnhancer() {
  const pathname = usePathname();
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname || '');
  const slug = active ? String(pathname || '').split('/')[2] || '' : '';
  const supabase = useMemo(() => createClient(), []);

  const leadsRef = useRef<LeadSummary[]>([]);
  const clickedLeadIdRef = useRef('');
  const activeModalRef = useRef<HTMLElement | null>(null);
  const originalSaveRef = useRef<HTMLButtonElement | null>(null);
  const actionRowRef = useRef<HTMLElement | null>(null);

  const [modal, setModal] = useState<HTMLElement | null>(null);
  const [vehicleHost, setVehicleHost] = useState<HTMLElement | null>(null);
  const [commercialHost, setCommercialHost] = useState<HTMLElement | null>(null);
  const [notesHost, setNotesHost] = useState<HTMLElement | null>(null);
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  const [currentLead, setCurrentLead] = useState<any>(null);
  const [stock, setStock] = useState<StockVehicle[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [newObservation, setNewObservation] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [paymentType, setPaymentType] = useState('');
  const [bank, setBank] = useState('');
  const [otherBank, setOtherBank] = useState('');
  const [installmentPreset, setInstallmentPreset] = useState('');
  const [customInstallments, setCustomInstallments] = useState('');
  const [hasDownPayment, setHasDownPayment] = useState<'' | 'yes' | 'no'>('');
  const [downPaymentValue, setDownPaymentValue] = useState('');
  const [financedAmount, setFinancedAmount] = useState('');
  const [installmentValue, setInstallmentValue] = useState('');
  const [tradeIn, setTradeIn] = useState<'' | 'yes' | 'no'>('');
  const [saleValue, setSaleValue] = useState('');

  const selectedVehicle = useMemo(
    () => stock.find((vehicle) => vehicle.id === selectedVehicleId) || null,
    [stock, selectedVehicleId]
  );

  const finalInstallmentCount = installmentPreset === 'custom' ? customInstallments : installmentPreset;
  const installmentRequired = paymentType === 'financed' || paymentType === 'consortium';
  const bankVisible = paymentType !== '' && paymentType !== 'cash';
  const bankRequired = paymentType === 'financed';

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function apiRequest(url: string, options: RequestInit = {}) {
    const token = await getToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a ação.');
    return payload;
  }

  function resetCommercial() {
    setSale(null);
    setPaymentType('');
    setBank('');
    setOtherBank('');
    setInstallmentPreset('');
    setCustomInstallments('');
    setHasDownPayment('');
    setDownPaymentValue('');
    setFinancedAmount('');
    setInstallmentValue('');
    setTradeIn('');
    setSaleValue('');
  }

  function loadCommercial(details: SaleDetails | null) {
    setSale(details);
    if (!details) {
      resetCommercial();
      return;
    }

    const existingPayment = ['cash', 'financed', 'consortium', 'other'].includes(details.payment_type || '') ? String(details.payment_type) : '';
    const existingBank = String(details.financing_bank || '').trim();
    const knownBank = bankOptions.includes(existingBank);
    const count = details.installment_count ? String(details.installment_count) : '';

    setPaymentType(existingPayment);
    setBank(existingPayment !== 'cash' && existingBank && !['Não informado', 'Não se aplica', 'Consórcio', 'Outro'].includes(existingBank)
      ? (knownBank ? existingBank : 'other')
      : '');
    setOtherBank(existingPayment !== 'cash' && existingBank && !knownBank && !['Não informado', 'Não se aplica', 'Consórcio', 'Outro'].includes(existingBank) ? existingBank : '');
    setInstallmentPreset(installmentOptions.includes(count) ? count : count ? 'custom' : '');
    setCustomInstallments(installmentOptions.includes(count) ? '' : count);
    setHasDownPayment(typeof details.has_down_payment === 'boolean' ? (details.has_down_payment ? 'yes' : 'no') : '');
    setDownPaymentValue(moneyInput(details.down_payment_value));
    setFinancedAmount(moneyInput(details.financed_amount));
    setInstallmentValue(moneyInput(details.installment_value));
    setTradeIn(typeof details.has_trade_in === 'boolean' ? (details.has_trade_in ? 'yes' : 'no') : '');
    setSaleValue(moneyInput(details.sale_value));
  }

  function cleanupModal() {
    document.body.classList.remove('pipeline-editor-open');
    if (originalSaveRef.current) originalSaveRef.current.style.display = '';
    if (actionRowRef.current) {
      actionRowRef.current.style.position = '';
      actionRowRef.current.style.bottom = '';
      actionRowRef.current.style.zIndex = '';
      actionRowRef.current.style.background = '';
      actionRowRef.current.style.paddingTop = '';
      actionRowRef.current.style.paddingBottom = '';
      actionRowRef.current.style.borderTop = '';
    }
    vehicleHost?.remove();
    commercialHost?.remove();
    notesHost?.remove();
    footerHost?.remove();
    originalSaveRef.current = null;
    actionRowRef.current = null;
    activeModalRef.current = null;
    setModal(null);
    setVehicleHost(null);
    setCommercialHost(null);
    setNotesHost(null);
    setFooterHost(null);
    setCurrentLead(null);
    setSelectedVehicleId('');
    setNewObservation('');
    setNotes([]);
    resetCommercial();
    setMessage('');
  }

  async function loadLeadDetails(leadId: string) {
    try {
      setMessage('Carregando estoque, histórico e venda...');
      const [payload, salePayload] = await Promise.all([
        apiRequest(`/api/store/pipeline-details?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(leadId)}`),
        apiRequest(`/api/store/sale-confirmation?lead_id=${encodeURIComponent(leadId)}`)
      ]);
      setStock(payload.stock || []);
      setCurrentLead(payload.lead || null);
      setNotes(payload.notes || []);
      setSelectedVehicleId(payload.lead?.interested_vehicle_id || '');
      loadCommercial(salePayload.sale || null);
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar os detalhes do lead.');
    }
  }

  function identifyLead(modalElement: HTMLElement) {
    if (clickedLeadIdRef.current) {
      const clicked = leadsRef.current.find((lead) => lead.id === clickedLeadIdRef.current);
      if (clicked) return clicked;
    }

    const name = String(findControl(modalElement, 'Nome do cliente')?.value || '');
    const phone = digits(findControl(modalElement, 'Telefone / WhatsApp')?.value || '');
    return leadsRef.current.find((lead) => {
      const samePhone = phone && digits(lead.customer_phone) === phone;
      const sameName = normalized(lead.customer_name) === normalized(name);
      return samePhone ? samePhone : sameName;
    }) || null;
  }

  function enhanceModal(modalElement: HTMLElement) {
    if (activeModalRef.current === modalElement) return;
    if (activeModalRef.current && !document.body.contains(activeModalRef.current)) cleanupModal();

    const title = modalElement.querySelector('h2')?.textContent || '';
    if (!normalized(title).includes('adicionar, alterar ou excluir informações do lead')) return;

    const lead = identifyLead(modalElement);
    if (!lead) return;

    const vehicleControl = findControl(modalElement, 'Carro de interesse');
    const vehicleLabelElement = vehicleControl?.closest('label');
    const saveButton = Array.from(modalElement.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      normalized(button.textContent).includes('salvar alterações')
    );
    const actionRow = saveButton?.parentElement as HTMLElement | null;
    if (!vehicleLabelElement || !saveButton || !actionRow) return;

    const vehiclePortalHost = document.createElement('div');
    vehiclePortalHost.dataset.pipelineVehicleSelector = 'true';
    vehicleLabelElement.insertAdjacentElement('afterend', vehiclePortalHost);

    const commercialPortalHost = document.createElement('div');
    commercialPortalHost.dataset.pipelineSaleCommercial = 'true';
    vehiclePortalHost.insertAdjacentElement('afterend', commercialPortalHost);

    const notesPortalHost = document.createElement('div');
    notesPortalHost.dataset.pipelineNotesHistory = 'true';
    actionRow.insertAdjacentElement('beforebegin', notesPortalHost);

    const footerPortalHost = document.createElement('div');
    footerPortalHost.dataset.pipelineCustomSave = 'true';
    footerPortalHost.className = 'flex min-w-[190px] flex-1 sm:flex-none';
    actionRow.appendChild(footerPortalHost);

    saveButton.style.display = 'none';
    actionRow.style.position = 'sticky';
    actionRow.style.bottom = '0';
    actionRow.style.zIndex = '20';
    actionRow.style.background = 'rgba(255,255,255,0.97)';
    actionRow.style.paddingTop = '14px';
    actionRow.style.paddingBottom = 'max(12px, env(safe-area-inset-bottom))';
    actionRow.style.borderTop = '1px solid #e5e7eb';

    activeModalRef.current = modalElement;
    originalSaveRef.current = saveButton;
    actionRowRef.current = actionRow;
    document.body.classList.add('pipeline-editor-open');
    setModal(modalElement);
    setVehicleHost(vehiclePortalHost);
    setCommercialHost(commercialPortalHost);
    setNotesHost(notesPortalHost);
    setFooterHost(footerPortalHost);
    setCurrentLead(lead);
    setSelectedVehicleId(lead.interested_vehicle_id || '');
    void loadLeadDetails(lead.id);

    const manualVehicleInput = vehicleControl as HTMLInputElement;
    const clearSelectionOnManualEdit = () => {
      const selected = stock.find((vehicle) => vehicle.id === selectedVehicleId);
      if (selected && normalized(manualVehicleInput.value) !== normalized(vehicleLabel(selected))) {
        setSelectedVehicleId('');
      }
    };
    manualVehicleInput.addEventListener('input', clearSelectionOnManualEdit);
  }

  useEffect(() => {
    if (!active || !slug) return;
    let cancelled = false;

    async function initialize() {
      const context = await getStorePortalContext(slug);
      if (cancelled || context.status !== 'ok') return;

      const { data } = await supabase
        .from('leads')
        .select('id, customer_name, customer_phone, interested_vehicle, interested_vehicle_id, interested_vehicle_price, notes, appointment_notes')
        .eq('assigned_store_id', context.store.id)
        .order('created_at', { ascending: false });
      leadsRef.current = data || [];

      try {
        const payload = await apiRequest(`/api/store/pipeline-details?slug=${encodeURIComponent(slug)}`);
        if (!cancelled) setStock(payload.stock || []);
      } catch {
        // O modal continua funcional mesmo que o estoque esteja temporariamente indisponível.
      }
    }

    function trackCardClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const card = target?.closest<HTMLElement>('[data-pipeline-card="true"], [role="button"][draggable="true"]');
      if (!card) return;
      const name = normalized(card.querySelector('h3')?.textContent);
      const phoneText = digits(card.textContent);
      const lead = leadsRef.current.find((item) => {
        const phone = digits(item.customer_phone);
        return (phone && phoneText.includes(phone)) || normalized(item.customer_name) === name;
      });
      clickedLeadIdRef.current = lead?.id || '';
    }

    function detect() {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50'));
      const editor = candidates.find((candidate) => normalized(candidate.querySelector('h2')?.textContent).includes('adicionar, alterar ou excluir informações do lead')) || null;
      if (editor) enhanceModal(editor);
      else if (activeModalRef.current && !document.body.contains(activeModalRef.current)) cleanupModal();
    }

    void initialize();
    document.addEventListener('click', trackCardClick, true);
    const observer = new MutationObserver(detect);
    observer.observe(document.body, { childList: true, subtree: true });
    detect();

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener('click', trackCardClick, true);
      cleanupModal();
    };
  }, [active, slug]);

  function selectVehicle(id: string) {
    setSelectedVehicleId(id);
    if (!id) return;
    const vehicle = stock.find((item) => item.id === id);
    const input = findControl(modal, 'Carro de interesse') as HTMLInputElement | null;
    if (vehicle) setNativeInputValue(input, vehicleLabel(vehicle));
  }

  function changePaymentType(next: string) {
    setPaymentType(next);
    if (next === 'cash') {
      setBank('');
      setOtherBank('');
      setInstallmentPreset('');
      setCustomInstallments('');
      setHasDownPayment('no');
      setDownPaymentValue('');
      setFinancedAmount('');
      setInstallmentValue('');
    }
  }

  function calculateFinancing() {
    if (!['financed', 'consortium'].includes(paymentType)) return;
    const total = parseMoney(saleValue);
    const entry = hasDownPayment === 'yes' ? parseMoney(downPaymentValue) : 0;
    const installments = Number(finalInstallmentCount || 0);
    if (total === null || entry === null) return;
    const financed = Math.max(total - entry, 0);
    setFinancedAmount(moneyInput(financed));
    if (installments > 0) setInstallmentValue(moneyInput(financed / installments));
  }

  function validateCommercial() {
    if (!sale || !paymentType) return '';
    const selectedBank = bank === 'other' ? otherBank.trim() : bank;
    if (paymentType === 'financed' && !selectedBank) return 'Informe o banco do financiamento.';
    if (installmentRequired) {
      const count = Number(finalInstallmentCount);
      if (!Number.isInteger(count) || count < 1 || count > 120) return 'Informe uma quantidade de parcelas entre 1 e 120.';
    }
    if (paymentType !== 'cash' && !hasDownPayment) return 'Informe se houve entrada.';
    if (hasDownPayment === 'yes') {
      const entry = parseMoney(downPaymentValue);
      if (entry === null || entry <= 0) return 'Informe um valor de entrada maior que zero.';
    }
    if (!tradeIn) return 'Informe se houve veículo na troca.';
    return '';
  }

  async function saveAll() {
    if (!modal || !currentLead?.id) return;
    const value = (label: string) => String(findControl(modal, label)?.value || '');
    const validationMessage = validateCommercial();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setSaving(true);
    setMessage('Salvando informações, venda e observações...');

    try {
      const payload = await apiRequest('/api/store/pipeline-details', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          lead_id: currentLead.id,
          customer_name: value('Nome do cliente'),
          customer_phone: value('Telefone / WhatsApp'),
          interested_vehicle: value('Carro de interesse'),
          interested_vehicle_id: selectedVehicleId || null,
          origin: value('Origem / anúncio'),
          status: value('Status do lead'),
          schedule_date: value('Data'),
          schedule_time: value('Hora'),
          notes: value('Observação do lead'),
          appointment_notes: value('Observação do agendamento'),
          new_observation: newObservation
        })
      });

      if (sale) {
        const selectedBank = paymentType === 'cash'
          ? 'Não se aplica'
          : bank === 'other'
            ? otherBank.trim()
            : bank;
        const salePayload = await apiRequest('/api/store/sale-details', {
          method: 'POST',
          body: JSON.stringify({
            lead_id: currentLead.id,
            payment_type: paymentType,
            financing_bank: selectedBank,
            sale_value: saleValue,
            installment_count: finalInstallmentCount || null,
            has_down_payment: paymentType === 'cash' ? false : hasDownPayment === 'yes',
            down_payment_value: hasDownPayment === 'yes' ? downPaymentValue : null,
            financed_amount: financedAmount,
            installment_value: installmentValue,
            has_trade_in: tradeIn === 'yes'
          })
        });
        if (salePayload.sale) loadCommercial(salePayload.sale);
      }

      setCurrentLead(payload.lead);
      setNotes(payload.notes || []);
      setNewObservation('');
      setMessage('Informações e dados comerciais salvos com sucesso.');

      window.setTimeout(() => {
        const closeButton = modal.querySelector('h2')?.parentElement?.querySelector<HTMLButtonElement>('button');
        closeButton?.click();
        const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          normalized(button.textContent).includes('atualizar pipeline')
        );
        refreshButton?.click();
      }, 650);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o lead.');
    } finally {
      setSaving(false);
    }
  }

  if (!active) return null;

  return (
    <>
      <style>{editorStyles}</style>

      {vehicleHost ? createPortal(
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
          <div className="flex items-center gap-2"><Car size={18} className="text-red-600" /><p className="text-sm font-black">Selecionar veículo do estoque</p></div>
          <select value={selectedVehicleId} onChange={(event) => selectVehicle(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-red-500">
            <option value="">Outro veículo / Digitar manualmente</option>
            {stock.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)} — {money(vehicle.price)}</option>)}
          </select>
          {selectedVehicle ? (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Veículo selecionado</p><p className="mt-1 text-sm font-bold text-slate-900">{vehicleLabel(selectedVehicle)}</p></div>
              <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-emerald-700"><Tag size={15} /> {money(selectedVehicle.price)}</div>
            </div>
          ) : <p className="mt-2 text-xs text-slate-500">Você também pode escrever livremente no campo “Carro de interesse” acima.</p>}
        </div>,
        vehicleHost
      ) : null}

      {commercialHost && sale ? createPortal(
        <section className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50/40 p-4 text-slate-950 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><BadgeDollarSign size={20} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Venda confirmada</p>
                <h3 className="mt-1 text-lg font-black">Dados comerciais da venda</h3>
                <p className="mt-1 text-xs text-slate-500">Preencha pagamento, entrada, parcelas e troca. Os dados alimentarão relatórios e indicadores.</p>
              </div>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700">{paymentTypeLabel(paymentType)}</span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-black text-slate-700">
              Forma de pagamento
              <select value={paymentType} onChange={(event) => changePaymentType(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500">
                <option value="">Não informado</option>
                <option value="cash">À vista</option>
                <option value="financed">Financiado</option>
                <option value="consortium">Consórcio</option>
                <option value="other">Outro</option>
              </select>
            </label>

            <label className="text-sm font-black text-slate-700">
              Valor da venda
              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">R$</span>
                <input value={saleValue} onChange={(event) => setSaleValue(event.target.value)} onBlur={calculateFinancing} inputMode="decimal" placeholder="0,00" className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-emerald-500" />
              </div>
            </label>

            <fieldset>
              <legend className="text-sm font-black text-slate-700">Veículo na troca?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTradeIn('yes')} className={`rounded-2xl border px-3 py-3 text-sm font-black ${tradeIn === 'yes' ? 'border-emerald-500 bg-white text-emerald-700 ring-2 ring-emerald-100' : 'border-slate-300 bg-white text-slate-600'}`}>Sim</button>
                <button type="button" onClick={() => setTradeIn('no')} className={`rounded-2xl border px-3 py-3 text-sm font-black ${tradeIn === 'no' ? 'border-emerald-500 bg-white text-emerald-700 ring-2 ring-emerald-100' : 'border-slate-300 bg-white text-slate-600'}`}>Não</button>
              </div>
            </fieldset>
          </div>

          {paymentType && paymentType !== 'cash' ? (
            <div className="mt-4 grid gap-4 rounded-3xl border border-blue-100 bg-blue-50/70 p-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-black text-slate-700">
                {paymentType === 'consortium' ? 'Banco / administradora' : paymentType === 'financed' ? 'Banco financiador' : 'Instituição / observação'}
                <select value={bank} onChange={(event) => setBank(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
                  <option value="">{bankRequired ? 'Selecione o banco' : 'Não informado'}</option>
                  {bankOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  <option value="other">Outro</option>
                </select>
              </label>

              {bank === 'other' ? (
                <label className="text-sm font-black text-slate-700">
                  Nome da instituição
                  <input value={otherBank} onChange={(event) => setOtherBank(event.target.value)} placeholder="Digite o nome" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                </label>
              ) : (
                <div className="flex min-h-[84px] items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-blue-700"><Landmark size={22} /><p className="text-xs font-bold">A instituição ficará registrada no relatório comercial.</p></div>
              )}

              <label className="text-sm font-black text-slate-700">
                Quantidade de parcelas
                <select value={installmentPreset} onChange={(event) => setInstallmentPreset(event.target.value)} onBlur={calculateFinancing} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
                  <option value="">{installmentRequired ? 'Selecione' : 'Sem parcelas'}</option>
                  {installmentOptions.map((item) => <option key={item} value={item}>{item} parcelas</option>)}
                  <option value="custom">Outra quantidade</option>
                </select>
              </label>

              {installmentPreset === 'custom' ? (
                <label className="text-sm font-black text-slate-700">
                  Número personalizado
                  <input type="number" min="1" max="120" value={customInstallments} onChange={(event) => setCustomInstallments(event.target.value)} onBlur={calculateFinancing} placeholder="Ex.: 72" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                </label>
              ) : null}

              <fieldset className="md:col-span-2 lg:col-span-1">
                <legend className="text-sm font-black text-slate-700">Teve entrada?</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setHasDownPayment('yes')} className={`rounded-2xl border px-3 py-3 text-sm font-black ${hasDownPayment === 'yes' ? 'border-blue-500 bg-white text-blue-700 ring-2 ring-blue-100' : 'border-slate-300 bg-white text-slate-600'}`}>Sim</button>
                  <button type="button" onClick={() => { setHasDownPayment('no'); setDownPaymentValue(''); }} className={`rounded-2xl border px-3 py-3 text-sm font-black ${hasDownPayment === 'no' ? 'border-blue-500 bg-white text-blue-700 ring-2 ring-blue-100' : 'border-slate-300 bg-white text-slate-600'}`}>Não</button>
                </div>
              </fieldset>

              {hasDownPayment === 'yes' ? (
                <label className="text-sm font-black text-slate-700">
                  Valor da entrada
                  <div className="relative mt-2">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">R$</span>
                    <input value={downPaymentValue} onChange={(event) => setDownPaymentValue(event.target.value)} onBlur={calculateFinancing} inputMode="decimal" placeholder="0,00" className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500" />
                  </div>
                </label>
              ) : null}

              <label className="text-sm font-black text-slate-700">
                Valor financiado
                <div className="relative mt-2">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">R$</span>
                  <input value={financedAmount} onChange={(event) => setFinancedAmount(event.target.value)} inputMode="decimal" placeholder="0,00" className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
              </label>

              <label className="text-sm font-black text-slate-700">
                Valor da parcela
                <div className="relative mt-2">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">R$</span>
                  <input value={installmentValue} onChange={(event) => setInstallmentValue(event.target.value)} inputMode="decimal" placeholder="Opcional" className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
              </label>

              <button type="button" onClick={calculateFinancing} className="inline-flex min-h-12 items-center justify-center gap-2 self-end rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-50">
                <Calculator size={18} /> Calcular valores
              </button>
            </div>
          ) : paymentType === 'cash' ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-emerald-700"><Banknote size={21} /><p className="text-sm font-bold">Venda à vista: banco, parcelas e entrada não se aplicam.</p></div>
          ) : null}
        </section>,
        commercialHost
      ) : null}

      {notesHost ? createPortal(
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><MessageSquarePlus size={19} /></div>
            <div><h3 className="text-lg font-black text-slate-950">Histórico de observações</h3><p className="mt-1 text-xs text-slate-500">As novas anotações ficam registradas com data, hora e responsável.</p></div>
          </div>

          <label className="mt-4 block text-sm font-bold text-slate-700">
            Nova observação do atendimento
            <textarea value={newObservation} onChange={(event) => setNewObservation(event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-red-500" placeholder="Ex.: não atendeu; retornar amanhã às 10h; cliente pediu simulação com entrada..." />
          </label>

          <div className="mt-4 grid gap-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{noteLabel(note.note_type)}</span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Clock3 size={12} /> {new Date(note.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{note.content}</p>
                <p className="mt-2 text-xs font-bold text-slate-400">Registrado por {note.author_name || 'Usuário da loja'}</p>
              </article>
            ))}
            {notes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Nenhuma observação registrada no histórico ainda.</div> : null}
          </div>
        </section>,
        notesHost
      ) : null}

      {footerHost ? createPortal(
        <div className="flex w-full flex-col items-stretch gap-2 sm:min-w-[230px]">
          <button type="button" onClick={saveAll} disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
          {message ? <p className={message.includes('sucesso') ? 'flex items-center justify-center gap-1 text-center text-xs font-bold text-emerald-600' : 'text-center text-xs font-bold text-slate-500'}>{message.includes('sucesso') ? <CheckCircle2 size={13} /> : null}{message}</p> : null}
        </div>,
        footerHost
      ) : null}
    </>
  );
}

const editorStyles = `
  @media (min-width: 1024px) {
    .pipeline-mobile-dock { display: none !important; }
  }

  body.pipeline-editor-open .pipeline-mobile-dock { display: none !important; }

  body.pipeline-editor-open > div,
  body.pipeline-editor-open main { overscroll-behavior: contain; }

  body.pipeline-editor-open div.fixed.inset-0.z-50 > div {
    padding-bottom: 0 !important;
  }

  [data-pipeline-vehicle-selector="true"],
  [data-pipeline-sale-commercial="true"],
  [data-pipeline-notes-history="true"],
  [data-pipeline-custom-save="true"] {
    color-scheme: light;
  }

  [data-pipeline-sale-commercial="true"] {
    grid-column: 1 / -1;
    min-width: 0;
  }

  @media (max-width: 767px) {
    body.pipeline-editor-open div.fixed.inset-0.z-50 {
      align-items: flex-start !important;
      padding: 8px !important;
    }

    body.pipeline-editor-open div.fixed.inset-0.z-50 > div {
      max-height: calc(100dvh - 16px) !important;
      border-radius: 22px !important;
    }

    [data-pipeline-custom-save="true"] {
      width: 100%;
      min-width: 100%;
    }
  }
`;
