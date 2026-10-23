import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Match real content dimensions while keeping animated placeholders out of the accessibility tree.
export function WorkspaceListSkeleton() {
  return <div role="status" aria-label="Đang tải workspace">
    <span className="sr-only">Đang tải workspace...</span>
    <div aria-hidden="true" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => <Card key={index} className="h-full min-w-0 gap-0 py-6 [--card-spacing:--spacing(6)]"><CardContent className="flex h-full flex-col">
        <div className="flex justify-between"><Skeleton className="size-11 rounded-xl" /><Skeleton className="h-6 w-16 rounded-full" /></div>
        <div className="mt-5 min-h-14"><Skeleton className="h-6 w-3/4" /></div><Skeleton className="mt-2 h-4 w-28" /><div className="mt-auto pt-6"><Skeleton className="h-14 w-full rounded-lg" /></div>
      </CardContent></Card>)}
    </div>
  </div>;
}

export function WorkspaceDetailSkeleton() {
  return <div role="status" aria-label="Đang tải chi tiết workspace">
    <span className="sr-only">Đang tải chi tiết workspace...</span>
    <div aria-hidden="true">
      <Skeleton className="h-7 w-40" /><Skeleton className="mt-3 h-4 w-2/3 max-w-sm" />
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-xl border border-border p-6"><Skeleton className="mb-5 h-6 w-32" />
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex items-center gap-3 border-t border-border py-4"><Skeleton className="size-10 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/3" /></div><Skeleton className="h-6 w-14 rounded-full" /></div>)}
        </div>
        <div className="space-y-6">{[0, 1].map(index => <div key={index} className="space-y-4 rounded-xl border border-border p-6"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-12 w-full" /><Skeleton className="h-4 w-2/3" /></div>)}</div>
      </div>
    </div>
  </div>;
}
