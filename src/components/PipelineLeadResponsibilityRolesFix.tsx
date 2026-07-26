'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Member = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  role_label: string;
};

type Payload = {
  current: Member | null;
  sale_closer: Member | null;
  pre_sales: Member | null;
  seller: Member | null;
  prospector: Member | null;
};

type RoleCard = {
  label: string;
  member: Member | null;
  highlight?: boolean;
};

function Card({ item }: { item: RoleCard }) {
  return (
    <div className={item.highlight
      ? 'min-w-0 rounded-xl border border-emerald-300/35 bg-emerald-400/10 px-3 py-2.5'
      : 'min-w-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5'}>
      <p className={item.highlight
        ? 'whitespace-normal break-words text-[9px] font-black uppercase leading-[1.35] tracking-[0.12em] text-emerald-300'
        : 'whitespace-normal break-words text-[9px] font-black uppercase leading-[1.35] tracking-[0.12em] text-zinc-400'}>
        {item.label}
      </p>
      <p className="mt-1 whitespace-normal break-words text-xs font-black leading-snug text-white">
        {item.member?.full_name || 'Não informado'}
      </p>
      {item.member?.role_label ? (
        <p className="mt-0.5 whitespace-normal break-words text-[10px] font-bold leading-snug text-zinc-400">
          {item.member.role_label}
        </p>
      ) : null}
    </div>
  );
}

export function PipelineLeadResponsibilityRolesFix({ leadId }: { leadId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const hostRef = useRef<HTMLElement | null>(null);
  const oldGridRef = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    if (!leadId) return;
    setLoading(true);
    setMessage('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      const response = await fetch(`/api/store/lead-responsibilities?lead_id=${encodeURIComponent(leadId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os responsáveis.');
      setPayload(result as Payload);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar os responsáveis.');
    } finally {
      setLoading(false);
    }
  }

  function cleanup() {
    if (oldGridRef.current) oldGridRef.current.style.display = '';
    hostRef.current?.remove();
    oldGridRef.current = null;
    hostRef.current = null;
    setHost(null);
  }

  useEffect(() => {
    if (!leadId) return;

    function connect() {
      const compactRoot = document.querySelector<HTMLElement>('[data-pipeline-lead-responsibility-compact="true"]');
      const section = compactRoot?.querySelector<HTMLElement>('section');
      if (!section) {
        if (hostRef.current && !document.body.contains(hostRef.current)) cleanup();
        return;
      }

      if (hostRef.current && document.body.contains(hostRef.current)) return;
      cleanup();

      const oldGrid = section.querySelector<HTMLElement>('div.mt-3.grid');
      if (!oldGrid) return;

      const replacement = document.createElement('div');
      replacement.dataset.pipelineResponsibilityRolesFix = 'true';
      oldGrid.insertAdjacentElement('afterend', replacement);
      oldGrid.style.display = 'none';

      oldGridRef.current = oldGrid;
      hostRef.current = replacement;
      setHost(replacement);
      void load();
    }

    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    connect();

    return () => {
      observer.disconnect();
      cleanup();
      setPayload(null);
    };
  }, [leadId]);

  const cards: RoleCard[] = [
    { label: 'Responsável atual', member: payload?.current || null },
    { label: 'Vendedor responsável pelo fechamento', member: payload?.sale_closer || null, highlight: true },
    { label: 'Pré-vendas / SDR', member: payload?.pre_sales || null },
    { label: 'Vendedor do atendimento', member: payload?.seller || null },
    { label: 'Prospectador', member: payload?.prospector || null }
  ];

  if (!host) return null;

  return createPortal(
    <div className="mt-3">
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 text-xs font-bold text-cyan-100">
          <Loader2 className="animate-spin" size={14} /> Carregando responsáveis...
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((item) => <Card key={item.label} item={item} />)}
        </div>
      )}
      {message ? <p className="mt-2 text-[10px] font-bold text-amber-300">{message}</p> : null}
    </div>,
    host
  );
}
