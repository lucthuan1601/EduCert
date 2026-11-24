# Kết quả kiểm thử và số liệu thực nghiệm EduCert (QA-05)

Người tổng hợp: Hoàng Tùng (2351170630). Ngày chạy: 24/11/2026. Mọi số liệu dưới đây lấy từ log/JSON trong [`docs/evidence/`](evidence/); không có giá trị ước lượng. Số đo mô tả **một máy cá nhân với Hardhat node local (automine)**, không phản ánh độ trễ, thời gian xác nhận hay phí của mạng công khai.

## 1. Môi trường đo

| Thông số | Giá trị |
| --- | --- |
| Hệ điều hành | Windows 11 (NT 10.0.26200) x64 |
| CPU / RAM | Intel Core i5-12450H, 12 luồng / 32 GiB |
| Node.js | v24.22.0 (dự án yêu cầu ≥ 22.13.0) |
| Trình duyệt đo băm | Google Chrome 157.0.8103.80 qua Playwright 1.57.0 (headless) |
| Solidity / optimizer | 0.8.20, optimizer bật, runs = 200 |
| Hardhat | 2.29.2 (theo lockfile, xem BE-D01) |
| Mạng | Hardhat node, chainId 31337, automine |
| Mã nguồn | `68044ee` (nhánh `feature/QA-05-measurements-docs`, đo trước khi commit tài liệu) |

## 2. Bảng 17 — Tổng hợp kiểm thử (kết quả thực tế)

| Nhóm kiểm thử | Mục tiêu | Đã chạy | Kết quả | Log |
| --- | --- | --- | --- | --- |
| Contract unit tests (CT-01 → CT-20) | 20 | 20 | **20 PASS** (631 ms) | [ct-unit-tests.txt](evidence/final/ct-unit-tests.txt) |
| Backend/API bắt buộc (BE-01 → BE-10) | 10 | 10 | **10 PASS** | [be-api-tests.txt](evidence/final/be-api-tests.txt) |
| UI/End-to-end (E2E-01 → E2E-12) | 12 | 12 (+1 ca bổ sung E2E-01b) | **13 PASS** | [e2e-ui-tests.txt](evidence/final/e2e-ui-tests.txt), [biên bản](E2E_TEST_REPORT.md) |
| **Tổng mục tiêu Bảng 17** | **42** | **42** | **42 PASS, 0 FAIL** | |
| Backend/API bổ sung (bảo mật, retry, RPC…) | — | 32 | 32 PASS | be-api-tests.txt |
| Biên bản xác minh (QA-02) | — | 3 | 3 PASS | be-api-tests.txt |
| Mẫu PDF + QR (QA-01) | — | 6 | 6 PASS | be-api-tests.txt |
| Typecheck, build Backend, client mẫu, lint + build Frontend | — | 5 | PASS | [verify-summary.json](evidence/final/verify-summary.json), [frontend-lint-build.txt](evidence/final/frontend-lint-build.txt) |

Lệnh tái hiện: `npm --prefix backend run verify` (contract + backend, 20 + 51 ca), `npm --prefix e2e test` (13 ca), `npm --prefix frontend run lint` và `run build`.

## 3. Bảng 18 — Số liệu thực nghiệm

| Chỉ số | Cách đo | Kết quả thực đo |
| --- | --- | --- |
| Gas cấp chứng chỉ | `receipt.gasUsed` của `issueCertificate` | **207.508 gas** (`npm run measure-gas`); 207.496 gas trong lần đo E2E |
| Gas thu hồi | `receipt.gasUsed` của `revokeCertificate` | **58.751 gas** |
| Gas cấp quyền | `receipt.gasUsed` của `grantRole(ISSUER_ROLE)` | **51.537 gas** |
| Thời gian băm PDF (trình duyệt) | `performance.now()` quanh `crypto.subtle.digest`, 50 lần/kích thước | 5 MiB: trung vị **4,0 ms**; gồm cả đọc Blob: **6,7 ms** (chi tiết mục 3.2) |
| Thời gian đọc chain | `getCertificate` qua `eth_call` | Trình duyệt → `/rpc` → node: trung vị **3,3 ms**; Node → RPC: **15,7 ms**; API public: **52,8 ms** (mục 3.3) |
| Kết quả kiểm thử | test runner, log, commit | **42/42 PASS** theo Bảng 17 (+ 42 ca bổ sung PASS: 41 Backend/PDF, 1 E2E) |

