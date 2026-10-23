import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkNest — Quản lý công việc nhóm",
  description: "Workspace, Kanban và cộng tác realtime cho nhóm của bạn.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // System fonts avoid remote font downloads in local and production builds.
  return <html lang="vi" className="font-sans"><body><Providers>{children}</Providers></body></html>;
}
