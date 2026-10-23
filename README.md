# WorkNest

<!-- Document implemented behavior; production and manual checks remain explicit. -->

Ứng dụng quản lý công việc nhóm với workspace, Kanban và cộng tác realtime.
Dự án cá nhân phục vụ học tập và portfolio thực tập.

## Tính năng

- Firebase Email/Password: đăng ký, đăng nhập, khôi phục phiên, đăng xuất và email đặt lại mật khẩu.
- Hồ sơ Neon: đồng bộ theo Firebase UID, sửa tên, xóa mềm tài khoản; dọn danh tính Firebase có cơ chế thử lại.
- Workspace: tạo nhóm, tham gia bằng mã và mật khẩu đã hash, đổi tên/mật khẩu, xóa có xác nhận.
- Phân quyền Owner/Admin/Member, chuyển Owner, loại thành viên và chặn tham gia lại bằng mã khi bị banned.
- Lời mời dành cho tài khoản có sẵn, hạn 3 ngày, chấp nhận/từ chối và ngăn lời mời còn hiệu lực trùng nhau.
- Kanban ReUI: tạo/sửa task, người phụ trách, ưu tiên, deadline, kéo thả trạng thái và thứ tự với dynamic overlay.
- Sheet chi tiết task; phát hiện chỉnh sửa từ dữ liệu cũ và xung đột thứ tự bảng.
- Realtime Socket.IO xác thực Firebase và kiểm tra quyền người nhận; reconnect tải lại dữ liệu.
- Dashboard: số task, tiến độ, task quá hạn. Activity Logs hiển thị 100 hoạt động mới nhất.
- Khung ứng dụng toàn màn hình, sidebar, sticky header, skeleton và giao diện responsive.

Bình luận, sprint, task con, tệp đính kèm và cột tùy chỉnh chưa nằm trong bản đầu.

## Stack và kiến trúc

| Phần | Công nghệ |
|---|---|
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS |
| UI | shadcn/ui, ReUI, Lucide, dnd-kit |
| Form và dữ liệu | React Hook Form, Zod, TanStack Query, Axios |
| Backend | Node.js, Express, TypeScript, Firebase Admin, Argon2, express-rate-limit |
| Database | PostgreSQL trên Neon, Prisma và adapter-pg |
| Auth / realtime | Firebase Authentication / Socket.IO |

```text
Frontend → Firebase Auth → ID token
Frontend → Express REST API (Bearer token) → Prisma → Neon
Frontend ↔ Socket.IO (token + quyền workspace)
DB commit → sự kiện thay đổi → TanStack Query tải lại dữ liệu
```

Firebase không tự gửi hồ sơ vào Neon. Backend xác minh token trước khi xử lý
nghiệp vụ; mật khẩu tài khoản chỉ gửi Firebase. Mật khẩu tham gia nhóm được hash
bằng Argon2. Quyền được kiểm tra ở backend, không chỉ dựa vào giao diện.

## Cài đặt local

Yêu cầu Node.js theo `backend/package.json` (>=24), npm, Firebase bật Email/Password
và PostgreSQL/Neon. Mỗi ứng dụng có package và lockfile riêng.

```powershell
npm --prefix frontend ci
npm --prefix backend ci
npm --prefix backend run db:generate
```

Sao chép `frontend/.env.example` thành `frontend/.env.local` và `backend/.env.example`
thành `backend/.env`, điền cấu hình thật; không ghi đè file đã cấu hình.

- FE: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` và Firebase Web config.
- BE: `PORT`, `FRONTEND_URL`, `DATABASE_URL` và Firebase Admin credentials.
- `FRONTEND_URL` phải khớp origin FE. Firebase Admin và URL database chỉ ở backend.

Sau khi kiểm tra đúng database đích:

```powershell
npm --prefix backend run db:validate
npm --prefix backend run db:deploy
```

Chạy hai terminal:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

FE mặc định `http://localhost:3000`, BE `http://localhost:4000`.
Đăng nhập thành công vào `/workspaces`; mở nhóm để xem tab công việc/thành viên/tổng quan/hoạt động.

## Kiểm tra

Cài dependencies của cả FE và BE trước; test realtime sử dụng Socket.IO client của FE.

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix backend test
```

Bật kiểm thử Neon từ thư mục `backend`:

```powershell
$env:RUN_DB_TESTS='1'
node --env-file=.env --test tests/*.test.mjs
```

Test database dùng bảng tạm trong transaction. Test thường bỏ qua các bài cần Neon.
Có kiểm thử auth, phân quyền quản lý, task, rollback, xung đột và nhiều kết nối socket.
Email reset, xóa tài khoản Firebase thật và toàn bộ thao tác UI vẫn cần smoke test
với tài khoản thử; kết quả build/test không thay thế kiểm thử trình duyệt.

## Cấu trúc và triển khai

- `frontend/src/app`: routes Next.js.
- `frontend/src/components`: component shadcn/ReUI và giao diện nghiệp vụ.
- `backend/src/routes`, `services`, `lib`: API, transaction và tích hợp dịch vụ.
- `backend/prisma`: schema và migration cho 6 bảng.
- `backend/tests`: kiểm thử Node.js và tích hợp.

Frontend có thể deploy riêng; backend cần tiến trình Node chạy lâu dài, hỗ trợ
Socket.IO. Đặt biến môi trường production trước khi build FE, cấu hình CORS và
Firebase authorized domains, rồi chạy migration bằng `db:deploy`.
Hiện chưa deploy. Người sở hữu dự án tự thực hiện deploy.

Bản hiện tại dùng một backend instance; nhiều instance cần shared Socket.IO adapter.
Xóa tài khoản giữ hồ sơ lịch sử ở Neon; dọn danh tính Firebase chạy sau commit và
thử lại mỗi phút khi backend hoạt động. Email có thể cần chờ bước dọn này trước khi đăng ký lại.

Không commit `.env` thật, Firebase Admin key, node_modules, output build, cache hoặc
`INFO.md`. Cache npm nằm trong `.npm-cache` của dự án. Một số README trong thư mục
con có thể mô tả mốc khởi tạo; README gốc này phản ánh phạm vi tính năng hiện tại.
