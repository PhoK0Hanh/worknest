import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { HomeSessionGate } from "@/components/auth/home-session-gate";

export default function Home() {
  // Public introduction to the implemented collaboration features.
  return (
    <HomeSessionGate>
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-6 text-sm font-semibold tracking-widest text-primary">WORKNEST</p>
      <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">Không gian chung.<br /><span className="text-primary">Công việc thông suốt.</span></h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Quản lý công việc nhóm với workspace, bảng Kanban và cộng tác realtime.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup" className={buttonVariants({ size: "lg" })}>Tạo tài khoản</Link>
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>Đăng nhập</Link>
        <Link href="/workspaces" className={buttonVariants({ variant: "ghost", size: "lg" })}>Workspace của tôi</Link>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { title: "Workspace & thành viên", description: "Tạo nhóm, mời thành viên và phân quyền Owner, Admin, Member." },
          { title: "Kanban Board", description: "Tạo, chỉnh sửa và kéo thả công việc theo trạng thái." },
          { title: "Realtime & Dashboard", description: "Đồng bộ thay đổi trong nhóm và theo dõi tiến độ công việc." },
        ].map(({ title, description }) => (
          <section key={title} className="rounded-2xl border border-border bg-background p-6">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          </section>
        ))}
      </div>
    </main>
    </HomeSessionGate>
  );
}
