# Bamso - Hệ thống quản lý hàng đợi

Hệ thống quản lý hàng đợi (lấy số - gọi số) tương tự ngân hàng, bệnh viện, cơ quan hành chính. Hỗ trợ nhiều khu vực, nhiều quầy phục vụ, hiển thị TV và thông báo bằng giọng nói tiếng Việt.

## Tổng quan hệ thống

Hệ thống gồm 4 thành phần chính:

| Thành phần | Mô tả | Công nghệ |
|------------|-------|-----------|
| **Server** | API + WebSocket + Cơ sở dữ liệu + TV Display + Admin Panel | Node.js, Express, Socket.IO, SQLite |
| **Kiosk** | Ứng dụng cho khách hàng lấy số | Tauri v2 (Rust + TypeScript) |
| **Counter** | Ứng dụng cho nhân viên gọi số | Tauri v2 (Rust + TypeScript) |
| **TV Display** | Màn hình hiển thị số thứ tự | Web (HTML/CSS/JS, chạy trên trình duyệt) |

## Sơ đồ thiết bị

```
                    +--------------------------+
                    |   Máy tính chạy Server    |
                    |   (Docker / Node.js)      |
                    +----+------+------+--------+
                         |      |      |
              +----------+      |      +----------+
              |                 |                  |
    +---------v-------+ +------v--------+ +-------v---------+
    | Máy tính A      | | Máy tính B    | | Máy tính Kiosk  |
    | (Gọi số)        | | (Gọi số)      | | (Lấy số)        |
    | Counter App     | | Counter App   | | Kiosk App       |
    +-----------------+ +---------------+ +---+-----+-------+
                                              |     |
                              +---------------+     +--------+
                              |               |              |
                    +---------v---+ +---------v----+ +-------v-------+
                    | Máy in nhiệt| | Hệ thống    | | Tivi hiển thị |
                    | (In phiếu)  | | âm thanh     | | (Số thứ tự)   |
                    +-------------+ +--------------+ +---------------+
```

*Sơ đồ chi tiết có hình ảnh minh hoạ: xem file [docs/system-diagram.svg](docs/system-diagram.svg)*

## Sơ đồ hoạt động

```
  +-------------+     POST /api/tickets     +-------------+     Socket.IO      +-------------+
  |   Khách     | ------------------------> |   Server    | -----------------> |   TV + Loa  |
  |   lấy số    |                           |   xử lý    |                    |   cập nhật  |
  |   (Kiosk)   |     Nhận phiếu A001      |   tạo số    |   ticket:created   |   danh sách |
  +-------------+                           +-------------+                    +-------------+
                                                  |
        Khách chờ...                              |
                                                  |
  +-------------+     POST /call-next       +-----v-------+     Socket.IO      +-------------+
  |  Nhân viên  | ------------------------> |   Server    | -----------------> |  TV overlay |
  |  gọi số     |                           |   phát      |                    |  + Giọng nói|
  |  (Counter)  |     ticket:called         |   thông báo |   "Mời số A001    |  thông báo  |
  +------+------+                           +-------------+    đến Quầy 1"     +-------------+
         |
         |  Hoàn thành / Bỏ qua
         |  POST /complete hoặc /skip
         |
         +----> Gọi số tiếp theo...
```

*Sơ đồ chi tiết: xem file [docs/flow-diagram.svg](docs/flow-diagram.svg)*

## Tính năng chính

### Kiosk (Lấy số)
- Chọn loại dịch vụ (A, B, C, D...)
- In phiếu qua máy in nhiệt
- Hiển thị số người đang chờ
- Tự động phát hiện màn hình phụ để mở TV Display
- Phát âm thanh thông báo khi gọi số (TTS tiếng Việt)
- Tự động khởi động cùng hệ điều hành

### Counter (Gọi số)
- Chế độ đơn dịch vụ: gọi số theo từng loại
- Chế độ đa dịch vụ: quản lý nhiều loại dịch vụ cùng lúc
- Gọi số, gọi lại, hoàn thành, bỏ qua
- Hiển thị danh sách chờ real-time

### TV Display
- Hiển thị số đang phục vụ + quầy tương ứng
- Danh sách số đang chờ
- Overlay thông báo khi gọi số mới (có âm thanh)
- Tự động cập nhật real-time qua Socket.IO

