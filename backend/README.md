# Backend EduCert — Nguyễn Văn Trường

Express/TypeScript, SQLite và kho PDF riêng tư cho BE-01 → BE-06. [Đặc tả API Frontend](../docs/INTERFACE_CONTRACT.md), [kế hoạch](../docs/BACKEND_PLAN.md), [bàn giao](../docs/BACKEND_HANDOFF_NGUYEN_VAN_TRUONG.md).

## Cài đặt

Từ thư mục gốc repo, Node.js >=22.13.0:

```powershell
npm ci
npm --prefix backend ci
npm --prefix backend run setup:env
npm --prefix backend run migrate
```

setup:env sinh secret ngẫu nhiên trong backend/.env, không ghi đè file sẵn có và không in secret. Không commit .env, database hoặc kho PDF.

Terminal 1, thư mục gốc:

```powershell
npx hardhat node
```

Terminal 2:

```powershell
npm run deploy:local
npm run export-config
npm run setup-demo
```

Nếu deploy ra địa chỉ khác mặc định, đặt `$env:CONTRACT_ADDRESS = '<địa chỉ thực tế>'` trước export-config. setup-demo chỉ dùng signer Hardhat local để cấp role Issuer và in địa chỉ demo, không ghi khóa vào Backend. Node reset thì cần deploy và kiểm cấu hình lại.

Terminal 3:

```powershell
npm run dev:backend
```

API: http://localhost:3001/api/v1/health và http://localhost:3001/api/v1/config. Ví Issuer phải có role trước khi tạo draft/phát hành.

## Cấu hình

backend/.env.example liệt kê biến. PUBLIC_APP_URL là origin FE, dùng cho CORS, thông điệp đăng nhập và QR; đặt đúng trước khi tạo PDF. Dùng cùng hostname cho FE/BE để cookie SameSite hoạt động.

LAN: HOST=0.0.0.0, PUBLIC_APP_URL là origin FE truy cập được từ điện thoại. Production yêu cầu HTTPS, COOKIE_SECURE=true; demo HTTP dùng false. SESSION_SECRET ít nhất 32 ký tự và không dùng placeholder. Không dùng wildcard CORS.

DATABASE_PATH/STORAGE_DIR/CONTRACT_CONFIG_PATH được giải từ thư mục backend. Bản build cần giữ thư mục assets chứa font và giấy phép.

## Kiểm tra và khôi phục

```powershell
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run verify
npm --prefix backend run reconcile:pending
```

test tự compile contract và mở Hardhat node ở port trống, dùng ví ngẫu nhiên trong bộ nhớ; không cần node demo, MetaMask hoặc .env. Không in khóa ví ra log. verify chạy typecheck/build/20 contract tests/42 Backend tests và lưu báo cáo trong backend/reports.

reconcile:pending dùng .env để đối soát tối đa 100 bản chờ/lần, không gửi giao dịch. FE cũng có thể gọi lại finalize cùng ID/txHash. Lỗi RPC giữ dữ liệu chờ.

42 API tests không thay cho 12 UI/E2E tests của nhóm. PDF adapter cơ bản tại src/services/pdf.ts cho phép Tùng thay mẫu; biên bản xác minh và E2E vẫn cần phối hợp. Upload thêm trang phụ lục QR; không hỗ trợ PDF mã hóa/đã ký số.

## Cấu trúc

```text
src/auth.ts                 nonce, session, CSRF và role
src/database.ts             schema SQLite và migration
src/services/chain.ts        RPC, receipt và logs
src/services/storage.ts      byte bất biến, kiểm hash
src/services/pdf.ts          PdfAdapter tiếng Việt/QR
src/services/finalize.ts     retry và đối soát trạng thái
src/routes/                 API draft, tải và tra cứu
test/backend.test.ts         kiểm thử API + contract thật
```
