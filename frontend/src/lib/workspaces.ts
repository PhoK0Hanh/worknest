import axios from "axios";
import type { User } from "firebase/auth";
import { z } from "zod";
import { api } from "@/lib/api";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên workspace.").max(100, "Tên tối đa 100 ký tự."),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự.").max(128, "Mật khẩu tối đa 128 ký tự."),
});
export type CreateWorkspaceValues = z.infer<typeof createWorkspaceSchema>;
export const joinWorkspaceSchema = z.object({
  joinCode: z.string().trim().toUpperCase().regex(/^[0-9A-F]{12}$/, "Mã nhóm gồm 12 ký tự, hãy sao chép mã từ người trong nhóm."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu nhóm.").max(128, "Mật khẩu tối đa 128 ký tự."),
});
export type JoinWorkspaceValues = z.infer<typeof joinWorkspaceSchema>;
export type Workspace = {
  id: string;
  name: string;
  joinCode: string;
  role: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

async function authorization(user: User, signal?: AbortSignal) {
  const token = await user.getIdToken();
  signal?.throwIfAborted();
  return { Authorization: `Bearer ${token}` };
}

export async function getWorkspaces(user: User, signal: AbortSignal) {
  const headers = await authorization(user, signal);
  return (await api.get<{ workspaces: Workspace[] }>("/workspaces", { signal, headers })).data.workspaces;
}

export async function postWorkspace(user: User, values: CreateWorkspaceValues) {
  // No automatic retries: a timeout does not prove that the transaction failed.
  const headers = await authorization(user);
  return (await api.post<{ workspace: Workspace }>("/workspaces", values, { headers })).data.workspace;
}

export type JoinWorkspaceResult = { workspace: Workspace; alreadyMember: boolean };

export type WorkspaceMember = { id: string; name: string; email: string; role: string; joinedAt: string };
export type WorkspaceDetail = Workspace & { members: WorkspaceMember[] };

export async function getWorkspace(user: User, id: string, signal: AbortSignal) {
  const headers = await authorization(user, signal);
  return (await api.get<{ workspace: WorkspaceDetail }>(`/workspaces/${encodeURIComponent(id)}`, { headers, signal })).data.workspace;
}

export async function postLeaveWorkspace(user: User, id: string) {
  const headers = await authorization(user);
  return (await api.post<{ workspaceId: string; alreadyLeft: boolean }>(`/workspaces/${encodeURIComponent(id)}/leave`, undefined, { headers })).data;
}

export async function postJoinWorkspace(user: User, values: JoinWorkspaceValues) {
  const headers = await authorization(user);
  return (await api.post<JoinWorkspaceResult>("/workspaces/join", values, { headers })).data;
}

export function workspaceErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    switch (error.response?.data?.code) {
      case "ACCOUNT_UNAVAILABLE": return "Tài khoản chưa sẵn sàng hoặc đã ngừng hoạt động. Hãy đăng nhập lại.";
      case "WORKSPACE_INVALID": return "Kiểm tra tên nhóm và mật khẩu từ 8–128 ký tự.";
      case "WORKSPACE_RATE_LIMIT": return "Bạn đã tạo quá nhiều nhóm. Vui lòng thử lại sau.";
      case "JOIN_INVALID": return "Vui lòng kiểm tra mã nhóm gồm 12 ký tự và mật khẩu.";
      case "JOIN_CREDENTIALS_INVALID": return "Mã nhóm hoặc mật khẩu chưa đúng.";
      case "MEMBERSHIP_BANNED": return "Bạn đã bị loại khỏi nhóm. Chỉ có thể quay lại khi Owner/Admin mời.";
      case "MEMBERSHIP_CHANGED": return "Trạng thái thành viên vừa thay đổi. Hãy tải lại danh sách trước khi thử lại.";
      case "JOIN_RATE_LIMIT": return "Bạn đã thử tham gia quá nhiều lần. Vui lòng chờ rồi thử lại.";
      case "WORKSPACE_ID_INVALID": return "Đường dẫn workspace không hợp lệ.";
      case "WORKSPACE_NOT_FOUND": return "Workspace không tồn tại hoặc bạn không còn quyền truy cập.";
      case "OWNER_TRANSFER_REQUIRED": return "Owner cần chuyển quyền sở hữu trước khi rời nhóm.";
    }
    if (error.response?.status === 401) return "Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.";
  }
  return "Chưa xác nhận được kết quả. Hãy tải lại dữ liệu trước khi thử lại.";
}
