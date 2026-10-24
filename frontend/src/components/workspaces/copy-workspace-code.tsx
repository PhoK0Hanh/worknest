"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyWorkspaceCode({ code, label }: { code: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => {
    sequence.current++;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const request = ++sequence.current;
    if (timer.current) clearTimeout(timer.current);
    setState("copying");
    try {
      await navigator.clipboard.writeText(code);
      if (request !== sequence.current) return;
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), 2000);
    } catch {
      if (request === sequence.current) setState("error");
    }
  }

  return <div>
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {label && <p className="text-[11px] text-muted-foreground">{label}</p>}
          <code className="break-all text-sm tracking-wider">{code}</code>
        </div>
        <Button size="sm" variant="ghost" disabled={state === "copying"} aria-label={state === "copied" ? "Đã sao chép mã nhóm" : "Sao chép mã nhóm"} className="ml-auto shrink-0 transition-[background-color,transform] duration-150 hover:bg-muted active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100" onClick={() => void copy()}>
          {/* The hidden label takes no width, so hover stays tight around the copy icon. */}
          <span className={cn("inline-flex items-center transition-[gap] duration-200 motion-reduce:transition-none", state === "copied" ? "gap-1.5" : "gap-0")} aria-hidden="true">
            <span className="grid size-4 shrink-0">
              <Copy className={cn("col-start-1 row-start-1 size-4 transition-[opacity,transform] duration-200 motion-reduce:transition-none", state === "copied" ? "scale-75 opacity-0" : "scale-100 opacity-100")} />
              <Check className={cn("col-start-1 row-start-1 size-4 text-emerald-600 transition-[opacity,transform] duration-200 motion-reduce:transition-none", state === "copied" ? "scale-100 opacity-100" : "scale-75 opacity-0")} />
            </span>
            <span className={cn("overflow-hidden whitespace-nowrap text-xs text-emerald-700 transition-[max-width,opacity] duration-200 motion-reduce:transition-none", state === "copied" ? "max-w-24 opacity-100" : "max-w-0 opacity-0")}>Đã sao chép</span>
          </span>
        </Button>
      </div>
      <p role="status" aria-atomic="true" className="sr-only">{state === "copied" ? "Đã sao chép" : ""}</p>
    </div>
    {state === "error" && <p role="alert" className="mt-1 text-xs leading-4 text-destructive">Không thể sao chép. Hãy chọn mã và sao chép thủ công.</p>}
  </div>;
}
