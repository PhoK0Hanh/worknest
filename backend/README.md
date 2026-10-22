# WorkNest Backend

<!-- Initial scaffold; auth, persistence and business APIs are not implemented. -->

Express + TypeScript, Socket.IO và cấu hình Prisma cho Neon PostgreSQL.
Yêu cầu Node.js 24 LTS và npm.

## Chạy local

Từ thư mục `Web/worknest/backend`:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

API: http://localhost:4000/api/health. Trả JSON service/status.
Health check không xác nhận kết nối database. Chưa cần Neon để chạy scaffold.
Đổi FRONTEND_URL nếu frontend chạy ở cổng khác 3000.

## Kiểm tra và build

```powershell
npm run typecheck
npm run build
npm start
npm run db:validate
```

## Cấu trúc

- `src/config.ts`: đọc và kiểm tra cấu hình.
- `src/app.ts`: middleware, REST API, 404 và xử lý lỗi.
- `src/server.ts`: HTTP server, Socket.IO và shutdown.
- `prisma/schema.prisma`: 6 model nghiệp vụ; xem `prisma/README.md` để tạo bảng bằng migration.
- `prisma.config.ts`: cấu hình Prisma CLI.

## Neon và auth

Thay DATABASE_URL trong .env bằng URL Neon thật khi triển khai database.
Đã áp dụng migration khởi tạo lên Neon phát triển ngày 23/10/2026; chưa triển khai truy vấn nghiệp vụ.
<!-- Auth decision: Firebase replaces the original custom password/session proposal. -->
Auth sẽ dùng Firebase Authentication; frontend gửi Firebase ID token bằng Authorization: Bearer.
Backend xác minh bằng Firebase Admin SDK và liên kết User trong Neon qua firebaseUid duy nhất.
Neon lưu hồ sơ và quyền workspace, không lưu mật khẩu. Firebase SDK chưa cài; auth chưa triển khai.
Argon2 dùng hash mật khẩu tham gia workspace, không dùng cho mật khẩu tài khoản Firebase.
Không commit .env hoặc cung cấp database URL cho frontend.
Chỉ chạy migrate dev trên database phát triển; migrate deploy dành cho migration đã review.

## Frontend và realtime

Axios frontend đã trỏ tới http://localhost:4000/api với withCredentials.
CORS backend chỉ cho phép origin được cấu hình và hỗ trợ cookie.
Socket.IO hiện chỉ phát server:ready sau khi kết nối. Chưa có room workspace hoặc sự kiện task.
Khi thêm auth, API và socket đều phải xác minh Firebase ID token và kiểm tra quyền workspace.

## Deploy

Hiện dùng HTTP server Node.js cho local. Cấu hình entrypoint hosting, Firebase production,
proxy, reconnect và chia sẻ sự kiện giữa instance sẽ làm ở giai đoạn deploy.
