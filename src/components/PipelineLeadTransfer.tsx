'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, CheckCircle2, Loader2, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type TeamMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  role_label: string;
};

type TransferPayload = {
  current_responsible: TeamMember | null;
  current_responsible_id: string | null;
  team: TeamMember[];
};

const roleOrder = ['store', 'pre_sales', 'seller', 'prospector'];

const roleLabels: Record<string, string> = {
  store: 'Gestor',
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

export function PipelineLeadTransfer({ leadId }: { leadId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const editorRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);

  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentResponsible, setCurrentResponsible] = useState<TeamMember | null>(null);
  const [originalResponsibleId, setOriginalResponsibleId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

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
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a transferência.');
    return payload;
  }

  function removeHost() {
    hostRef.current?.remove();
    hostRef.current = null;
    editorRef.current = null;
    setHost(null);
  }

  useEffect(() => {
    if (!leadId) return;

    function connect() {
      const editor = findEditorModal();
      if (!editor) {
        if (hostRef.current && !document.body.contains(hostRef.current)) removeHost();
        return;
      }

      if (editorRef.current === editor && hostRef.current && document.body.contains(hostRef.current)) return;
      removeHost();

      const responsibleLabel = Array.from(editor.querySelectorAll<HTMLParagraphElement>('p')).find(
        (item) => normalized(item.textContent) === 'responsável'
      );
      const responsibleCard = responsibleLabel?.parentElement;
      if (!responsibleCard) return;

      const transferHost = document.createElement('div');
      transferHost.dataset.pipelineLeadTransfer = 'true';
      responsibleCard.appendChild(transferHost);

      editorRef.current = editor;
      hostRef.current = transferHost;
      setHost(transferHost);
    }

    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    connect();

    return () => {
      observer.disconnect();
      removeHost();
      setOpen(false);
    };
  }, [leadId]);

  async function openTransfer() {
    if (!leadId) return;

    setOpen(true);
    setLoading(true);
    setSaving(false);
    setMessage('Carregando equipe da loja...');
    setSuccess(false);

    try {
      const payload: TransferPayload = await apiRequest(`/api/store/lead-transfer?lead_id=${encodeURIComponent(leadId)}`);
      const responsibleId = payload.current_responsible_id || '';
      setTeam(payload.team || []);
      setCurrentResponsible(payload.current_responsible || null);
      setOriginalResponsibleId(responsibleId);
      setSelectedUserId(responsibleId);
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a equipe da loja.');
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
      const payload = await apiRequest('/api/store/lead-transfer', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: leadId,
          target_user_id: selectedUserId || null
        })
      });

      setSuccess(true);
      setMessage(payload.message || 'Lead transferido com sucesso.');
      setCurrentResponsible(payload.current_responsible || null);
      setOriginalResponsibleId(selectedUserId);

      window.setTimeout(() => {
        setOpen(false);
        const closeButton = editorRef.current
          ?.querySelector('h2')
          ?.parentElement
          ?.querySelector<HTMLButtonElement>('button');
        closeButton?.click();

        const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          normalized(button.textContent).includes('atualizar pipeline')
        );
        refreshButton?.click();
      }, 900);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível transferir o lead.');
    } finally {
      setSaving(false);
    }
  }

  const groupedTeam = roleOrder.map((role) => ({
    role,
    label: roleLabels[role],
    members: team.filter((member) => member.role === role)
  })).filter((group) => group.members.length > 0);

  return (
    <>
      {host ? createPortal(
        <button
          type="button"
          onClick={() => void openTransfer()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-200/30 bg-white/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-white/15"
        >
          <ArrowRightLeft size={17} /> Transferir Lead
        </button>,
        host
      ) : null}

      {open && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Transferir lead" onMouseDown={closeTransfer}>
          <section className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 md:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600"><ArrowRightLeft size={21} /></div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Responsável pelo atendimento</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">Transferir Lead</h2>
                  <p className="mt-1 text-sm text-slate-500">A loja, a etapa e os dados do cliente serão mantidos.</p>
                </div>
              </div>
              <button type="button" onClick={closeTransfer} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50"><X size={20} /></button>
            </header>

            {loading ? (
              <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                <Loader2 className="animate-spin text-red-600" size={32} />
                <p className="mt-4 font-bold text-slate-600">Carregando equipe da loja...</p>
              </div>
            ) : (
              <div className="p-5 md:p-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm"><ShieldCheck size={19} /></div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Responsável atual</p>
                      <p className="mt-1 font-black text-slate-900">{currentResponsible?.full_name || 'Carteira geral da loja'}</p>
                      <p className="text-xs text-slate-500">{currentResponsible?.role_label || 'Sem responsável individual'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-sm font-black text-slate-950">Selecione o novo responsável</p>
                  <p className="mt-1 text-xs text-slate-500">Somente colaboradores ativos e vinculados à mesma loja aparecem abaixo.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedUserId('')}
                  className={`mt-4 flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${selectedUserId === '' ? 'border-red-500 bg-red-50 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><UsersRound size={19} /></div>
                  <div className="min-w-0 flex-1"><p className="font-black text-slate-900">Carteira geral da loja</p><p className="text-xs text-slate-500">Deixar o lead sem responsável individual</p></div>
                  {selectedUserId === '' ? <CheckCircle2 className="shrink-0 text-red-600" size={20} /> : null}
                </button>

                <div className="mt-5 grid gap-5">
                  {groupedTeam.map((group) => (
                    <section key={group.role}>
                      <div className="mb-2 flex items-center gap-2"><UserRound size={15} className="text-red-600" /><h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{group.label}</h3></div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.members.map((member) => {
                          const selected = selectedUserId === member.id;
                          const current = originalResponsibleId === member.id;
                          return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => setSelectedUserId(member.id)}
                              className={`flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? 'border-red-500 bg-red-50 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-700">{member.full_name.slice(0, 2).toUpperCase()}</div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-slate-900">{member.full_name}</p>
                                <p className="truncate text-xs text-slate-500">{member.role_label}</p>
                                {current ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Atual</span> : null}
                              </div>
                              {selected ? <CheckCircle2 className="shrink-0 text-red-600" size={19} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  {team.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhum colaborador ativo foi encontrado nesta loja.</div>
                  ) : null}
                </div>

                {message ? (
                  <div className={`mt-5 flex items-center gap-2 rounded-2xl p-4 text-sm font-bold ${success ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {success ? <CheckCircle2 size={18} /> : null}<span>{message}</span>
                  </div>
                ) : null}
              </div>
            )}

            {!loading ? (
              <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end md:px-6">
                <button type="button" onClick={closeTransfer} disabled={saving} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-600 disabled:opacity-50">Cancelar</button>
                <button type="button" onClick={() => void confirmTransfer()} disabled={saving || selectedUserId === originalResponsibleId} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <ArrowRightLeft size={18} />}
                  {saving ? 'Transferindo...' : 'Confirmar transferência'}
                </button>
              </footer>
            ) : null}
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}
