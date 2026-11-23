# Chạy EduCert trên máy cá nhân

EduCert chạy với ba tiến trình local gồm Hardhat ở cổng `8545`, backend ở cổng `3001` và frontend ở cổng `5173`. Chuẩn bị Git và Node.js 22 từ phiên bản `22.13.0`. MetaMask cần cho các thao tác dùng ví. Trang xác minh, thống kê và lịch sử có thể mở ở chế độ khách.

## Cài đặt từ bản clone mới

Lấy bản clone của EduCert. Khi review phần Frontend của Trưởng, dùng nhánh `feature/FE-01-frontend-foundation` sau khi nhánh có trên GitHub.

```powershell
git clone https://github.com/lucthuan1601/EduCert.git
cd EduCert
git switch feature/FE-01-frontend-foundation
```

Mở thư mục gốc `EduCert` chứa `contracts/`, `backend/` và `frontend/` trong VS Code. Chạy các lệnh sau trong PowerShell.

```powershell
npm.cmd ci
npm.cmd --prefix backend ci --ignore-scripts
npm.cmd --prefix backend run setup:env
npm.cmd --prefix backend run migrate
npm.cmd --prefix frontend ci
```

Trên Windows, `--ignore-scripts` cho phép dùng bản SQLite dựng sẵn trong gói đã khóa. Trên macOS/Linux, dùng `npm` và `npx` thay cho `npm.cmd` và `npx.cmd`, rồi cài backend bằng `npm --prefix backend ci`. `setup:env` tạo `backend/.env` với secret ngẫu nhiên và giữ cấu hình nếu tệp đã tồn tại.

## Khởi động ba terminal

Chạy các lệnh trong cả ba terminal từ thư mục gốc repo.

### Terminal 1 · Blockchain

```powershell
npx.cmd hardhat node
```

Giữ terminal này chạy. Khi Hardhat báo địa chỉ `http://127.0.0.1:8545`, chuyển sang terminal 2.

### Terminal 2 · Deploy hợp đồng và chạy backend

```powershell
npm.cmd run deploy:local
npm.cmd run setup-demo
npm.cmd run dev:backend
```

`setup-demo` cấp quyền Issuer và in địa chỉ ba ví thử nghiệm Admin, Issuer, Student. Nếu địa chỉ vừa deploy khác với `contractAddress` trong `config/contract-config.json`, hãy chạy hai lệnh dưới đây trước `setup-demo`.

```powershell
$env:CONTRACT_ADDRESS = '<địa chỉ vừa deploy>'
npm.cmd run export-config
```

### Terminal 3 · Frontend

```powershell
npm.cmd --prefix frontend run dev
```

Mở [localhost:5173](http://localhost:5173/). Trang [kiểm tra backend](http://localhost:5173/api/v1/health) trả `status: "ok"`. Trang [kiểm tra blockchain](http://localhost:5173/api/v1/stats) trả số chứng chỉ đã cấp, đang hiệu lực và đã thu hồi. Giữ ba terminal chạy trong lúc demo.

## Thử theo từng vai trò

Thêm mạng Hardhat Local vào MetaMask với RPC `http://127.0.0.1:8545`, Chain ID `31337` và ký hiệu `ETH`. Chọn tài khoản Hardhat có địa chỉ khớp với vai trò mà `setup-demo` in ra. Dùng khóa thử nghiệm tương ứng từ terminal 1 cho mạng local.

1. **Admin** mở `/admin` và kiểm tra ví Issuer đã được cấp quyền. Dùng **Cấp quyền** để cấp cho một ví thử nghiệm khác.
2. **Issuer** mở `/issue`, nhập địa chỉ ví Student và thông tin mẫu. Tạo bản nháp, kiểm tra thông báo SHA-256 rồi ký phát hành. Nếu backend cần đối soát lại, bấm **Đối soát giao dịch** với giao dịch đã gửi.
3. **Student** đổi sang ví người nhận, ký đăng nhập tại `/student` rồi tải PDF đã phát hành.
4. **Người xác minh** mở liên kết QR hoặc nhập mã ở `/verify`. Chọn PDF vừa tải để đối chiếu, hoặc dùng **In hoặc lưu biên bản PDF** để ghi lại kết quả.
5. **Issuer hoặc Admin** thu hồi tại `/revoke`, sau đó tra cứu lại mã để thấy trạng thái mới. `/dashboard` và `/history` hiển thị tổng số và giao dịch đã ghi trên blockchain.

## Khi cổng đã được sử dụng

- **Cổng `5173`** — Nếu một terminal khác đang chạy EduCert, dùng ứng dụng đang mở hoặc dừng Vite từ terminal đó bằng `Ctrl+C` trước khi chạy lại.
- **Cổng `3001`** — Trước khi chạy backend ở terminal 2, đặt `$env:PORT = '3002'`. Trước khi chạy frontend ở terminal 3, đặt `$env:EDUCERT_BACKEND_URL = 'http://127.0.0.1:3002'`. Giữ địa chỉ giao diện `http://localhost:5173` và kiểm tra lại qua `/api/v1/health`.
- **Cần dùng cổng frontend khác** — Trước khi chạy backend, đặt `$env:PUBLIC_APP_URL = 'http://localhost:5174'`. Chạy frontend bằng `npm.cmd --prefix frontend run dev -- --port 5174` rồi mở `http://localhost:5174`. Backend cần khởi động lại để nhận origin mới. Tạo PDF demo mới để QR trỏ đúng địa chỉ.
- **Đã khởi động lại Hardhat** — Deploy và chạy `setup-demo` lại. Để bắt đầu một lượt demo với dữ liệu trống, cấu hình `DATABASE_PATH` và `STORAGE_DIR` mới trong `backend/.env` trước khi khởi động backend.

## Cấu hình tích hợp và kiểm tra mã nguồn

- Vite chuyển tiếp `/api/v1` tới backend. `/rpc` chỉ chuyển tiếp các lệnh đọc blockchain dùng khi xác minh. MetaMask ký và gửi giao dịch qua RPC của ví. ABI, địa chỉ hợp đồng và Chain ID đến từ API `/config`.
- Có thể sao chép `frontend/.env.example` thành `frontend/.env.local` khi cần cấu hình khác. `EDUCERT_BACKEND_URL` và `EDUCERT_RPC_URL` là đích chuyển tiếp của Vite. `VITE_API_URL` và `VITE_RPC_URL` dành cho trình duyệt. `VITE_WALLET_RPC_URL` là địa chỉ RPC khi thêm mạng cục bộ trong MetaMask.
- Để thử QR trên điện thoại trong LAN, cấu hình `PUBLIC_APP_URL` của backend thành địa chỉ điện thoại truy cập được, rồi chạy Vite với `--host 0.0.0.0`. Quét bằng camera và băm PDF trên điện thoại cần HTTPS.
- Khi phục vụ tệp tĩnh, cấu hình máy chủ trả `index.html` cho các route SPA, cùng địa chỉ `/api/v1` tới backend và `/rpc` tới RPC chỉ đọc, hoặc khai báo các URL tương ứng lúc build.

```powershell
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run verify
```

Xem thêm [hướng dẫn backend](../backend/README.md) và [hợp đồng API](../docs/INTERFACE_CONTRACT.md).
