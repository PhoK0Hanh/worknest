import Link from "next/link";
import { ArrowUpRight, Check, Layers3, Leaf } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-emerald-950 px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
        <Link
          href="/"
          className="relative z-10 flex w-fit items-center gap-2.5 text-xl font-semibold tracking-tight"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10">
            <Leaf className="size-5 text-emerald-300" aria-hidden="true" />
          </span>
          WorkNest
        </Link>
        <div className="relative z-10 my-auto py-16">
          <p className="mb-6 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-emerald-300 uppercase">
            <span className="size-1.5 rounded-full bg-emerald-300" /> Cùng nhóm
            tiến về phía trước
          </p>
          <h1 className="max-w-lg text-5xl leading-[1.15] font-semibold tracking-tight xl:text-6xl">
            Ít phân tán hơn.
            <br />
            <span className="text-emerald-300">Nhiều tiến triển hơn.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-emerald-100/70">
            Một nơi để sắp xếp công việc, kết nối thành viên và cùng nhau hoàn
            thành những điều quan trọng.
          </p>
          {/* Decorative product illustration, separate from real workspace data. */}
          <div
            aria-hidden="true"
            className="mt-12 max-w-md rounded-2xl border border-white/15 bg-white/6 p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
              <span className="flex items-center gap-2 text-sm">
                <Layers3 className="size-4 text-emerald-300" /> Không gian của
                nhóm
              </span>
              <ArrowUpRight className="size-4 text-white/40" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["Cần làm", "Đang làm", "Hoàn thành"].map((label, index) => (
                <div key={label}>
                  <p className="mb-3 text-[11px] text-emerald-100/70">
                    {label}
                  </p>
                  <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                    <div
                      className={`mb-3 h-1.5 w-8 rounded-full ${index === 2 ? "bg-emerald-300" : "bg-white/30"}`}
                    />
                    <div className="mb-2 h-1.5 w-full rounded bg-emerald-300/20" />
                    <div className="h-1.5 w-2/3 rounded bg-white/10" />
                    <div className="mt-4 flex justify-end">
                      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-300/20">
                        {index === 2 && (
                          <Check className="size-3 text-emerald-300" />
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="relative z-10 text-xs text-emerald-100/50">
          Một không gian chung. Một nhịp làm việc.
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-64 -bottom-56 size-150 rounded-full border border-white/10 bg-emerald-800/20"
        />
      </section>
      <section className="flex min-w-0 flex-col bg-white px-6 py-8 sm:px-12">
        <Link
          href="/"
          className="mb-10 flex w-fit items-center gap-2 text-lg font-semibold lg:hidden"
        >
          <Leaf className="size-5 text-primary" aria-hidden="true" />
          WorkNest
        </Link>
        <div className="m-auto w-full max-w-105 py-6">{children}</div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          WorkNest · Không gian làm việc của nhóm bạn
        </p>
      </section>
    </main>
  );
}
