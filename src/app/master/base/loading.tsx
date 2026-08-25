export default function MasterBaseLoading() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] lg:block" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <div className="animate-pulse">
            <div className="h-3 w-36 rounded bg-zinc-200" />
            <div className="mt-4 h-12 w-72 max-w-full rounded-xl bg-zinc-200" />
            <div className="mt-3 h-4 w-[520px] max-w-full rounded bg-zinc-100" />
            <div className="mt-6 h-16 rounded-2xl bg-blue-50 ring-1 ring-blue-100" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[90px] rounded-2xl bg-white ring-1 ring-zinc-100" />)}
            </div>
            <div className="mt-4 h-36 rounded-2xl bg-white ring-1 ring-zinc-100" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-36 rounded-2xl bg-white ring-1 ring-zinc-100" />)}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
