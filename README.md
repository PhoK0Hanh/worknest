# WorkNest

<!-- Status reflects implemented features; planned modules are listed separately. -->

Ứng dụng quản lý công việc nhóm với workspace, Kanban và cộng tác realtime.
Hiện đã hoàn thành đăng ký/đăng nhập Firebase và đồng bộ hồ sơ người dùng vào Neon.

## Hiện trạng

- Trang `/login`, `/signup`, đăng xuất và khôi phục trạng thái đăng nhập.
- Giao diện emerald, shadcn/ui, React Hook Form và Zod.
- Backend xác minh Firebase ID token, kiểm tra thu hồi và tài khoản Firebase bị vô hiệu hóa.
- Đồng bộ hồ sơ theo `firebase_uid`: không tạo trùng, không tự ghép theo email,
  không kích hoạt lại hồ sơ có `is_active = false`.
- Migration PostgreSQL cho 6 bảng đã có: users, workspaces, memberships,
  invitations, tasks và activity_logs.

Workspace, phân quyền nhóm, lời mời, Kanban và dashboard mới có thiết kế database,
chưa có API/giao diện nghiệp vụ. Socket.IO hiện chỉ có handshake `server:ready`,
chưa có xác thực socket hoặc đồng bộ task. Bình luận được hoãn sang giai đoạn sau.

## Stack và kiến trúc

| Phần | Công nghệ |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide React |
| Form và dữ liệu | React Hook Form, Zod, TanStack Query, Axios |
| Backend | Node.js, Express, TypeScript, Firebase Admin SDK |
| Database | PostgreSQL trên Neon, Prisma, adapter-pg |
| Auth | Firebase Authentication Email/Password |
| Realtime dự kiến | Socket.IO |

```text
Frontend ── email/password ──→ Firebase Auth
         ←──── ID token ─────
Frontend ── Bearer ID token ─→ Express ── Prisma ─→ Neon
```

Firebase không tự gửi user vào Neon. Frontend gọi backend sau khi đăng nhập;
backend chỉ dùng danh tính đã xác minh để tạo hoặc tìm hồ sơ. Mật khẩu tài khoản
không gửi tới Express và không lưu trong Neon.

## Cấu trúc

- [Frontend](frontend/README.md): trang, component và Firebase Web SDK.
- [Backend](backend/README.md): REST API, Firebase Admin và đồng bộ user.
- [Database](backend/prisma/README.md): schema, migration và ràng buộc dữ liệu.
- Mỗi ứng dụng có package.json và lockfile riêng, cùng một Git repository.

## Cài đặt và chạy local

Yêu cầu Node.js 24 LTS, npm, Firebase project bật Email/Password và database Neon.
Từ thư mục gốc repository:

```powershell
npm --prefix frontend ci
npm --prefix backend ci
```

Lần đầu, sao chép frontend/.env.example thành frontend/.env.local và
backend/.env.example thành backend/.env, rồi điền cấu hình theo README từng phần.
Không ghi đè các file môi trường đã cấu hình.

```powershell
npm --prefix backend run db:generate
npm --prefix backend run db:validate
```

Sau khi kiểm tra đúng database đích, áp dụng migration đã review:

```powershell
npm --prefix backend run db:deploy
```

Chạy trong hai terminal:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Frontend mặc định: http://localhost:3000. Backend: http://localhost:4000.
Nếu frontend đổi cổng, cập nhật FRONTEND_URL ở backend và khởi động lại.

## Thử luồng đăng nhập

1. Mở `/signup`, tạo tài khoản; tài khoản xuất hiện trong Firebase Authentication.
2. Frontend gửi token tới `/api/auth/sync`; hồ sơ xuất hiện trong bảng users trên Neon.
3. Đăng xuất/đăng nhập lại; cùng UID dùng lại hồ sơ đã có.
4. Khi backend không sẵn sàng, giao diện báo chưa hoàn tất đăng nhập và có nút thử lại.

## Kiểm tra

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix backend test
```

Backend test mặc định không cần kết nối Neon; bài tích hợp database được bật riêng
theo hướng dẫn trong backend/README.md. Luồng đăng ký và đồng bộ user thật đã được thử thủ công.

## Cấu hình và triển khai

File môi trường thật, dependency, output build, cache và INFO.md được Git bỏ qua.
Cache npm được cấu hình nằm trong `.npm-cache` ở gốc WorkNest.
Không đưa DATABASE_URL hoặc Firebase Admin private key vào frontend/Git.

Phương án triển khai dự kiến: frontend Vercel, backend Render, database Neon.
Chưa deploy hoặc cấu hình vận hành production. ReUI miễn phí có thể bổ sung sau;
hiện chưa tích hợp. Bước phát triển tiếp theo là tạo workspace cùng membership Owner
và activity log trong một transaction.
