# WorkNest

<!-- README giới thiệu chức năng hiện có và hướng dẫn chạy local; ghi chú nội bộ nằm trong INFO.md. -->

## Giới thiệu

**WorkNest** là ứng dụng quản lý công việc nhóm. Người dùng tạo workspace, mời thành viên,
giao việc và theo dõi tiến độ trên bảng Kanban. Trang **Công việc của tôi** tập hợp task
được giao hoặc tự tạo từ nhiều workspace, giúp theo dõi công việc cá nhân ở một nơi.

Đây là dự án cá nhân phục vụ học tập và portfolio thực tập, xây dựng cả frontend và
backend, tích hợp xác thực, phân quyền, database và cập nhật realtime.

## Tính năng chính

| Nhóm chức năng | Nội dung |
|---|---|
| Tài khoản | Đăng ký/đăng nhập bằng email và mật khẩu, duy trì phiên đăng nhập, đăng xuất, đặt lại mật khẩu qua email, sửa tên và xóa tài khoản. |
| Workspace | Tạo nhóm, tham gia bằng mã và mật khẩu, xem các nhóm đang tham gia, đổi tên/mật khẩu, rời hoặc xóa nhóm theo quyền. |
| Thành viên và lời mời | Phân quyền Owner/Admin/Member, chuyển Owner, quản lý thành viên; mời người đã có tài khoản, chấp nhận hoặc từ chối lời mời có hạn 3 ngày. |
| Bảng Kanban | Tạo, xem, sửa, xóa task; gán người thực hiện, ưu tiên và hạn hoàn thành; kéo thả giữa Cần làm, Đang thực hiện, Đã hoàn thành và sắp xếp trong cột. |
| Công việc của tôi | Hai tab Được giao cho tôi và Do tôi tạo; lọc theo workspace, trạng thái, ưu tiên; phân trang và ưu tiên hiển thị task quá hạn. |
| Realtime | Khi thành viên thay đổi task, bảng nhóm và danh sách công việc cá nhân được cập nhật mà không cần tải lại trang. |
| Tổng quan và hoạt động | Thống kê tiến độ, công việc quá hạn/sắp đến hạn, hoạt động gần đây và lịch sử thay đổi trong nhóm. |
| Giao diện | Sidebar chung, header cố định, skeleton khi tải, bố cục responsive và animation nhẹ cho tab, nút sao chép, phản hồi lưu task. |

Một số quy tắc chính:

- Quyền truy cập được kiểm tra ở backend. Chỉ người tạo task hoặc Owner/Admin được xóa task.
- Owner phải chuyển quyền trước khi rời nhóm. Xóa nhóm, chuyển Owner và đổi mật khẩu tham gia
  yêu cầu xác nhận lại bằng mật khẩu tài khoản Owner.
- Khi rời nhóm hoặc bị loại, task của nhóm đó không còn xuất hiện trong **Công việc của tôi**,
  nhưng vẫn được giữ trong workspace.
- Người bị loại không thể dùng mã và mật khẩu để tự tham gia lại; cần chấp nhận lời mời mới.
- Task có thể chưa có người phụ trách hoặc deadline. Mặc định **Công việc của tôi** chỉ hiện
  task chưa hoàn thành; người dùng có thể đổi bộ lọc để xem task đã hoàn thành.

### Giao diện ứng dụng

**Workspace của tôi** — danh sách nhóm, vai trò, số thành viên và mã tham gia.

![Danh sách workspace của người dùng](docs/images/workspaces.png)

**Công việc của tôi** — theo dõi task được giao và task tự tạo từ các nhóm đang tham gia.

![Công việc của tôi với hai tab và bộ lọc](docs/images/my-tasks.png)

**Bảng công việc** — quản lý task theo ba trạng thái trên Kanban.

![Bảng Kanban với người thực hiện, độ ưu tiên và hạn hoàn thành](docs/images/kanban.png)

## Công nghệ và kiến trúc

