'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Building2, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type UserIdentity = {
  fullName: string;
  email: string;
  role: string;
  roleLabel: string;
  storeName: string;
};

const roleLabels: Record<string, string> = {
  master: 'Master',
  store: 'Gestor da loja',
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function IdentityCard({ identity, compact = false }: { identity: UserIdentity; compact?: boolean }) {
  return (
    <div className={compact ? 'flex items-center gap-3' : 'rounded-2xl border border-white/10 bg-white/[0.05] p-4'}>
      <div className="flex items-center gap-3">
        <div className={compact
          ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/20 text-xs font-black text-red-400'
          : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600/20 text-sm font-black text-red-400'}>
          {initials(identity.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Logado como</p>
          <p className="mt-1 truncate text-sm font-black text-white">{identity.fullName}</p>
          <p className="mt-0.5 truncate text-[11px] font-bold text-red-400">{identity.roleLabel}</p>
        </div>
      </div>

      {!compact ? (
        <div className="mt-3 flex items-start gap-2 border-t border-white/10 pt-3">
          <Building2 size={14} className="mt-0.5 shrink-0 text-zinc-500" />
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Loja vinculada</p>
            <p className="mt-1 truncate text-xs font-bold text-zinc-300">{identity.storeName}</p>
          </div>
        </div>
      ) : (
        <p className="ml-auto hidden max-w-[40%] truncate text-[10px] font-bold text-zinc-400 sm:block">{identity.storeName}</p>
      )}
    </div>
  );
}

export function StorePortalUserIdentity() {
  const pathname = usePathname() || '';
  const slug = pathname.match(/^\/loja\/([^/]+)/)?.[1] || '';
  const supabase = useMemo(() => createClient(), []);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      if (!slug) {
        setIdentity(null);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData.session?.user;
      if (!authUser) return;

      let profile: any = null;
      const { data: byAuth } = await supabase
        .from('users')
        .select('id, full_name, email, role, status, store_id')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      profile = byAuth;

      if (!profile && authUser.email) {
        const { data: byEmail } = await supabase
          .from('users')
          .select('id, full_name, email, role, status, store_id')
          .ilike('email', authUser.email)
          .maybeSingle();
        profile = byEmail;
      }

      if (!profile || profile.status !== 'active') return;

      const { data: store } = await supabase
        .from('stores')
        .select('id, store_name, slug, status, portal_enabled')
        .eq('slug', slug)
        .eq('status', 'active')
        .eq('portal_enabled', true)
        .maybeSingle();

      if (!store) return;
      if (profile.role !== 'master' && profile.store_id !== store.id) return;
      if (cancelled) return;

      setIdentity({
        fullName: String(profile.full_name || profile.email || 'Usuário'),
        email: String(profile.email || authUser.email || ''),
        role: String(profile.role || ''),
        roleLabel: roleLabels[String(profile.role || '')] || String(profile.role || 'Usuário'),
        storeName: String(store.store_name || 'Loja vinculada')
      });
    }

    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, [slug, supabase]);

  useEffect(() => {
    if (!identity || !slug) {
      setHost(null);
      return;
    }

    let attempts = 0;
    let intervalId: number | undefined;
    let createdHost: HTMLElement | null = null;

    function attach() {
      attempts += 1;
      const nav = document.querySelector<HTMLElement>('aside nav');
      const parent = nav?.parentElement;
      if (!nav || !parent) return false;

      let target = parent.querySelector<HTMLElement>('[data-store-user-identity-host="true"]');
      if (!target) {
        target = document.createElement('div');
        target.setAttribute('data-store-user-identity-host', 'true');
        target.className = 'mb-5';
        parent.insertBefore(target, nav);
        createdHost = target;
      }

      setHost(target);
      return true;
    }

    if (!attach()) {
      intervalId = window.setInterval(() => {
        const attached = attach();
        if ((attached || attempts >= 20) && intervalId !== undefined) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }
      }, 150);
    }

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (createdHost) createdHost.remove();
      setHost(null);
    };
  }, [identity, pathname, slug]);

  if (!slug || !identity) return null;

  return (
    <>
      {host ? createPortal(<IdentityCard identity={identity} />, host) : null}
      <div className="fixed bottom-3 left-3 right-3 z-[44] rounded-2xl border border-white/15 bg-[#071020]/95 p-3 text-white shadow-2xl backdrop-blur-lg lg:hidden">
        <IdentityCard identity={identity} compact />
      </div>
    </>
  );
}