### Admin Panel
- Quản lý khu vực, loại dịch vụ, quầy phục vụ
- Quản lý tài khoản nhân viên
- Cấu hình tên tổ chức, logo
- Báo cáo thống kê theo ngày, loại dịch vụ, quầy, giờ

## Cài đặt

### Yêu cầu

- **Server**: Node.js 20+ hoặc Docker
- **Kiosk / Counter**: Windows 10/11 (tải file cài đặt từ GitHub Releases)
- **TV Display**: Trình duyệt web bất kỳ (Chrome, Edge, Firefox)

### Cách 1: Chạy bằng Docker Compose (khuyên dùng)

Tạo file `docker-compose.yml`:

```yaml
services:
  server:
    image: ghcr.io/vuvantang/queue-system/server:latest
    container_name: bamso-server
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - bamso-data:/app/data
      - bamso-uploads:/app/public/uploads

volumes:
  bamso-data:
  bamso-uploads:
```

```bash
# Khởi chạy
docker compose up -d

# Xem logs
docker compose logs -f

# Dừng
docker compose down
```

Truy cập: `http://<địa-chỉ-ip>:3000`

### Cách 2: Chạy bằng Docker

```bash
# Pull image
docker pull ghcr.io/vuvantang/queue-system/server:latest

# Chạy container
docker run -d \
  --name bamso-server \
  --restart unless-stopped \
  -p 3000:3000 \
  -v bamso-data:/app/data \
  -v bamso-uploads:/app/public/uploads \
  ghcr.io/vuvantang/queue-system/server:latest
```

Truy cập: `http://<địa-chỉ-ip>:3000`

### Cách 3: Chạy trực tiếp

```bash
# Clone repo
git clone https://github.com/vuvantang/queue-system.git
cd queue-system

# Cài dependencies
npm install

# Build server
cd server
npm run build

# Chạy server
npm start
```

Server chạy tại: `http://localhost:3000`

### Cài đặt Kiosk và Counter

