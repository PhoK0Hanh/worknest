import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceDetailView } from "@/components/workspaces/workspace-detail";

export const metadata: Metadata = { title: "Chi tiết workspace | WorkNest" };

export default function WorkspacePage() {
  // The client reads route parameters inside Suspense; all data remains API-authorized.
  return <Suspense fallback={<p role="status" className="p-8 text-muted-foreground">Đang mở workspace...</p>}><WorkspaceDetailView /></Suspense>;
}
