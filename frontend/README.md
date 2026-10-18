# WorkNest Frontend

<!-- Frontend scaffold only; no backend or business features yet. -->

Next.js App Router, React, TypeScript, Tailwind CSS, Axios và TanStack Query.
Yêu cầu Node.js 24 LTS và npm.

## Chạy local

Từ thư mục `Web/worknest/frontend`:

```powershell
npm ci
npm run dev
```

Mở http://localhost:3000. Nếu cổng 3000 đã được dùng, xem cổng thực tế trong terminal.

## Cấu trúc

- `src/app/`: trang, layout và CSS toàn cục.
- `src/components/`: component giao diện và QueryClient provider.
- `src/lib/api.ts`: Axios client cho REST API Express.
- `.env.example`: URL backend mẫu, không chứa secret.

Khi cần kết nối backend: copy `.env.example` sang `.env.local` và cập nhật URL.
Trang đầu hiện là trang giới thiệu tĩnh, chưa gọi API và không yêu cầu backend hoạt động.
Auth, workspace, Kanban, realtime và dashboard chưa triển khai.

## Kiểm tra

```powershell
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Deploy frontend trên Vercel: chọn Root Directory `frontend` nếu repository gốc là `worknest`.