| Thành phần | Công nghệ và vai trò |
|---|---|
| Frontend | Next.js App Router, React, TypeScript — xây dựng giao diện và các trang ứng dụng. |
| Giao diện | Tailwind CSS, shadcn/ui, ReUI, Lucide — bố cục, component và icon; dnd-kit hỗ trợ kéo thả Kanban. |
| Form và dữ liệu | React Hook Form, Zod — quản lý/kiểm tra form; Axios gọi API; TanStack Query quản lý dữ liệu và cache phía frontend. |
| Backend | Node.js, Express, TypeScript — cung cấp REST API, xử lý nghiệp vụ và phân quyền. |
| Database | PostgreSQL trên Neon — lưu người dùng, workspace, membership, lời mời, task và lịch sử hoạt động. |
| Truy cập database | Prisma và adapter-pg — kết nối PostgreSQL, truy vấn và quản lý migration. |
| Xác thực | Firebase Authentication ở frontend; Firebase Admin xác minh ID token ở backend. |
| Realtime | Socket.IO — thông báo thay đổi để frontend tải lại dữ liệu liên quan. |
| Bảo vệ API | Argon2 hash mật khẩu tham gia nhóm; Helmet, CORS và express-rate-limit hỗ trợ cấu hình HTTP và giới hạn request. |

Frontend và backend nằm trong cùng repository nhưng có `package.json` và tiến trình chạy riêng:

```text
worknest/
├── frontend/            # Next.js: giao diện, form và gọi API
├── backend/
│   ├── src/             # Express: API, nghiệp vụ, auth và realtime
│   ├── prisma/          # Schema và migration PostgreSQL
│   └── tests/           # Kiểm thử backend
└── docs/images/         # Ảnh giao diện trong README
```

Luồng dữ liệu chính:

```text
Frontend → Firebase Authentication → ID token
Frontend → Express API (Bearer token) → Prisma → PostgreSQL/Neon
Database cập nhật thành công → Socket.IO → Frontend tải lại dữ liệu
```

Firebase xử lý xác thực; dữ liệu nghiệp vụ nằm trong PostgreSQL. Frontend gửi token tới
backend để đồng bộ hồ sơ và gọi API. Mật khẩu tài khoản chỉ gửi cho Firebase;
mật khẩu tham gia workspace được backend hash bằng Argon2 trước khi lưu.

## Cài đặt và chạy local

### Yêu cầu môi trường

- Node.js **24 trở lên**, npm và Git.
- Một project Firebase và một database PostgreSQL trên Neon.
- Kết nối Internet để frontend/backend local truy cập Firebase và Neon.

Các lệnh bên dưới chạy từ thư mục gốc `worknest`, trừ khi có hướng dẫn khác.

### Bước 1: Tải mã nguồn và cài đặt thư viện

```powershell
git clone https://github.com/PhoK0Hanh/worknest.git
cd worknest
npm --prefix frontend ci
npm --prefix backend ci
```

Nếu đã có code, mở terminal tại thư mục `worknest` và chạy hai lệnh `npm ci` ở trên.

### Bước 2: Thiết lập Firebase

