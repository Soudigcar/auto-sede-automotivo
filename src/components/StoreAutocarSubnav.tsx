'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Workflow } from 'lucide-react';

export function StoreAutocarSubnav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const items = [
    { label: 'Visão Geral', href: `/loja/${slug}/autocar`, icon: Bot },
    { label: 'Follow-up', href: `/loja/${slug}/autocar/follow-up`, icon: Workflow }
  ];

  return <nav className="mx-4 mt-4 flex flex-wrap gap-2 md:mx-7">
    {items.map((item) => {
      const Icon = item.icon;
      const active = pathname === item.href;
      return <Link key={item.href} href={item.href} prefetch={false} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${active ? 'border-red-600 bg-red-600 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'}`}><Icon size={14}/>{item.label}</Link>;
    })}
  </nav>;
}
