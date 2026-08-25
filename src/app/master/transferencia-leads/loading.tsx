export default function MasterLeadTransferLoading() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="hidden min-h-screen w-[260px] bg-[#071020] md:fixed md:inset-y-0 md:left-0 md:block" />
      <main className="ml-0 min-h-screen p-4 md:ml-[260px] md:p-7">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-40 rounded-3xl bg-slate-950" />
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="h-[560px] rounded-3xl bg-white ring-1 ring-zinc-100" />
            <div className="space-y-4">
              <div className="h-32 rounded-3xl bg-white ring-1 ring-zinc-100" />
              <div className="h-44 rounded-3xl bg-blue-50 ring-1 ring-blue-100" />
              <div className="h-11 rounded-xl bg-slate-300" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
