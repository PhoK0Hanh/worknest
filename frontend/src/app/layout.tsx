import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkNest — Quản lý công việc nhóm",
  description: "Workspace, Kanban và cộng tác realtime cho nhóm của bạn.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body><Providers>{children}</Providers></body></html>;
}
