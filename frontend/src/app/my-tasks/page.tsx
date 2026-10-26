import type { Metadata } from "next";
import { MyTasks } from "@/components/tasks/my-tasks";

export const metadata: Metadata = { title: "Công việc của tôi | WorkNest" };

export default function MyTasksPage() {
  // The backend enforces identity and membership; this page only provides the browser UI.
  return <MyTasks />;
}
