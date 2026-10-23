import { z } from "zod";

export type AuthMode = "login" | "signup";

export function createAuthFormSchema(mode: AuthMode) {
  // Apply registration requirements without rejecting existing users' shorter passwords on login.
  return z.object({
    name: z.string().trim(),
    email: z.string().trim().pipe(z.email("Vui lòng nhập địa chỉ email hợp lệ.")),
    password: z.string().min(1, "Vui lòng nhập mật khẩu."),
    confirmPassword: z.string(),
  }).superRefine((data, context) => {
    if (mode !== "signup") return;
    if (data.name.length < 2 || data.name.length > 100) {
      context.addIssue({ code: "custom", path: ["name"], message: "Tên cần từ 2 đến 100 ký tự." });
    }
    if (data.password.length < 8) {
      context.addIssue({ code: "custom", path: ["password"], message: "Mật khẩu cần ít nhất 8 ký tự." });
    }
    if (data.password !== data.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Mật khẩu xác nhận chưa khớp." });
    }
  });
}

export type AuthFormValues = z.infer<ReturnType<typeof createAuthFormSchema>>;
