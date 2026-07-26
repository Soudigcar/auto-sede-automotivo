'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const protectedPrefixes = ['/master', '/prospector', '/store', '/pre-sales', '/routes', '/loja'];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
      if (!isProtected) {
        if (!cancelled) setIsChecking(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const authUser = data.session?.user;
      if (!authUser?.email) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }

      let profile: any = null;

      const { data: profileByAuth } = await supabase
        .from('users')
        .select('role,status,must_change_password')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      profile = profileByAuth;

      if (!profile) {
        const { data: profileByEmail } = await supabase
          .from('users')
          .select('role,status,must_change_password')
          .ilike('email', authUser.email)
          .maybeSingle();

        profile = profileByEmail;
      }

      if (cancelled) return;
      if (!profile || profile.status !== 'active') {
        router.replace('/logout');
        return;
      }

      if (profile.role !== 'master' && profile.must_change_password) {
        router.replace(`/trocar-senha?next=${encodeURIComponent(pathname)}`);
        return;
      }

      setIsChecking(false);
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, supabase]);

  if (isChecking && protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-black px-6 text-white">
        <div className="card p-8 text-center">
          <p className="text-sm uppercase tracking-[0.25em] text-brand-red">Acesso</p>
          <h1 className="mt-3 text-2xl font-black">Validando sessão...</h1>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
