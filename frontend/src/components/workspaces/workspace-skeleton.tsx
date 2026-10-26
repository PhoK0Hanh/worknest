import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Match real content dimensions while keeping animated placeholders out of the accessibility tree.
export function WorkspaceListSkeleton() {
  return <div role="status" aria-label="Đang tải workspace">
    <span className="sr-only">Đang tải workspace...</span>
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => <Card key={index} className="h-full min-w-0 gap-0 py-5 [--card-spacing:--spacing(5)]"><CardContent className="flex h-full flex-col">
        <div className="flex items-start gap-3"><Skeleton className="size-9 shrink-0 rounded-lg" /><div className="min-w-0 flex-1"><div className="min-h-12"><Skeleton className="h-5 w-full" /></div><Skeleton className="mt-1 h-4 w-24" /></div><Skeleton className="h-6 w-14 rounded-full" /></div>
        <div className="mt-auto pt-4"><Skeleton className="h-14 w-full rounded-lg" /></div>
      </CardContent></Card>)}
    </div>
  </div>;
}

// Loading matches the default board tab instead of the former members/sidebar layout.
export function WorkspaceTabsSkeleton() {
  return <div aria-hidden="true" className="flex h-12 items-center gap-6 overflow-hidden border-b px-5 lg:px-8">{[120, 100, 90, 100, 80].map((width, index) => <Skeleton key={index} className="h-4 shrink-0" style={{ width }} />)}</div>;
}

export function TaskColumnsSkeleton() {
  return <div role="status" aria-label="Đang tải task" className="max-w-full overflow-x-auto pb-2">
    <div aria-hidden="true" className="grid min-w-[840px] grid-cols-3 items-start gap-4">
      {[0, 1, 2].map(index => <Card key={index} className="gap-0"><CardContent className="space-y-5">
        <div className="flex items-center justify-between"><Skeleton className="h-5 w-28" /><Skeleton className="size-5" /></div>
        {[0, 1].map(item => <div key={item} className="space-y-3 rounded-lg border p-3"><div className="flex justify-between gap-3"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-5 w-12" /></div><div className="flex justify-between gap-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-16" /></div></div>)}
      </CardContent></Card>)}
    </div>
  </div>;
}

export function WorkspaceDetailSkeleton() {
  return <div className="space-y-6">
    <div aria-hidden="true" className="flex items-center justify-between gap-4"><div className="min-w-0 flex-1 space-y-3"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-2/3 max-w-sm" /></div><Skeleton className="h-8 w-24 shrink-0" /></div>
    <TaskColumnsSkeleton />
  </div>;
}
