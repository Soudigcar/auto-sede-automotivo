'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const protectedPrefixes = ['/master', '/prospector', '/store', '/pre-sales', '/routes'];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
      if (!isProtected) {
        setIsChecking(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session?.user?.email) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }

      const { data: profile } = await supabase.from('users').select('role,status').eq('email', data.session.user.email).single();
      if (!profile || profile.status !== 'active') {
        router.replace('/logout');
        return;
      }

      setIsChecking(false);
    }

    checkSession();
  }, [pathname, router, supabase]);

  if (isChecking && protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-black px-6 text-white">
        <div className="card p-8 text-center">
          <p className="text-sm uppercase tracking-[0.25em] text-brand-red">Acesso</p>
          <h1 className="mt-3 text-2xl font-black">Validando sessao...</h1>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
