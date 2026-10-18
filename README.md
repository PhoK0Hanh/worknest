# WorkNest

<!-- Shared repository for the frontend and backend applications. -->

Ứng dụng quản lý công việc nhóm với workspace, Kanban và cộng tác realtime.
Hiện đã khởi tạo bộ khung; chưa triển khai auth và nghiệp vụ workspace/task.

## Cấu trúc

- [Frontend](frontend/README.md): Next.js, TypeScript, Tailwind CSS, Axios và TanStack Query.
- [Backend](backend/README.md): Express, TypeScript, Prisma, Neon PostgreSQL và Socket.IO.

## Chạy local

Yêu cầu Node.js 24 LTS và npm. Cài dependency từ thư mục gốc:

```powershell
npm --prefix frontend ci
npm --prefix backend ci
```

Chạy mỗi ứng dụng trong một terminal riêng:

```powershell
npm --prefix frontend run dev
```

```powershell
npm --prefix backend run dev
```

Frontend: http://localhost:3000. API health: http://localhost:4000/api/health.
Xem README từng ứng dụng để cấu hình biến môi trường. Không commit secret hoặc URL Neon thật.
