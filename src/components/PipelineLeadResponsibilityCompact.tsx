'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, Building2, CheckCircle2, Loader2, UserRound, UsersRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type TeamMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  role_label: string;
};

type ResponsibilityPayload = {
  current_responsible: TeamMember | null;
  current_responsible_id: string | null;
  current_responsible_role: string | null;
  responsibilities: {
    pre_sales: TeamMember | null;
    seller: TeamMember | null;
    prospector: TeamMember | null;
    sale_closer: TeamMember | null;
  };
  sale: {
    seller_name: string | null;
    financing_bank: string | null;
    payment_type: string | null;
    sale_value: number | string | null;
    has_trade_in: boolean | null;
    confirmed_at: string | null;
  } | null;
  team: TeamMember[];
};

type ResponsibilityItem = {
  label: string;
  member: TeamMember | null;
  highlight?: boolean;
};

const roleOrder = ['pre_sales', 'seller', 'prospector'];
const groupLabels: Record<string, string> = {
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedores',
  prospector: 'Prospectadores'
};

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

function findEditorModal() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50'));
  return candidates.find((candidate) =>
    normalized(candidate.querySelector('h2')?.textContent).includes('adicionar, alterar ou excluir informações do lead')
  ) || null;
}

function formatPayment(sale: ResponsibilityPayload['sale']) {
  if (!sale) return '';
  const payment = sale.payment_type === 'cash'
    ? 'À vista'
    : sale.payment_type === 'financed'
      ? sale.financing_bank ? `Financiado · ${sale.financing_bank}` : 'Financiado'
      : 'Pagamento não informado';
  const trade = sale.has_trade_in === true ? 'Com troca' : sale.has_trade_in === false ? 'Sem troca' : 'Troca não informada';
  return `${payment} · ${trade}`;
}

function buildResponsibilityItems(payload: ResponsibilityPayload | null): ResponsibilityItem[] {
  if (!payload) return [];

  const items: ResponsibilityItem[] = [];
  const used = new Set<string>();
  const current = payload.current_responsible;
  const closer = payload.responsibilities.sale_closer;

  if (current) {
    const closesSale = Boolean(payload.sale && closer?.id === current.id);
    items.push({
      label: closesSale ? 'Responsável atual · Fechamento' : 'Responsável atual',
      member: current,
      highlight: closesSale
    });
    used.add(current.id);
  }

  if (payload.sale && closer && !used.has(closer.id)) {
    items.push({ label: 'Vendedor do fechamento', member: closer, highlight: true });
    used.add(closer.id);
  }

  const operational: Array<[string, TeamMember | null]> = [
    ['Pré-vendas', payload.responsibilities.pre_sales],
    ['Vendedor', payload.responsibilities.seller],
    ['Prospectador', payload.responsibilities.prospector]
  ];

  operational.forEach(([label, member]) => {
    if (!member || used.has(member.id)) return;
    items.push({ label, member });
    used.add(member.id);
  });

  if (!items.length) items.push({ label: 'Responsável atual', member: null });
  return items;
}

