'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Car, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getRoleHomePath } from '@/lib/auth';

const accessProfiles = [
  {
    key: 'master',
    title: 'Master',
    description: 'Gestão administrativa, eventos, lojas, financeiro, base e relatórios.',
    icon: ShieldCheck
  },
  {
    key: 'store',
    title: 'Loja',
    description: 'Portal exclusivo da loja, pipeline, estoque, venda e perda.',
    icon: Building2
  },
  {
    key: 'pre_sales',
    title: 'Pré-venda',
    description: 'Atendimento, mensagens, ligações, agendamentos e comparecimentos.',
    icon: UserRoundCheck
  },
  {
    key: 'prospector',
    title: 'Prospectador',
    description: 'Captação externa, pesquisa de rua e cadastro rápido de leads.',
    icon: UsersRound
  }
];

const roleLabel: Record<string, string> = {
  master: 'Master',
  store: 'Loja',
  pre_sales: 'Pré-venda',
  prospector: 'Prospectador'
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const redirectedFrom = searchParams.get('redirectedFrom');
  const initialAccess = redirectedFrom?.startsWith('/loja/') ? 'store' : 'master';

  const [selectedAccess, setSelectedAccess] = useState(initialAccess);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (redirectedFrom?.startsWith('/loja/')) {
      setSelectedAccess('store');
    }
  }, [redirectedFrom]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setMessage('Informe e-mail e senha.');
      return;
    }

    setMessage('Validando acesso...');

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      setMessage('Não foi possível acessar. Verifique e-mail e senha.');
      return;
    }

    const { data: authData } = await supabase.auth.getUser();

    let profile: any = null;

    if (authData.user?.id) {
      const { data } = await supabase
        .from('users')
        .select('id,role,status,store_id,email')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      profile = data;
    }

    if (!profile) {
      const { data } = await supabase
        .from('users')
        .select('id,role,status,store_id,email')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      profile = data;
    }

    if (!profile || profile.status !== 'active') {
      await supabase.auth.signOut();
      setMessage('Usuário sem perfil ativo no sistema.');
      return;
    }

    if (selectedAccess !== profile.role) {
      setMessage(`Acesso identificado como ${roleLabel[profile.role] || profile.role}. Redirecionando conforme o perfil autorizado...`);
    } else {
      setMessage('Acesso validado. Redirecionando...');
    }

    let target = redirectedFrom || getRoleHomePath(profile.role);

    if (profile.role === 'store') {
      if (!profile.store_id) {
        await supabase.auth.signOut();
        setMessage('Usuário de loja sem loja vinculada. Fale com o administrador.');
        return;
      }

      const { data: store } = await supabase
        .from('stores')
        .select('id,slug,portal_enabled,status')
        .eq('id', profile.store_id)
        .maybeSingle();

      if (!store || store.status !== 'active' || !store.portal_enabled) {
        await supabase.auth.signOut();
        setMessage('Portal da loja indisponível ou desativado.');
        return;
      }

      const storeHome = `/loja/${store.slug}`;
      const storePrefix = `/loja/${store.slug}`;

      target = redirectedFrom?.startsWith(storePrefix) ? redirectedFrom : storeHome;
    }

    router.push(target);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1fr_430px] lg:items-center">
          <div>
            <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/30 md:p-9">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-red-500">
                Sistema Automotivo
              </p>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
                Auto Controle Automotivo
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-300">
                Acesso restrito para gestão de eventos, lojas, leads, estoque, financeiro e operação comercial.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {accessProfiles.map((profile) => {
                  const Icon = profile.icon;
                  const active = selectedAccess === profile.key;

                  return (
                    <button
                      key={profile.key}
                      type="button"
                      onClick={() => setSelectedAccess(profile.key)}
                      className={[
                        'rounded-3xl border p-4 text-left transition',
                        active
                          ? 'border-red-500 bg-red-600/15 shadow-lg shadow-red-600/10'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-3">
                        <div className={[
                          'flex h-11 w-11 items-center justify-center rounded-2xl',
                          active ? 'bg-red-600 text-white' : 'bg-white/10 text-zinc-300'
                        ].join(' ')}>
                          <Icon size={21} />
                        </div>

                        <div>
                          <h2 className="font-black">{profile.title}</h2>
                          <p className="mt-1 text-xs text-zinc-400">{profile.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-bold text-zinc-300">
                  Perfil selecionado: <span className="text-red-400">{roleLabel[selectedAccess]}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  A entrada real é validada pelo cadastro do usuário no banco. Selecionar um perfil aqui não libera acesso sem permissão.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="rounded-[34px] border border-white/10 bg-white p-7 text-[#101828] shadow-2xl shadow-black/40 md:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white">
                <Car size={24} />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">
                  Login seguro
                </p>
                <h2 className="text-2xl font-black text-zinc-950">
                  Entrar no sistema
                </h2>
              </div>
            </div>

            <p className="mt-4 text-sm text-zinc-500">
              Use o e-mail e senha cadastrados pelo administrador.
            </p>

            <label className="mt-6 block text-sm font-bold text-zinc-700">
              E-mail
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seuemail@dominio.com.br"
              autoComplete="email"
            />

            <label className="mt-4 block text-sm font-bold text-zinc-700">
              Senha
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111827] px-4 py-3 font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              autoComplete="current-password"
            />

            <button className="btn-primary mt-6 w-full justify-center" type="submit">
              Entrar como {roleLabel[selectedAccess]}
            </button>

            {message ? (
              <p className="mt-4 rounded-2xl bg-zinc-50 p-3 text-sm font-semibold text-zinc-600">
                {message}
              </p>
            ) : null}

            <div className="mt-5 rounded-2xl bg-zinc-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                Segurança
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Nenhuma área administrativa é pública. Cada login acessa somente o perfil autorizado.
              </p>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#070A12] px-6 text-white"><p className="text-sm font-bold text-zinc-400">Carregando login...</p></main>}>
      <LoginContent />
    </Suspense>
  );
}
