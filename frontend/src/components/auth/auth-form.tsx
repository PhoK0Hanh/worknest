"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { authErrorMessage } from "@/lib/auth/error-message";
import {
  createAuthFormSchema,
  type AuthFormValues,
  type AuthMode,
} from "@/lib/auth/form-schema";
import { profileErrorMessage, useWorkNestProfile } from "@/lib/auth/profile";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const signup = mode === "signup";
  const [session, setSession] = useState<{
    ready: boolean;
    user: User | null;
    failed: boolean;
  }>({ ready: false, user: null, failed: false });
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(createAuthFormSchema(mode)),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  // Wait until Firebase registration/profile updates finish before synchronizing with Neon.
  const profile = useWorkNestProfile(
    session.user,
    !isSubmitting && !signingOut,
  );

  useEffect(() => {
    // Enter the application only after both Firebase and the backend profile are ready.
    if (session.user && !session.failed && !isSubmitting && !signingOut &&
      profile.isSuccess && !profile.isFetching && profile.data.firebaseUid === session.user.uid &&
      getFirebaseAuth().currentUser?.uid === session.user.uid) {
      router.replace("/workspaces");
    }
  }, [session.user, session.failed, isSubmitting, signingOut, profile.isSuccess, profile.isFetching, profile.data, router]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    // Firebase initialization and persistence recovery happen only after browser mount.
    void Promise.resolve()
      .then(() => {
        if (disposed) return;
        unsubscribe = onAuthStateChanged(
          getFirebaseAuth(),
          (user) => {
            if (!disposed) setSession({ ready: true, user, failed: false });
          },
          () => {
            if (!disposed)
              setSession({ ready: true, user: null, failed: true });
          },
        );
      })
      .catch(() => {
        if (!disposed) setSession({ ready: true, user: null, failed: true });
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  async function submit(values: AuthFormValues) {
    setNotice("");
    try {
      const auth = getFirebaseAuth();
      if (signup) {
        const { user } = await createUserWithEmailAndPassword(
          auth,
          values.email,
          values.password,
        );
        try {
          await updateProfile(user, { displayName: values.name });
        } catch {
          // Account creation already succeeded; never suggest retrying registration for profile errors.
          setNotice("Tài khoản đã được tạo, nhưng tên hiển thị chưa được lưu.");
        }
        setSession({ ready: true, user, failed: false });
      } else {
        const { user } = await signInWithEmailAndPassword(
          auth,
          values.email,
          values.password,
        );
        setSession({ ready: true, user, failed: false });
      }
      // Clear password fields after a successful operation rather than retaining them after logout.
      reset();
    } catch (error) {
      setError("root", { message: authErrorMessage(error) });
    }
  }

  async function logout() {
    setSigningOut(true);
    setNotice("");
    try {
      await signOut(getFirebaseAuth());
      queryClient.removeQueries({ queryKey: ["worknest-profile"] });
      reset();
    } catch (error) {
      setNotice(
        error instanceof FirebaseError
          ? authErrorMessage(error)
          : "Chưa thể đăng xuất. Vui lòng thử lại.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  if (!session.ready) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
      >
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        Đang kiểm tra đăng nhập...
      </div>
    );
  }

  if (session.user) {
    const syncing = isSubmitting || profile.isPending || profile.isFetching;
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="space-y-5 pt-6">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            {syncing ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : profile.isError ? (
              <LogOut aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
          </span>
          <div aria-live="polite">
            <h2 className="text-2xl font-semibold tracking-tight">
              {syncing
                ? "Đang hoàn tất đăng nhập"
                : profile.isError
                  ? "Chưa hoàn tất đăng nhập"
                  : "Đăng nhập thành công"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {syncing
                ? "Đang chuẩn bị hồ sơ WorkNest của bạn..."
                : profile.isError
                  ? profileErrorMessage(profile.error)
                  : `Chào ${profile.data?.name || "bạn"}, hồ sơ WorkNest của bạn đã sẵn sàng.`}
            </p>
          </div>
          <p className="break-all rounded-lg bg-muted px-4 py-3 text-sm">
            {session.user.email}
          </p>
          {notice && (
            <p role="status" className="text-sm text-amber-800">
              {notice}
            </p>
          )}
          {profile.isError && !syncing && (
            <Button
              className="w-full"
              disabled={signingOut}
              onClick={() => void profile.refetch()}
            >
              Thử lại
            </Button>
          )}
          {profile.isSuccess && !syncing && (
            <Button asChild className="w-full">
              <Link href="/workspaces">
                Đến workspace của tôi
                <ArrowRight />
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full"
            disabled={signingOut || isSubmitting}
            onClick={() => void logout()}
          >
            {signingOut ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <LogOut />
            )}
            Đăng xuất
          </Button>
          <Link
            href="/"
            className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Về trang chủ
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
        {signup ? "Bắt đầu cùng WorkNest" : "Chào mừng trở lại"}
      </p>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {signup ? "Tạo tài khoản của bạn" : "Đăng nhập WorkNest"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {signup
          ? "Tạo tài khoản để sẵn sàng cho không gian làm việc của nhóm."
          : "Tiếp tục công việc, kết nối với nhóm của bạn."}
      </p>
      <form
        noValidate
        onSubmit={handleSubmit(submit)}
        className="mt-8 space-y-5"
      >
        <fieldset
          disabled={isSubmitting || session.failed}
          className="space-y-5 disabled:opacity-60"
        >
          {signup && (
            <div className="space-y-2">
              <Label htmlFor="name">Tên hiển thị</Label>
              <Input
                id="name"
                autoComplete="name"
                maxLength={100}
                placeholder="Nguyễn An"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
                {...register("name")}
              />
              {errors.name && (
                <p
                  id="name-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.name.message}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="ban@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p
                id="email-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={
                  signup ? "Ít nhất 8 ký tự" : "Nhập mật khẩu của bạn"
                }
                className="pr-11"
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                {...register("password")}
              />
              <button
                type="button"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p
                id="password-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.password.message}
              </p>
            )}
          </div>
          {signup && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={
                  errors.confirmPassword ? "confirm-error" : undefined
                }
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p
                  id="confirm-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          )}
        </fieldset>
        {session.failed && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            Chưa thể khởi tạo đăng nhập. Vui lòng tải lại trang hoặc thử lại
            sau.
          </p>
        )}
        {errors.root && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {errors.root.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || session.failed}
          className="h-11 w-full text-sm"
        >
          {isSubmitting ? <LoaderCircle className="animate-spin" /> : null}
          {isSubmitting
            ? "Đang xử lý..."
            : signup
              ? "Tạo tài khoản"
              : "Đăng nhập"}
          {!isSubmitting && <ArrowRight className="ml-1 size-4" />}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        {signup ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
        <Link
          href={signup ? "/login" : "/signup"}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {signup ? "Đăng nhập" : "Tạo tài khoản"}
        </Link>
      </p>
    </div>
  );
}