function CompactResponsibility({ item }: { item: ResponsibilityItem }) {
  return (
    <div className={item.highlight
      ? 'min-w-0 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2'
      : 'min-w-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2'}>
      <p className={item.highlight
        ? 'truncate text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300'
        : 'truncate text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400'}>
        {item.label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-white">{item.member?.full_name || 'Não informado'}</p>
      {item.member?.role_label ? <p className="mt-0.5 truncate text-[10px] font-bold text-zinc-400">{item.member.role_label}</p> : null}
    </div>
  );
}

export function PipelineLeadResponsibilityCompact({ leadId }: { leadId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const editorRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  const originalCardRef = useRef<HTMLElement | null>(null);
  const detailsGridRef = useRef<HTMLElement | null>(null);
  const originalCardStyleRef = useRef('');
  const originalGridStyleRef = useRef('');

  const [host, setHost] = useState<HTMLElement | null>(null);
  const [storeName, setStoreName] = useState('Loja');
  const [payload, setPayload] = useState<ResponsibilityPayload | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [originalResponsibleId, setOriginalResponsibleId] = useState('');

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function request(url: string, options: RequestInit = {}) {
    const accessToken = await token();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os responsáveis.');
    return data;
  }

  async function loadResponsibilities(showLoading = true) {
    if (!leadId) return;
    if (showLoading) setPanelLoading(true);

    try {
      const data = await request(`/api/store/lead-transfer?lead_id=${encodeURIComponent(leadId)}`) as ResponsibilityPayload;
      setPayload(data);
      const currentId = data.current_responsible_id || '';
      setOriginalResponsibleId(currentId);
      setSelectedUserId(currentId);
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar os responsáveis.');
    } finally {
      setPanelLoading(false);
    }
  }

  function restoreLayout() {
    hostRef.current?.remove();
    if (originalCardRef.current) originalCardRef.current.style.cssText = originalCardStyleRef.current;
    if (detailsGridRef.current) detailsGridRef.current.style.cssText = originalGridStyleRef.current;

    hostRef.current = null;
    originalCardRef.current = null;
    detailsGridRef.current = null;
    editorRef.current = null;
    setHost(null);
  }

  useEffect(() => {
    if (!leadId) return;

    function connect() {
      const editor = findEditorModal();
      if (!editor) {
        if (hostRef.current && !document.body.contains(hostRef.current)) restoreLayout();
        return;
      }

      if (editorRef.current === editor && hostRef.current && document.body.contains(hostRef.current)) return;
      restoreLayout();

      const responsibleLabel = Array.from(editor.querySelectorAll<HTMLParagraphElement>('p')).find((item) => {
        const text = normalized(item.textContent);
        return text === 'responsável' || text === 'loja e responsáveis';
      });
      const responsibleCard = responsibleLabel?.parentElement as HTMLElement | null;
      const detailsGrid = responsibleCard?.parentElement as HTMLElement | null;
      const hero = detailsGrid?.parentElement as HTMLElement | null;
      if (!responsibleCard || !detailsGrid || !hero) return;

      const name = Array.from(responsibleCard.querySelectorAll<HTMLParagraphElement>('p'))
        .map((item) => String(item.textContent || '').trim())
        .find((text) => text && !['responsável', 'loja e responsáveis'].includes(normalized(text))) || 'Loja';

      const compactHost = document.createElement('div');
      compactHost.dataset.pipelineLeadResponsibilityCompact = 'true';
      compactHost.className = 'relative z-[2] mb-3';
      hero.insertBefore(compactHost, detailsGrid);

      originalCardStyleRef.current = responsibleCard.style.cssText;
      originalGridStyleRef.current = detailsGrid.style.cssText;
      responsibleCard.style.display = 'none';
      detailsGrid.style.gridTemplateColumns = 'minmax(0, 1fr)';
      detailsGrid.style.gap = '0';

      editorRef.current = editor;
      hostRef.current = compactHost;
      originalCardRef.current = responsibleCard;
      detailsGridRef.current = detailsGrid;
      setStoreName(name);
      setHost(compactHost);
      void loadResponsibilities();
    }

    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    connect();

    return () => {
      observer.disconnect();
      restoreLayout();
      setOpen(false);
      setPayload(null);
    };
  }, [leadId]);

  async function openTransfer() {
    setOpen(true);
    setLoading(true);
    setSaving(false);
    setMessage('Carregando equipe da loja...');
    setSuccess(false);

    try {
      await loadResponsibilities(false);
      setMessage('');
    } catch {
      setMessage('Não foi possível carregar a equipe da loja.');
    } finally {
      setLoading(false);
    }
  }

  function closeTransfer() {
    if (saving) return;
    setOpen(false);
    setMessage('');
    setSuccess(false);
  }

  async function confirmTransfer() {
    if (!leadId || saving) return;
    if (selectedUserId === originalResponsibleId) {
      setMessage('Selecione outro responsável ou escolha a carteira geral da loja.');
      return;
    }

    setSaving(true);
    setSuccess(false);
    setMessage('Transferindo lead...');

    try {
      const result = await request('/api/store/lead-transfer', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId, target_user_id: selectedUserId || null })
      });
      setSuccess(true);
      setMessage(result.message || 'Lead transferido com sucesso.');
      await loadResponsibilities(false);

      window.setTimeout(() => {
        setOpen(false);
        const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          normalized(button.textContent).includes('atualizar pipeline')
        );
        refreshButton?.click();
      }, 700);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível transferir o lead.');
    } finally {
      setSaving(false);
    }
  }

  const responsibilityItems = buildResponsibilityItems(payload);
  const team = payload?.team || [];
  const groupedTeam = roleOrder.map((role) => ({
    role,
    label: groupLabels[role],
    members: team.filter((member) => member.role === role)
  })).filter((group) => group.members.length > 0);

  return (
    <>
      {host ? createPortal(
        <section className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left backdrop-blur-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-100"><Building2 size={18} /></div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Loja e responsáveis</p>
                <p className="mt-0.5 truncate text-sm font-black text-white">{storeName}</p>
              </div>
            </div>

            <button type="button" onClick={() => void openTransfer()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-200/30 bg-white/10 px-4 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-white/15">
              <ArrowRightLeft size={15} /> Transferir Lead
            </button>
          </div>

          {panelLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-cyan-100"><Loader2 className="animate-spin" size={14} /> Carregando responsáveis...</div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {responsibilityItems.map((item, index) => <CompactResponsibility key={`${item.label}-${item.member?.id || index}`} item={item} />)}
            </div>
          )}

          {payload?.sale ? <p className="mt-2 text-[10px] font-bold text-zinc-300">{formatPayment(payload.sale)}</p> : null}
          {message && !open ? <p className="mt-2 text-[10px] font-bold text-amber-300">{message}</p> : null}
        </section>,
        host
      ) : null}

      {open && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Transferir lead" onMouseDown={closeTransfer}>
          <section className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[26px] bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><ArrowRightLeft size={19} /></div>
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">Responsável pelo atendimento</p><h2 className="mt-1 text-xl font-black text-slate-950">Transferir Lead</h2><p className="mt-1 text-xs text-slate-500">O vendedor do fechamento permanecerá no histórico.</p></div>
              </div>
              <button type="button" onClick={closeTransfer} disabled={saving} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 disabled:opacity-50"><X size={18} /></button>
            </header>

            {loading ? (
              <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><Loader2 className="animate-spin text-red-600" size={30} /><p className="mt-3 text-sm font-bold text-slate-600">Carregando equipe da loja...</p></div>
            ) : (
              <div className="p-5 md:p-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Responsável atual</p><p className="mt-1 text-sm font-black text-slate-900">{payload?.current_responsible?.full_name || 'Carteira geral da loja'}</p><p className="text-xs text-slate-500">{payload?.current_responsible?.role_label || 'Sem responsável individual'}</p></div>

                <button type="button" onClick={() => setSelectedUserId('')} className={`mt-4 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedUserId === '' ? 'border-red-500 bg-red-50 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><UsersRound size={18} /></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-black text-slate-900">Carteira geral da loja</p><p className="text-xs text-slate-500">Deixar sem responsável individual</p></div>
                  {selectedUserId === '' ? <CheckCircle2 className="shrink-0 text-red-600" size={19} /> : null}
                </button>

                <div className="mt-4 grid gap-4">
                  {groupedTeam.map((group) => (
                    <section key={group.role}>
                      <div className="mb-2 flex items-center gap-2"><UserRound size={14} className="text-red-600" /><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{group.label}</h3></div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.members.map((member) => {
                          const selected = selectedUserId === member.id;
                          const current = originalResponsibleId === member.id;
                          return (
                            <button key={member.id} type="button" onClick={() => setSelectedUserId(member.id)} className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? 'border-red-500 bg-red-50 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-700">{member.full_name.slice(0, 2).toUpperCase()}</div>
                              <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{member.full_name}</p><p className="truncate text-xs text-slate-500">{member.role_label}</p>{current ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase text-slate-500">Atual</span> : null}</div>
                              {selected ? <CheckCircle2 className="shrink-0 text-red-600" size={18} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  {team.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Nenhum colaborador ativo foi encontrado.</div> : null}
                </div>

                {message ? <div className={`mt-4 rounded-2xl p-3 text-sm font-bold ${success ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{message}</div> : null}

                <footer className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeTransfer} disabled={saving} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-600 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={() => void confirmTransfer()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={18} /> : <ArrowRightLeft size={18} />}{saving ? 'Transferindo...' : 'Confirmar transferência'}</button>
                </footer>
              </div>
            )}
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}
