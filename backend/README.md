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
- `prisma/schema.prisma`: cấu hình PostgreSQL, chưa có business model.
- `prisma.config.ts`: cấu hình Prisma CLI.

## Neon và auth

Thay DATABASE_URL trong .env bằng URL Neon thật khi triển khai database.
Chưa có model, migration, Prisma Client hoặc truy vấn database.
Auth sẽ dùng Argon2id, session database và cookie HttpOnly; hiện chưa triển khai.
Không commit .env hoặc cung cấp database URL cho frontend.
Chỉ chạy migrate dev trên database phát triển; migrate deploy dành cho migration đã review.

## Frontend và realtime

Axios frontend đã trỏ tới http://localhost:4000/api với withCredentials.
CORS backend chỉ cho phép origin được cấu hình và hỗ trợ cookie.
Socket.IO hiện chỉ phát server:ready sau khi kết nối. Chưa có room workspace hoặc sự kiện task.
Khi thêm auth, API và socket đều phải kiểm tra session và quyền workspace.

## Deploy

Hiện dùng HTTP server Node.js cho local. Cấu hình entrypoint hosting, session cookie production,
proxy, reconnect và chia sẻ sự kiện giữa instance sẽ làm ở giai đoạn deploy.
