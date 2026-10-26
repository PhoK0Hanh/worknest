import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SaveFeedback({ visible, message = "Đã lưu thay đổi.", className }: { visible: boolean; message?: string; className?: string }) {
  // Reserve one line so feedback fades without shifting nearby controls; announce only visible text.
  return <p role="status" aria-atomic="true" className={cn("min-h-4 text-xs text-primary", className)}>
    <span className="sr-only">{visible ? message : ""}</span>
    <span aria-hidden="true" className={cn("inline-flex items-center gap-1.5 transition-[opacity,transform] duration-150 ease-out motion-reduce:transform-none motion-reduce:transition-none", visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")}><CheckCircle2 className="size-3.5 shrink-0" />{message}</span>
  </p>;
}
