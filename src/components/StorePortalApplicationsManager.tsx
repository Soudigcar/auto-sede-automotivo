'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Clock3, ExternalLink, Store, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function dateTime(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function StorePortalApplicationsManager() {
  const supabase = createClient();
  const [applications, setApplications] = useState<any[]>([]);
  const [status, setStatus] = useState('pending');
  const [message, setMessage] = useState('');
  const [loadingId, setLoadingId] = useState('');
  const [access, setAccess] = useState<any>(null);

  async function loadData() {
    const { data, error } = await supabase
      .from('store_portal_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setMessage('Não foi possível carregar as solicitações públicas.');
      return;
    }
    setApplications(data || []);
  }

  useEffect(() => { loadData().catch(() => null); }, []);

  const visible = useMemo(() => applications.filter((item) => status === 'all' || item.status === status), [applications, status]);
  const pendingCount = applications.filter((item) => ['pending', 'reviewing'].includes(item.status)).length;

  async function approve(application: any) {
    const confirmed = window.confirm(`Aprovar ${application.store_name} como loja permanente do Portal Auto Sede?`);
    if (!confirmed) return;

    setLoadingId(application.id);
    setMessage('Aprovando loja e preparando acesso...');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setMessage('Sessão expirada. Faça login novamente.');
      setLoadingId('');
      return;
    }

    const response = await fetch('/api/master/store-applications/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ application_id: application.id })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error || 'Erro ao aprovar loja.');
      setLoadingId('');
      return;
    }

    setAccess(result.existing_store ? null : result);
    setMessage(result.existing_store ? 'A solicitação foi vinculada à loja permanente já existente.' : 'Loja permanente aprovada. Copie o acesso provisório antes de fechar.');
    setLoadingId('');
    await loadData();
  }

  async function reject(application: any) {
    const reason = window.prompt(`Motivo da recusa de ${application.store_name}:`);
    if (reason === null) return;

    const { error } = await supabase.from('store_portal_applications').update({
      status: 'rejected',
      review_notes: reason || 'Solicitação recusada pelo master.',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', application.id);

    setMessage(error ? 'Erro ao recusar solicitação.' : 'Solicitação recusada.');
    if (!error) await loadData();
  }

  async function copyAccess() {
    if (!access?.password) return;
    const login = typeof window === 'undefined' ? access.login_path : `${window.location.origin}${access.login_path}`;
    await navigator.clipboard.writeText(`Loja: ${access.store_name}\nLogin: ${access.email}\nSenha provisória: ${access.password}\nAcesso: ${login}`);
    setMessage('Acesso da loja copiado.');
  }

  return (
    <section className="premium-card p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="premium-eyebrow">Portal Oficial</p>
          <h2 className="mt-2 text-2xl font-black text-zinc-950">Solicitações de novas lojas</h2>
          <p className="mt-1 text-sm text-zinc-500">Revendas encontradas pelo portal aguardam aprovação antes de receber acesso e publicação.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700"><Clock3 size={17} /> {pendingCount} aguardando análise</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {[['pending', 'Pendentes'], ['reviewing', 'Em análise'], ['approved', 'Aprovadas'], ['rejected', 'Recusadas'], ['all', 'Todas']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-xl px-4 py-2 text-xs font-black ${status === value ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{label}</button>
        ))}
      </div>

      <div className="mt-5 grid gap-3">
        {visible.map((application) => (
          <article key={application.id} className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black text-zinc-950">{application.store_name}</h3>
                  <Status value={application.status} />
                </div>
                <p className="mt-2 text-sm font-bold text-zinc-600">{application.responsible_name} · {application.responsible_phone}</p>
                <p className="mt-1 text-sm text-zinc-500">{application.responsible_email}</p>
                <p className="mt-1 text-xs font-bold text-zinc-400">{application.city || '-'} / {application.state || '-'} · CNPJ: {application.cnpj || 'não informado'} · Estoque aproximado: {application.approximate_vehicle_count ?? '-'}</p>
                <p className="mt-1 text-xs text-zinc-400">Recebida em {dateTime(application.created_at)}</p>
                {application.notes ? <p className="mt-3 rounded-2xl bg-white p-3 text-sm text-zinc-600">{application.notes}</p> : null}
                {application.review_notes ? <p className="mt-3 text-xs font-bold text-zinc-500">Análise: {application.review_notes}</p> : null}
              </div>

              {['pending', 'reviewing'].includes(application.status) ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => approve(application)} disabled={loadingId === application.id} className="premium-button-primary text-xs"><CheckCircle2 size={15} /> {loadingId === application.id ? 'Aprovando...' : 'Aprovar loja'}</button>
                  <button type="button" onClick={() => reject(application)} className="premium-button-secondary text-xs"><XCircle size={15} /> Recusar</button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {visible.length === 0 ? <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Nenhuma solicitação neste filtro.</p> : null}
      </div>

      {message ? <p className="mt-4 rounded-2xl bg-white p-3 text-sm font-bold text-zinc-600">{message}</p> : null}

      {access ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-[32px] bg-white p-7 shadow-2xl">
            <Store size={38} className="text-red-600" />
            <h3 className="mt-4 text-3xl font-black text-zinc-950">Acesso de {access.store_name}</h3>
            <p className="mt-2 text-sm font-bold text-zinc-500">A senha aparece somente nesta aprovação.</p>
            <div className="mt-5 grid gap-3">
              <Info label="Login" value={access.email} />
              <Info label="Senha provisória" value={access.password} important />
              <Info label="Página de acesso" value={access.login_path} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={copyAccess} className="premium-button-primary justify-center"><Clipboard size={17} /> Copiar acesso</button>
              <button type="button" onClick={() => setAccess(null)} className="premium-button-secondary justify-center"><ExternalLink size={17} /> Fechar</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = { pending: 'Pendente', reviewing: 'Em análise', approved: 'Aprovada', rejected: 'Recusada' };
  return <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">{labels[value] || value}</span>;
}

function Info({ label, value, important = false }: { label: string; value: string; important?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${important ? 'border-red-200 bg-red-50' : 'border-zinc-100 bg-zinc-50'}`}><p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p><strong className={`mt-1 block break-all ${important ? 'text-2xl text-red-600' : 'text-base text-zinc-950'}`}>{value}</strong></div>;
}
