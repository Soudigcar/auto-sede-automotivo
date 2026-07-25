'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Car, CheckCircle2, Clock3, Loader2, MessageSquarePlus, Save, Tag } from 'lucide-react';
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

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function money(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Valor não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
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

export function PipelineLeadEditorEnhancer() {
  const pathname = usePathname();
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname || '');
  const slug = active ? String(pathname || '').split('/')[2] || '' : '';
  const supabase = createClient();

  const leadsRef = useRef<LeadSummary[]>([]);
  const clickedLeadIdRef = useRef('');
  const activeModalRef = useRef<HTMLElement | null>(null);
  const originalSaveRef = useRef<HTMLButtonElement | null>(null);
  const actionRowRef = useRef<HTMLElement | null>(null);

  const [modal, setModal] = useState<HTMLElement | null>(null);
  const [vehicleHost, setVehicleHost] = useState<HTMLElement | null>(null);
  const [notesHost, setNotesHost] = useState<HTMLElement | null>(null);
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  const [currentLead, setCurrentLead] = useState<any>(null);
  const [stock, setStock] = useState<StockVehicle[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [newObservation, setNewObservation] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectedVehicle = useMemo(
    () => stock.find((vehicle) => vehicle.id === selectedVehicleId) || null,
    [stock, selectedVehicleId]
  );

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
    notesHost?.remove();
    footerHost?.remove();
    originalSaveRef.current = null;
    actionRowRef.current = null;
    activeModalRef.current = null;
    setModal(null);
    setVehicleHost(null);
    setNotesHost(null);
    setFooterHost(null);
    setCurrentLead(null);
    setSelectedVehicleId('');
    setNewObservation('');
    setNotes([]);
    setMessage('');
  }

  async function loadLeadDetails(leadId: string) {
    try {
      setMessage('Carregando estoque e histórico...');
      const payload = await apiRequest(`/api/store/pipeline-details?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(leadId)}`);
      setStock(payload.stock || []);
      setCurrentLead(payload.lead || null);
      setNotes(payload.notes || []);
      setSelectedVehicleId(payload.lead?.interested_vehicle_id || '');
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
    setNotesHost(notesPortalHost);
    setFooterHost(footerPortalHost);
    setCurrentLead(lead);
    setSelectedVehicleId(lead.interested_vehicle_id || '');
    loadLeadDetails(lead.id);

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

    initialize();
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

  async function saveAll() {
    if (!modal || !currentLead?.id) return;
    const value = (label: string) => String(findControl(modal, label)?.value || '');

    setSaving(true);
    setMessage('Salvando informações e observações...');

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

      setCurrentLead(payload.lead);
      setNotes(payload.notes || []);
      setNewObservation('');
      setMessage('Informações salvas com sucesso.');

      window.setTimeout(() => {
        const closeButton = modal.querySelector('h2')?.parentElement?.querySelector<HTMLButtonElement>('button');
        closeButton?.click();
        const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          normalized(button.textContent).includes('atualizar pipeline')
        );
        refreshButton?.click();
      }, 550);
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
  [data-pipeline-notes-history="true"],
  [data-pipeline-custom-save="true"] {
    color-scheme: light;
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
