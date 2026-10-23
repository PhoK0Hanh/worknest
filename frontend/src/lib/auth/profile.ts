"use client";

import axios from "axios";
import type { User } from "firebase/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type WorkNestProfile = {
  id: string;
  firebaseUid: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export function useWorkNestProfile(user: User | null, enabled: boolean) {
  return useQuery({
    // Separate caches per Firebase account; old responses cannot replace another user's profile.
    queryKey: ["worknest-profile", user?.uid ?? null],
    enabled: !!user && enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: (attempt, error) => {
      if (axios.isAxiosError(error) && [400, 401, 403, 409].includes(error.response?.status ?? 0)) return false;
      return attempt < 1;
    },
    queryFn: async ({ signal }) => {
      if (!user) throw new Error("Chưa đăng nhập.");
      // Force refresh after registration so the verified token contains the latest display name.
      const token = await user.getIdToken(true);
      signal.throwIfAborted();
      const { data } = await api.post<{ user: WorkNestProfile }>("/auth/sync", undefined, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      return data.user;
    },
  });
}

export function profileErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    switch (error.response?.data?.code) {
      case "ACCOUNT_INACTIVE": return "Tài khoản WorkNest đã ngừng hoạt động. Không thể tiếp tục đăng nhập.";
      case "EMAIL_CONFLICT": return "Email đang liên kết với hồ sơ khác. Không thể tự động ghép tài khoản.";
      case "PROFILE_INVALID": return "Tài khoản cần có email hợp lệ để tạo hồ sơ WorkNest.";
    }
    if (error.response?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Hãy đăng xuất rồi đăng nhập lại.";
  }
  return "Chưa tải được hồ sơ. Hãy kiểm tra kết nối và thử lại.";
}
