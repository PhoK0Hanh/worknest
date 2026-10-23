# WorkNest Backend

<!-- Firebase identity and Neon profile sync are implemented; workspace APIs are pending. -->

Express + TypeScript, Firebase Admin SDK, Prisma + adapter-pg và Socket.IO.
Yêu cầu Node.js 24 LTS và npm.

## Cấu hình và chạy

Từ thư mục backend:

```powershell
npm ci
```

Lần đầu, sao chép `.env.example` thành `.env`, không ghi đè file đã cấu hình.

| Biến | Ý nghĩa |
|---|---|
| PORT | Cổng HTTP, mặc định 4000 |
| FRONTEND_URL | Origin frontend được phép CORS, mặc định http://localhost:3000 |
| DATABASE_URL | Chuỗi kết nối database Neon |
| FIREBASE_ADMIN_PROJECT_ID | project_id của Firebase service account |
| FIREBASE_ADMIN_CLIENT_EMAIL | client_email |
| FIREBASE_ADMIN_PRIVATE_KEY | private_key; đặt trong nháy kép, giữ các ký tự `\n` |

Project ID phải khớp Firebase Web ở frontend. Không commit .env, private key hoặc
service-account JSON. Backend không cần mật khẩu tài khoản người dùng.

```powershell
npm run db:generate
npm run db:validate
```

Sau khi xác nhận database đích, áp dụng migration đã review:

```powershell
npm run db:deploy
npm run dev
```

API local: http://localhost:4000. Health chỉ kiểm tra server, không kiểm tra Neon.
Firebase Admin và Prisma được khởi tạo khi cần, không bắt buộc kết nối để trả health.

## REST API hiện có

| Method | Endpoint | Hành vi |
|---|---|---|
| GET | `/api/health` | Trạng thái server |
| GET | `/api/auth/identity` | Xác minh ID token và trả danh tính Firebase; chưa kiểm tra hồ sơ Neon |
| POST | `/api/auth/sync` | Tạo/tìm hồ sơ Neon theo danh tính Firebase đã xác minh |

Hai endpoint auth yêu cầu `Authorization: Bearer <Firebase ID token>` và trả no-store.
Không nhận UID/email/vai trò do request body khai báo làm nguồn danh tính.

## Quy tắc đồng bộ hồ sơ

- Xác minh token bằng Firebase Admin, gồm kiểm tra thu hồi và tài khoản Firebase bị khóa/xóa.
- UID và email hợp lệ là bắt buộc; email được trim và chuyển chữ thường.
- Tạo hồ sơ với tên từ token; nếu thiếu thì dùng phần trước @ của email.
- Cùng UID dùng lại hồ sơ, giữ tên trong Neon; chỉ cập nhật email khi cần.
- Atomic upsert và unique constraint ngăn tạo trùng khi gọi đồng thời.
- Hồ sơ is_active=false bị từ chối; không tự khôi phục hoặc ghép theo email.
- UID khác nhưng email trùng trả 409; không tự kế thừa hồ sơ/quyền cũ.
- API hiện chưa bắt buộc email_verified=true; chưa triển khai luồng xác minh email.

| HTTP | Ý nghĩa |
|---|---|
| 400 | Hồ sơ Firebase thiếu UID/email hợp lệ |
| 401 | Token thiếu, lỗi, hết hạn, bị thu hồi hoặc tài khoản Firebase bị vô hiệu hóa |
| 403 | Hồ sơ WorkNest đã ngừng hoạt động |
| 409 | Email xung đột với hồ sơ khác |
| 503 | Chưa xác minh được token hoặc chưa truy cập được hồ sơ/database |

## Kiểm tra

```powershell
npm test
npm run typecheck
npm run build
```

`npm test` build rồi chạy test Node.js. Test auth dùng verifier giả lập;
test tích hợp Neon mặc định bị bỏ qua.
Để chạy bài tích hợp, dùng database phát triển đã cấu hình:

```powershell
$env:RUN_DB_TESTS='1'
node --env-file=.env --test tests/user-sync.test.mjs
Remove-Item Env:RUN_DB_TESTS
```

Bài tích hợp sử dụng transaction và bảng TEMP, không thay đổi public.users thật.
Kiểm tra idempotency, giữ tên, lỗi trùng email, không khôi phục hồ sơ đã xóa và
tạo hồ sơ mới bằng UID mới sau khi email cũ được giải phóng.

Production local: chạy `npm start` sau khi build.

## Cấu trúc và phần chưa triển khai

- `src/app.ts`: middleware và các REST route.
- `src/middleware/require-firebase-auth.ts`: xác minh Bearer token.
- `src/lib/firebase-admin.ts`: Firebase Admin credentials và verifier.
- `src/lib/prisma.ts`: Prisma client/pool dùng chung, khởi tạo khi cần.
- `src/services/sync-user.ts`: đồng bộ hồ sơ bằng truy vấn tham số hóa.
- `src/routes/auth.ts`: phản hồi sync và mã lỗi an toàn.
- `src/server.ts`: HTTP, Socket.IO và dọn kết nối khi shutdown.
- `prisma/`: 6 model, migration và hướng dẫn database.

Workspace, quyền Owner/Admin/Member, lời mời, task và activity logs chưa có API.
Socket.IO chỉ phát server:ready, chưa có kiểm tra token/room workspace/realtime nghiệp vụ.
Argon2 đã cài để dùng cho mật khẩu tham gia workspace sau này; rate limit chưa cấu hình.
Chưa deploy production; cần kiểm tra CORS, domain, proxy, reconnect và cấu hình hosting
trước khi triển khai backend dự kiến lên Render.
