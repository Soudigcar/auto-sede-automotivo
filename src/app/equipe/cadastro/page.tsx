'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';

function LegacyTeamRegistrationRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();

  useEffect(() => {
    if (token) router.replace(`/equipe/cadastro/${encodeURIComponent(token)}`);
  }, [router, token]);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#071020] px-5 text-white">
        <section className="w-full max-w-xl rounded-[32px] border border-white/10 bg-white/[0.05] p-7 text-center shadow-2xl">
          <ShieldCheck className="mx-auto text-red-500" size={42} />
          <h1 className="mt-5 text-2xl font-black">Link de cadastro inválido</h1>
          <p className="mt-3 text-sm text-zinc-400">Peça ao Gestor da loja um novo convite para entrar na equipe.</p>
          <Link href="/login" className="mt-6 inline-flex rounded-2xl bg-red-600 px-6 py-3 font-black">Ir para o login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#071020] px-5 text-white">
      <div className="text-center">
        <Loader2 className="mx-auto animate-spin text-red-500" size={34} />
        <p className="mt-4 font-bold text-zinc-300">Abrindo cadastro seguro...</p>
      </div>
    </main>
  );
}

export default function TeamRegistrationPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#071020] text-white">Validando convite...</main>}>
      <LegacyTeamRegistrationRedirect />
    </Suspense>
  );
}