Gas `issueCertificate` lệch 12 đơn vị giữa hai lần đo vì `certificateId`/`fileHash` ngẫu nhiên có số byte 0 khác nhau trong calldata (byte 0 tốn 4 gas, byte khác 0 tốn 16 gas). Phí giao dịch không được quy đổi: `effectiveGasPrice` của Hardhat local (~0,75–0,97 gwei) không đại diện cho mạng thật.

### 3.1. Gas từ receipt

| Giao dịch | `measure-gas` | Lần đo QA-05 |
| --- | --- | --- |
| `grantRole(ISSUER_ROLE, wallet)` | 51.537 | 51.537 |
| `issueCertificate(id, hash, student)` | 207.508 | 207.496 |
| `revokeCertificate(id, reasonCode)` | 58.751 | 58.751 |

Thời gian từ lúc gửi tới khi có receipt của `issueCertificate` là 64 ms do Hardhat đào khối ngay lập tức; không dùng con số này để suy ra thời gian xác nhận trên Sepolia hay mainnet.

### 3.2. Thời gian băm SHA-256 trong trình duyệt (ms, 50 lần)

| Kích thước | Chỉ digest: trung bình | trung vị | p95 | độ lệch chuẩn | Blob → arrayBuffer → digest: trung bình | trung vị | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 KiB | 0,08 | 0,1 | 0,2 | 0,07 | 0,39 | 0,3 | 0,9 |
| 512 KiB | 0,31 | 0,3 | 0,4 | 0,08 | 1,18 | 1,0 | 2,0 |
| 1 MiB | 0,89 | 0,9 | 1,1 | 0,15 | 2,17 | 2,1 | 2,8 |
| 2 MiB | 1,64 | 1,6 | 1,8 | 0,12 | 3,93 | 3,8 | 4,3 |
| 5 MiB | 4,02 | 4,0 | 4,3 | 0,15 | 7,10 | 6,7 | 7,7 |

Cột thứ hai tương ứng hàm `pdfHash()` của trang `/verify` (đọc tệp rồi băm). Chrome làm tròn `performance.now()` tới 0,1 ms khi trang không bật cross-origin isolation, nên các giá trị dưới 0,5 ms chỉ có ý nghĩa tương đối. Một chứng chỉ thật do mẫu QA-01 tạo ra có kích thước khoảng 24 KiB, thấp hơn nhiều so với mức 5 MiB.

### 3.3. Thời gian đọc chain (ms)

| Đường đọc | Số lần | Trung bình | Trung vị | p95 | Độ lệch chuẩn |
| --- | --- | --- | --- | --- | --- |
| Trình duyệt → Vite `/rpc` → Hardhat (`eth_call` thô) | 100 | 3,38 | 3,3 | 3,9 | 0,34 |
| Node (ethers `JsonRpcProvider`) → Hardhat (`eth_call`) | 200 | 14,81 | 15,7 | 20,9 | 4,42 |
| Trình duyệt → `GET /api/v1/certificates/:id/public` | 100 | 54,11 | 52,8 | 70,4 | 10,65 |

API public chậm hơn vì Backend thực hiện ba lệnh RPC tuần tự cho mỗi yêu cầu (`eth_chainId`, `eth_getCode`, `eth_call`) để không trả nhầm `NOT_FOUND` khi sai mạng. Đường Node → RPC chậm hơn trình duyệt chủ yếu do ethers mở kết nối HTTP mới cho mỗi lệnh; đây là điểm có thể tối ưu bằng keep-alive nếu cần (xem [QA_REVIEW.md](QA_REVIEW.md)).

Dữ liệu gốc: [`measurements.json`](evidence/measurements.json), [`measure-gas.txt`](evidence/final/measure-gas.txt). Lệnh tái hiện: `npm --prefix e2e run measure` và `npm run measure-gas`.
