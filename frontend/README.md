# WorkNest Frontend

<!-- Firebase login is functional; workspace features are not implemented yet. -->

Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui và Lucide React.
Form dùng React Hook Form + Zod; dữ liệu API dùng Axios + TanStack Query.
ReUI chưa tích hợp.

## Cấu hình

Yêu cầu Node.js 24 LTS và npm. Từ thư mục frontend:

```powershell
npm ci
```

Lần đầu, sao chép `.env.example` sang `.env.local` và điền:

| Biến | Nguồn |
|---|---|
| NEXT_PUBLIC_API_URL | URL Express, local mặc định http://localhost:4000/api |
| NEXT_PUBLIC_FIREBASE_API_KEY | apiKey trong Firebase Web config |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | authDomain |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | projectId |
| NEXT_PUBLIC_FIREBASE_APP_ID | appId |

Firebase project phải bật Email/Password. Firebase Admin ở backend phải thuộc cùng
project. Không đặt service-account JSON, private key hoặc Neon URL trong frontend.
Khởi động lại Next.js sau khi sửa biến môi trường.

## Chạy và kiểm tra

```powershell
npm run dev
npm run lint
npm run build
```

`npm start` chạy production sau khi build. Cổng local mặc định 3000;
nếu dùng cổng khác, cập nhật FRONTEND_URL ở backend.

## Trang và hành vi hiện tại

- `/`: giới thiệu và liên kết đăng ký/đăng nhập.
- `/signup`: tên, email, mật khẩu tối thiểu 8 ký tự, xác nhận mật khẩu.
- `/login`: email/password, hiện/ẩn mật khẩu và validation.
- Sau khi Firebase xác thực, frontend gọi `POST /api/auth/sync` bằng Bearer ID token.
- Chỉ hiển thị đăng nhập hoàn tất khi backend trả hồ sơ WorkNest.
- Hỗ trợ khôi phục phiên Firebase, trạng thái chờ/lỗi, thử lại và đăng xuất.
- Cache hồ sơ phân theo UID, được xóa khi đăng xuất.
- Nếu tạo tài khoản thành công nhưng cập nhật tên Firebase thất bại, không yêu cầu đăng ký lại.

Frontend chưa có workspace, Kanban, dashboard, chức năng sửa/xóa tài khoản,
quên mật khẩu, xác minh email qua giao diện hoặc Socket.IO client.
Backend cần chạy và cấu hình Neon/Firebase Admin để hoàn tất đồng bộ hồ sơ.

## Cấu trúc

- `src/app/`: trang, layout và CSS/theme.
- `src/components/auth/`: form và bố cục đăng nhập/đăng ký.
- `src/components/ui/`: component shadcn/ui có thể tùy chỉnh.
- `src/lib/firebase/client.ts`: khởi tạo Firebase Auth trong trình duyệt.
- `src/lib/auth/`: validation, thông báo lỗi và query đồng bộ hồ sơ.
- `src/lib/api.ts`: Axios client; sync profile tự gắn token cho request tương ứng,
  chưa có interceptor token cho mọi API.

Theme hiện tại sáng, emerald; dùng font hệ thống, không cần tải font ngoài khi build.
