'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const protectedPrefixes = ['/master', '/prospector', '/store', '/pre-sales', '/routes'];

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
      if (!data.session?.user?.email) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }

      const { data: profile } = await supabase.from('users').select('role,status').eq('email', data.session.user.email).single();
      if (cancelled) return;
      if (!profile || profile.status !== 'active') {
        router.replace('/logout');
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
