import type { Metadata } from "next";
import { WorkspaceList } from "@/components/workspaces/workspace-list";

export const metadata: Metadata = { title: "Workspace của tôi | WorkNest" };

export default function WorkspacesPage() {
  // API authorization remains mandatory; the browser gate is only for navigation/UX.
  return <WorkspaceList />;
}