1. Tạo project trong [Firebase Console](https://console.firebase.google.com/).
2. Thêm một **Web app** vào project. Trong phần cấu hình ứng dụng, lấy `apiKey`,
   `authDomain`, `projectId` và `appId` để cấu hình frontend.
3. Trong **Authentication → Sign-in method**, bật **Email/Password**.
   Xem [hướng dẫn Firebase Email/Password](https://firebase.google.com/docs/auth/web/password-auth).
4. Trong **Authentication → Settings → Authorized domains**, thêm `localhost` nếu chưa có.
5. Trong **Project settings → Service accounts**, chọn **Generate new private key**
   để tải file JSON dành cho backend. Lấy các trường `project_id`, `client_email`, `private_key`
   theo [hướng dẫn Firebase Admin](https://firebase.google.com/docs/admin/setup).

Frontend và backend phải sử dụng **cùng một project Firebase**.

### Bước 3: Tạo database trên Neon

Tạo project trên [Neon](https://console.neon.tech/), dùng một database trống dành cho dự án.
Chọn **Connect**, chọn branch/database/role rồi sao chép connection string PostgreSQL
theo [hướng dẫn kết nối Neon](https://neon.com/docs/get-started/connect-neon).
Giữ nguyên các tham số kết nối do Neon cung cấp và dùng chuỗi này cho `DATABASE_URL` ở bước sau.

Chưa cần tạo bảng bằng tay; migration có sẵn trong repository sẽ tạo các bảng ở bước 5.

### Bước 4: Cấu hình biến môi trường

Sao chép hai file mẫu sau nếu chưa có file cấu hình local:

| File mẫu | File cần tạo |
|---|---|
| `frontend/.env.example` | `frontend/.env.local` |
| `backend/.env.example` | `backend/.env` |

Trong **`frontend/.env.local`**, thay các giá trị `YOUR_*` bằng cấu hình Web app Firebase:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID

# Tùy chọn; nếu bỏ dòng này, dùng origin của NEXT_PUBLIC_API_URL.
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

Trong **`backend/.env`**, điền connection string Neon và thông tin từ file JSON Firebase Admin:

```dotenv
PORT=4000
FRONTEND_URL=http://localhost:3000
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"

FIREBASE_ADMIN_PROJECT_ID=YOUR_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL=YOUR_SERVICE_ACCOUNT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

Với private key, sao chép đầy đủ giá trị `private_key` từ JSON, giữ các ký tự `\n`
và đặt trong dấu ngoặc kép. Không dùng chuỗi minh họa `YOUR_PRIVATE_KEY`.
`FRONTEND_URL` phải khớp địa chỉ frontend đang chạy.

Không đưa file `.env` thật hoặc JSON Firebase Admin lên Git; không đặt private key hay
URL database trong biến `NEXT_PUBLIC_*` vì các biến này được đưa tới trình duyệt.

### Bước 5: Khởi tạo Prisma Client và bảng dữ liệu

Sau khi điền đúng `DATABASE_URL` trỏ đến database dành cho dự án, chạy:

```powershell
npm --prefix backend run db:generate
npm --prefix backend run db:validate
npm --prefix backend run db:deploy
```

- `db:generate`: tạo Prisma Client để backend sử dụng.
- `db:validate`: kiểm tra schema Prisma.
- `db:deploy`: áp dụng các migration có sẵn vào database, **không đưa ứng dụng lên hosting**.

Database sẽ có sáu bảng nghiệp vụ: `users`, `workspaces`, `memberships`, `invitations`,
`tasks`, `activity_logs`. Bảng `_prisma_migrations` lưu lịch sử migration.
Không cần dữ liệu mẫu để bắt đầu: đăng ký tài khoản và tạo workspace từ giao diện.

### Bước 6: Khởi chạy ứng dụng

Mở **hai terminal** tại thư mục gốc `worknest`.

Terminal 1 — backend:

```powershell
npm --prefix backend run dev
```

Terminal 2 — frontend:

```powershell
npm --prefix frontend run dev
```

Mở [http://localhost:3000](http://localhost:3000) để sử dụng ứng dụng.
Backend chạy tại `http://localhost:4000`; kiểm tra tiến trình API bằng
[http://localhost:4000/api/health](http://localhost:4000/api/health).
Endpoint health chỉ xác nhận API đang chạy, chưa xác nhận kết nối Firebase hoặc database.

Đăng ký tài khoản, tạo workspace rồi thêm task. Để thử realtime, đăng nhập tài khoản thứ hai
trên trình duyệt khác, tham gia cùng workspace và quan sát khi tài khoản đầu tiên cập nhật task.
Sau khi thay đổi file môi trường, khởi động lại tiến trình tương ứng.

### Kiểm tra mã nguồn và chạy kiểm thử

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix backend test
```

Lệnh test backend tự build trước khi chạy; các bài cần database được bỏ qua mặc định.
Cần cài thư viện của cả frontend và backend vì test realtime sử dụng Socket.IO client của frontend.