1. Tải file `.exe` từ [GitHub Releases](https://github.com/vuvantang/queue-system/releases)
2. Chạy file cài đặt
3. Mở ứng dụng, nhập địa chỉ server (ví dụ: `http://192.168.1.100:3000`)
4. Đăng nhập bằng tài khoản admin hoặc staff

### Mở TV Display

Mở trình duyệt web và truy cập:
```
http://<địa-chỉ-server>:3000/tv
```

Chọn khu vực cần hiển thị. Nhấn F11 để xem toàn màn hình.

## Hướng dẫn sử dụng

### 1. Đăng nhập Admin

- Truy cập: `http://<địa-chỉ-server>:3000/admin`
- Tài khoản mặc định: `admin` / `CAxIL@2024!`
- **Bắt buộc đổi mật khẩu lần đầu đăng nhập**

### 2. Cấu hình ban đầu (Admin)

1. **Cài đặt chung**: Đổi tên tổ chức, upload logo
2. **Tạo khu vực**: Ví dụ: "Khu vực dịch vụ công"
3. **Tạo loại dịch vụ**: Ví dụ: "Đăng ký cư trú" (prefix: A), "Đăng ký xe" (prefix: B)
4. **Tạo quầy phục vụ**: Ví dụ: "Quầy 1", "Quầy 2", "Quầy 3"
5. **Tạo tài khoản nhân viên**: Gán role `staff`

### 3. Sử dụng Kiosk (Khách hàng)

1. Khách hàng nhìn màn hình Kiosk
2. Chọn loại dịch vụ cần làm (ví dụ: "Đăng ký xe")
3. Máy in in phiếu với số thứ tự (ví dụ: B003)
4. Ngồi chờ đến khi được gọi

### 4. Sử dụng Counter (Nhân viên)

1. Đăng nhập vào Counter app
2. Chọn khu vực và quầy phục vụ
3. Nhấn **"Gọi số tiếp"** để gọi khách hàng kế tiếp
4. Phục vụ xong nhấn **"Hoàn thành"**
5. Khách không đến nhấn **"Bỏ qua"**
6. Cần gọi lại nhấn **"Gọi lại"**

### 5. TV Display

- Tự động cập nhật khi có số mới hoặc gọi số
- Hiển thị thông báo lớn khi gọi: "Mời số A001, đến Quầy 1"
- Có thể tùy chỉnh mẫu thông báo trong admin (cài đặt khu vực)

## API Endpoints

### Public (không cần xác thực)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/tickets` | Tạo số mới (Kiosk) |
| GET | `/api/areas` | Danh sách khu vực |
| GET | `/api/areas/:id/queue` | Trạng thái hàng đợi |
| GET | `/api/areas/:id/service-types` | Loại dịch vụ theo khu vực |
| GET | `/api/areas/:id/counters` | Danh sách quầy |
| GET | `/api/settings` | Cài đặt chung |

### Staff (cần JWT token)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/tickets/call-next` | Gọi số tiếp theo |
| POST | `/api/tickets/:id/recall` | Gọi lại |
| POST | `/api/tickets/:id/complete` | Hoàn thành |
| POST | `/api/tickets/:id/skip` | Bỏ qua |

### Admin

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST/PUT/DELETE | `/api/areas` | Quản lý khu vực |
| POST/PUT/DELETE | `/api/service-types` | Quản lý loại dịch vụ |
| POST/PUT/DELETE | `/api/counters` | Quản lý quầy |
| POST/PUT/DELETE | `/api/users` | Quản lý người dùng |
| PUT | `/api/settings` | Cập nhật cài đặt |
| POST | `/api/settings/logo` | Upload logo |
| GET | `/api/reports/stats` | Báo cáo thống kê |
| POST | `/api/tickets/reset` | Reset hàng đợi |

### Socket.IO Events

| Event | Hướng | Mô tả |
|-------|-------|-------|
| `join:area` | Client → Server | Tham gia room khu vực |
| `queue:status` | Server → Client | Trạng thái hàng đợi |
| `ticket:created` | Server → Client | Số mới được tạo |
| `ticket:called` | Server → Client | Số được gọi |
| `ticket:recalled` | Server → Client | Gọi lại |
| `ticket:completed` | Server → Client | Hoàn thành |
| `ticket:skipped` | Server → Client | Bỏ qua |
| `queue:reset` | Server → Client | Reset hàng đợi |

## Tự động cập nhật (Auto-Update)

Kiosk và Counter hỗ trợ tự động cập nhật khi có phiên bản mới:

1. Khi khởi động, app kiểm tra phiên bản mới từ GitHub Releases
2. Nếu có bản mới, hiện dialog xác nhận
3. Người dùng đồng ý → tải và cài đặt tự động → khởi động lại

## CI/CD

Pipeline GitHub Actions tự động chạy khi push tag `v*`:

```bash
# Tạo phiên bản mới
git tag v1.1.0
git push origin v1.1.0
```

Pipeline sẽ:
1. Build Docker image server → push lên `ghcr.io`
2. Build Kiosk + Counter Windows installer (NSIS)
3. Tạo GitHub Release với file cài đặt + update manifest

## Cấu trúc thư mục

```
bamso/
├── server/                     # Backend
│   ├── src/
│   │   ├── index.ts            # Entry point
│   │   ├── db.ts               # Database schema
│   │   ├── socket.ts           # Socket.IO
│   │   ├── routes/             # API endpoints
│   │   └── services/           # Business logic
│   ├── public/                 # Static files (TV, Admin)
│   └── Dockerfile
├── apps/
│   ├── kiosk/                  # Ứng dụng lấy số
│   │   ├── src/                # Frontend TypeScript
│   │   └── src-tauri/          # Rust backend
│   └── counter/                # Ứng dụng gọi số
│       ├── src/
│       └── src-tauri/
├── docs/                       # Sơ đồ hệ thống
├── .github/workflows/          # CI/CD
└── package.json                # Monorepo workspace
```

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Backend | Node.js 20, Express 4, TypeScript 5 |
| Database | SQLite (better-sqlite3), WAL mode |
| Real-time | Socket.IO 4 |
| Desktop Apps | Tauri 2 (Rust + TypeScript + Vite) |
| Frontend | Vanilla TypeScript + HTML/CSS |
| Auth | JWT (24h), bcryptjs |
| Deployment | Docker (Alpine), GitHub Actions |
| Auto-Update | Tauri Plugin Updater + GitHub Releases |

## License

Phần mềm này được phát hành theo giấy phép [GNU General Public License v3.0](LICENSE).

Xem file [LICENSE](LICENSE) để biết chi tiết.
