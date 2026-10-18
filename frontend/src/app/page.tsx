export default function Home() {
  // Initial frontend scaffold; these features are planned, not implemented.
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-6 text-sm font-semibold tracking-widest text-emerald-700">WORKNEST</p>
      <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">Không gian chung.<br /><span className="text-emerald-700">Công việc thông suốt.</span></h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Quản lý công việc nhóm với workspace, bảng Kanban và cộng tác realtime.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {["Workspace & thành viên", "Kanban Board", "Realtime & Dashboard"].map((title) => (
          <section key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-3 text-sm text-slate-500">Sẽ triển khai</p>
          </section>
        ))}
      </div>
    </main>
  );
}
