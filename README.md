# EduCert — Hướng dẫn triển khai dự án cho các thành viên Nhóm 11

> **Đề tài:** Hợp đồng lưu trữ chứng chỉ học tập (*EduCert – Kiến trúc kết hợp On-chain và Off-chain*)  
> **Môn học:** Chuỗi khối và công nghệ sổ cái phân tán — Trường Đại học Thủy Lợi (Khoa CNTT)  
> **Giảng viên phụ trách:** Trương Xuân Nam  
> **Tài liệu căn cứ:** `Bao_cao_EduCert_Nhom11_Hoan_chinh.docx` (Phiên bản thiết kế v1)

## Chạy EduCert trên máy cá nhân

Xem [hướng dẫn chạy từ bản clone mới](frontend/README.md) để cài gói, khởi động Hardhat, deploy hợp đồng và mở giao diện tại `http://localhost:5173`. Hướng dẫn có kịch bản demo theo từng vai trò và cách xử lý khi cổng local đã được sử dụng.

## Backend đã triển khai — bắt đầu tích hợp

Phần BE-01 → BE-06 của Nguyễn Văn Trường đã có mã nguồn, 16 endpoint (11 nghiệp vụ + 5 hỗ trợ), SQLite, xác thực ví, kho PDF riêng tư và đối soát blockchain. Hướng dẫn đầy đủ: [backend/README.md](backend/README.md).

- [Kế hoạch theo giai đoạn](docs/BACKEND_PLAN.md)
- [API và luồng tích hợp Frontend](docs/INTERFACE_CONTRACT.md)
- [Client TypeScript mẫu](docs/examples/frontend-api.ts)
- [Tổng hợp công việc và bàn giao](docs/BACKEND_HANDOFF_NGUYEN_VAN_TRUONG.md)
- [Bằng chứng kiểm thử](docs/TEST_RESULTS.md)

```powershell
npm.cmd ci
npm.cmd --prefix backend ci --ignore-scripts
npm.cmd --prefix backend run setup:env
npm.cmd --prefix backend run migrate
```

Chạy `npx.cmd hardhat node` ở terminal riêng. Terminal khác chạy `npm.cmd run deploy:local`, `npm.cmd run setup-demo`, rồi `npm.cmd run dev:backend`. API mặc định ở `http://localhost:3001/api/v1`. Nếu địa chỉ deploy khác mặc định, đặt `CONTRACT_ADDRESS` thành địa chỉ thực tế rồi chạy `npm.cmd run export-config` trước `setup-demo`.

Chạy `npm --prefix backend run verify` để kiểm tra typecheck, client mẫu, build, 20 ca smart contract và 51 ca backend (42 BE + 6 mẫu PDF/QR + 3 biên bản). Lệnh kiểm tra frontend nằm trong [frontend/README.md](frontend/README.md).

## PDF, biên bản, E2E và hồ sơ nghiệm thu (QA-01 → QA-06)

Phần của Hoàng Tùng đã triển khai và chạy thật. Kết quả tổng hợp: **42/42 ca theo Bảng 17 PASS** (20 contract + 10 Backend/API + 12 E2E), kèm 42 ca bổ sung.

- [Kết quả kiểm thử và số liệu thực nghiệm (Bảng 17, 18)](docs/EXPERIMENT_RESULTS.md)
- [Biên bản kiểm thử E2E-01 → E2E-12](docs/E2E_TEST_REPORT.md) và [ảnh, PDF minh chứng](docs/evidence/e2e/)
- [Sơ đồ use case, kiến trúc, vòng đời, tuần tự](docs/DIAGRAMS.md)
- [Nội dung cập nhật Chương 4–5 của báo cáo](docs/REPORT_CH4_5_UPDATE.md)
- [Rà soát PR và đối chiếu Phụ lục D](docs/QA_REVIEW.md)
- [Hướng dẫn E2E, dữ liệu demo, đo đạc](e2e/README.md)

```powershell
npm.cmd --prefix e2e ci
$env:PW_CHANNEL = 'chrome'      # hoặc: npx.cmd --prefix e2e playwright install chromium
npm.cmd run test:e2e            # 13 ca E2E trên stack riêng (cổng 8546/3101/5175)
npm.cmd run measure:e2e         # đo thời gian băm PDF và đọc chain
npm.cmd run demo-data           # khi stack demo đang chạy: tạo PDF hợp lệ + PDF đã sửa
```

---

## 1. Phân công thành viên & Trạng thái hiện tại của Repository

| STT | Thành viên | Mã sinh viên | Vai trò phụ trách chính | Backlog (20 điểm/người) | Trạng thái trong repo hiện tại |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | **Lục Văn Thuận** | `2351170624` | Smart Contract / Blockchain | `SC-01` → `SC-06` | **Đã triển khai** (Contract, Ignition deploy, 20 Unit Tests PASS, đo Gas, xuất ABI/config) |
| 2 | **Nguyễn Văn Trường** | `2351170625` | Backend / Off-chain & Storage | `BE-01` → `BE-06` | **Đã triển khai để review** — 16 API, SQLite, auth ví, private PDF, finalize/retry, 42 Backend tests; xem tài liệu bàn giao |
| 3 | **Nguyễn Thế Trưởng** | `2351170626` | Frontend / Tích hợp Web3 | `FE-01` → `FE-06` | Giao diện và tích hợp Web3 trong `frontend/`. Xem [hướng dẫn chạy](frontend/README.md). |
| 4 | **Hoàng Tùng** | `2351170630` | PDF / QR / E2E / Hồ sơ | `QA-01` → `QA-06` | **Đã triển khai** — mẫu PDF/QR, biên bản xác minh PDF, 13 E2E PASS, dữ liệu demo, 6 sơ đồ, số đo Bảng 18, rà soát Phụ lục D |

> **Lưu ý đánh giá đóng góp (Phụ lục B):** Điểm story point chỉ dùng để cân đối khối lượng. Khi nghiệm thu cuối kỳ, tỷ lệ đóng góp căn cứ trên bằng chứng thực tế: **kết quả chức năng (50%)**, **kiểm thử/chất lượng (20%)**, **tích hợp/review (20%)** và **tài liệu/bàn giao (10%)**.

---

## 2. Kiến trúc, Phạm vi v1 & Quy ước chung (Bắt buộc tuân thủ)

### 2.1. Ngăn xếp công nghệ & Cấu trúc thư mục dự kiến
* **Môi trường chuẩn:** VS Code, Git/GitHub, npm, **Node.js `>= 22.13.0`**.
* **Lớp Blockchain:** Solidity `0.8.20`, OpenZeppelin `5.x` (`AccessControl`), Hardhat, Hardhat Ignition, Mocha/Chai, Ethers.js v6.
* **Lớp Backend:** Node.js, Express, TypeScript, SQLite, kho lưu trữ PDF riêng tư (`private storage`).
* **Lớp Frontend & Tài liệu:** React, Vite, TypeScript, Ethers.js v6, MetaMask, Web Crypto API (`SHA-256`), `pdf-lib`, thư viện QR.

```text
EduCert/
├── contracts/CertificateRegistry.sol      # [Đã có] Smart Contract cốt lõi
├── test/CertificateRegistry.test.js       # [Đã có] 20 Unit Tests (CT-01 → CT-20)
├── ignition/modules/CertificateRegistry.js# [Đã có] Module deploy Hardhat Ignition
├── scripts/
│   ├── export-config.js                   # [Đã có] Xuất ABI, chainId, contractAddress
│   └── measure-gas.js                     # [Đã có] Đo gasUsed thực tế từ receipt
├── config/contract-config.json            # [Đã có] Cấu hình chung cho BE & FE
├── hardhat.config.js & package.json       # [Đã có] Cấu hình Hardhat & scripts gốc
├── backend/                               # [Đã có] API Express, SQLite, private storage, PDF adapter và tests
│   ├── src/routes/
│   └── src/services/
├── frontend/                              # [Đã có] React + Vite + Web3 UI
├── e2e/                                   # [Đã có] Playwright E2E, dữ liệu demo, đo đạc, vẽ sơ đồ (QA)
│   ├── src/pages/
│   └── src/lib/
└── docs/                                  # [Đã có] Đặc tả tích hợp, API, quyết định, kế hoạch, bằng chứng và bàn giao Backend
```

### 2.2. Các nguyên tắc bất biến trong v1
1. **Ranh giới On-chain / Off-chain:** Tuyệt đối **không** đưa dữ liệu cá nhân (họ tên, email, ngày sinh, điểm số, lý do thu hồi dạng văn bản) hay tệp PDF lên blockchain. On-chain chỉ lưu `certificateId` (`bytes32`), `fileHash` (`bytes32`), `issuer`, `student`, `issuedAt`, `revokedAt`, `revokeReasonCode`, `exists`, `revoked`.
2. **Thứ tự bất biến của PDF:** Phải **tạo PDF + chèn mã QR `/verify/{certificateId}` xong trước khi tính SHA-256**. Không chỉnh sửa, tối ưu hay chèn lại QR sau khi đã băm và phát hành.
3. **Phạm vi v1 (Không tự mở rộng):** Chỉ làm mạng `Hardhat local` (Sepolia là tùy chọn sau khi đạt local). Không thêm NFT, token, DAO, AI, SSO trường hay lưu PII lên IPFS công khai.
4. **Dữ liệu demo giả lập:** Dùng mẫu `"Nguyễn Văn A"`, khóa học `"Blockchain Fundamentals"`, đơn vị phát hành `"Demo University"`. **Không** dùng tên, logo, con dấu gây hiểu nhầm là bằng/chứng chỉ thật của Trường Đại học Thủy Lợi.
5. **Quy ước Git & Review:**
   * Mỗi đầu việc tạo 1 issue và 1 nhánh riêng theo mẫu `feature/SC-02-certificate-registry`, `feature/BE-03-private-storage`, v.v.
   * Mỗi Pull Request phải nêu rõ: phạm vi thay đổi, bằng chứng test (`PASS/FAIL` kèm log), tác động tới ABI/API và có ít nhất **1 thành viên khác review**.
   * Mọi thay đổi ảnh hưởng interface/hành vi phải cập nhật `docs/DECISIONS.md` trước khi merge.
   * **Không** commit `private key`, `seed phrase`, `session secret`, tệp `.env` hoặc kho PDF demo chứa dữ liệu nhạy cảm.

### 2.3. Quy ước giao diện & dữ liệu dùng chung (Phụ lục C)
* **Biểu diễn dữ liệu:** `certificateId`, `fileHash`, `txHash` là chuỗi hex `0x...` (`bytes32` gồm 64 ký tự hex sau `0x`). Địa chỉ ví phải được chuẩn hóa ở ranh giới API. Thời gian API dùng **ISO 8601 UTC**; chain dùng **Unix seconds**.
* **Mã trạng thái `verifyCertificate(id, candidateHash)`:** `0 = NOT_FOUND`, `1 = VALID`, `2 = REVOKED`, `3 = FILE_HASH_MISMATCH`. Frontend vẫn phải đọc thêm `getCertificate(id)` để không che mất cảnh báo kép (tệp vừa sai hash vừa bị thu hồi).
* **Mã lý do thu hồi (`revokeReasonCode`):** `1` (Sai thông tin), `2` (Gian lận), `3` (Sai thẩm quyền), `4` (Khác).
* **Chuẩn phản hồi Backend (`/api/v1`):**
  * Thành công: `{"success": true, "data": ...}`
  * Lỗi: `{"success": false, "error": {"code": "...", "message": "..."}}`
  * Lỗi kết nối RPC trả `RPC_ERROR`, tuyệt đối không đánh đồng thành `NOT_FOUND`.
* **QR & URL demo:** Cấu hình biến `PUBLIC_APP_URL` trỏ về IP truy cập được từ điện thoại trong cùng mạng (không để `localhost`) trước khi sinh PDF có QR để test quét trên điện thoại.

---

## 3. Bước khởi động chung cho cả nhóm (Mốc M0 — Khóa đặc tả)

Trước khi tách nhánh code song song, **4/4 thành viên** thực hiện cùng nhau:
1. Kiểm tra phiên bản Node.js (`node -v` phải $\ge$ `v22.13.0`) và cài đặt dependencies ở thư mục gốc:
   ```bash
   npm install
   ```
2. Tạo thư mục `docs/` và chốt 4 tài liệu gốc: `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `INTERFACE_CONTRACT.md`, `DECISIONS.md`.
3. Khóa chữ ký hàm Smart Contract, schema bảng SQLite `CertificateFile`, danh sách API `/api/v1/*` và `PUBLIC_APP_URL`.
4. Xác nhận nguồn cấu hình hợp đồng duy nhất nằm ở `config/contract-config.json` (Backend và Frontend chỉ đọc từ nguồn này, không nhập tay ABI/address rời rạc).

---

## 4. Hướng dẫn các bước triển khai theo từng thành viên

### 4.1. Lục Văn Thuận (`2351170624`) — Smart Contract / Blockchain (Mốc M1: `SC-01` → `SC-06`)

> **Trạng thái:** Các tệp thuộc phần việc `SC-01` → `SC-06` đã được triển khai và kiểm chứng trong repository.

#### Các bước thực hiện & kiểm tra
* **Bước 1 (`SC-01`) — Thiết lập Hardhat & OpenZeppelin:** Cấu hình `package.json` (`"type": "module"`), `hardhat.config.js` (Solidity `0.8.20`, optimizer `enabled: true`, `runs: 200`, `chainId: 31337`).
* **Bước 2 (`SC-02`, `SC-03`) — Cài đặt `contracts/CertificateRegistry.sol`:**
  * Kế thừa `AccessControl` (`DEFAULT_ADMIN_ROLE`, `ISSUER_ROLE`).
  * Cài đặt các mapping (`certificates`, `usedFileHashes`, `studentCertificateIds`), counters (`totalIssued`, `totalRevoked`), events (`CertificateIssued`, `CertificateRevoked`) và đầy đủ 6 hàm theo Phụ lục C (`issueCertificate`, `revokeCertificate`, `getCertificate`, `verifyCertificate`, `getStudentCertificateIds`, `getStats`).
  * Chạy biên dịch:
    ```bash
    npm run compile
    ```
* **Bước 3 (`SC-04`) — Viết và chạy 20 Unit Tests (`CT-01` → `CT-20`):**
  * Kiểm tra đầy đủ phân quyền Admin/Issuer, chống trùng ID và fileHash, kiểm tra giá trị rỗng, thu hồi hợp lệ/không hợp lệ, tước role không hủy chứng chỉ cũ, phân trang, thống kê và fields của event trong `test/CertificateRegistry.test.js`.
  * Chạy kiểm thử:
    ```bash
    npm test
    ```
  * *Kết quả thực tế đã chạy trong repo:* **20 passing (683ms)** (`CT-01` → `CT-20` đạt 100%).
* **Bước 4 (`SC-05`) — Deploy local & Xuất cấu hình ABI cho BE/FE:**
  * Mở một terminal chạy node cục bộ:
    ```bash
    npx hardhat node
    ```
  * Ở terminal khác, deploy qua Hardhat Ignition và xuất `config/contract-config.json`:
    ```bash
    npm run deploy:local
    npm run export-config
    ```
  * *(Lưu ý: Nếu địa chỉ contract sau khi deploy khác mặc định `0x5FbDB2315678afecb367f032d93F642f64180aa3`, truyền `CONTRACT_ADDRESS=<địa_chỉ_mới>` khi chạy `scripts/export-config.js` hoặc cập nhật lại `config/contract-config.json` trước khi bàn giao).*
  * *(Tùy chọn mở rộng)* Chỉ triển khai lên mạng testnet **Sepolia** sau khi toàn bộ hệ thống đã nghiệm thu thành công trên mạng local.
* **Bước 5 (`SC-06`) — Đo gas thực nghiệm & Review bảo mật:**
  * Chạy kịch bản đo `receipt.gasUsed` cho 3 giao dịch chính:
    ```bash
    npm run measure-gas
    ```
  * *Số liệu thực tế đã đo trong repo:* `grantRole`: **51,537 gas** | `issueCertificate`: **207,508 gas** | `revokeCertificate`: **58,751 gas**.

---

### 4.2. Nguyễn Văn Trường (`2351170625`) — Backend / Off-chain (Mốc M2: `BE-01` → `BE-06`)

Mục tiêu của Backend là quản lý xác thực ví, tạo bản nháp PDF/QR, lưu trữ PDF riêng tư có phân quyền và đối soát receipt on-chain trước khi công nhận `ISSUED`.

> **Trạng thái:** Đã triển khai theo các bước dưới đây. Cách dùng thực tế và API xem `backend/README.md` và `docs/INTERFACE_CONTRACT.md`. Bộ 42 test gồm 10 tình huống BE bắt buộc và 32 kiểm tra bổ sung; không thay thế E2E giao diện.

#### Các bước thực hiện
* **Bước 1 (`BE-01`) — Khởi tạo `backend/` (Express + TypeScript + SQLite):**
  * Tạo project Node.js/TypeScript trong `backend/` (dùng Express, SQLite, thư viện RPC `ethers` v6).
  * Viết migration khởi tạo CSDL SQLite gồm bảng `CertificateFile` (Bảng 11):
    * `certificate_id` (`TEXT PRIMARY KEY`), `student_wallet`, `issuer_wallet`, `student_name`, `course_name`, `file_hash`, `storage_key`, `file_size` (tối đa `5 MiB`), `tx_hash` (`NULL`), `chain_id`, `contract_address`, `sync_state` (`DRAFT`, `PENDING_CHAIN`, `ISSUED`, `FAILED`, `REVOKED`), `created_at`, `updated_at`.
  * Tạo thêm bảng lưu `nonce` (gắn ví, hạn sử dụng, cờ đã dùng) và quản lý session.
  * Đọc `chainId`, `contractAddress`, `abi` từ `../config/contract-config.json`.
* **Bước 2 (`BE-02`) — Xác thực chữ ký ví (Web3 Auth):**
  * `POST /api/v1/auth/nonce`: Cấp nonce ngẫu nhiên dùng 1 lần, thời hạn ngắn, gắn với địa chỉ ví chuẩn hóa và domain.
  * `POST /api/v1/auth/verify`: Xác thực chữ ký bằng `ethers.verifyMessage`, kiểm tra nonce chưa dùng & còn hạn, thiết lập session cookie `HttpOnly`.
  * Kiểm tra quyền `ISSUER_ROLE` / `DEFAULT_ADMIN_ROLE` trực tiếp qua RPC on-chain ở các endpoint nhạy cảm (không tin dữ liệu Frontend tự khai).
* **Bước 3 (`BE-03`) — Kho lưu trữ Private & Kiểm soát tải tệp:**
  * Cấu hình thư mục lưu PDF nằm **hoàn toàn bên ngoài** thư mục static/public.
  * Validate tệp upload: kiểm tra MIME type, magic bytes PDF (`%PDF-`), dung lượng tối đa `5 MiB` (trả `400`/`413` nếu vi phạm).
  * Chống Path Traversal: sinh `storage_key` nội bộ từ `certificate_id`, tuyệt đối không ghép tên file người dùng vào đường dẫn hệ thống.
  * `GET /api/v1/certificates/:id/download`: Kiểm tra session (`401` nếu chưa đăng nhập), chỉ cho phép **Student sở hữu ví**, **Issuer gốc** hoặc **Admin** tải (trả `403` cho người khác). Có thể đối chiếu lại SHA-256 khi lưu/tải để đảm bảo byte không bị biến đổi.
* **Bước 4 (`BE-04`) — Luồng Draft & Đối soát `finalize`:**
  * `POST /api/v1/drafts/upload` và `POST /api/v1/drafts/generate`: Sinh `certificateId` ngẫu nhiên bằng CSPRNG (32 byte hex, không chứa thông tin cá nhân), phối hợp module PDF/QR của Hoàng Tùng để tạo bản PDF cuối đã chèn QR, tính `fileHash` (SHA-256) và lưu trạng thái `DRAFT`.
  * `GET /api/v1/drafts/:id`: Chỉ Issuer chủ sở hữu draft được xem thông tin draft & hash.
  * `POST /api/v1/certificates/:id/finalize`: Nhận `txHash` (và đánh dấu `PENDING_CHAIN` trước khi đối soát). Backend tự gọi RPC riêng (`getTransactionReceipt`) để xác minh:
    1. Giao dịch thành công (`status === 1`).
    2. Đúng `chainId` và đúng `contractAddress`.
    3. Receipt chứa log event `CertificateIssued` khớp đúng `certificateId`, `fileHash`, `issuer`, `student` với bản draft, đồng thời đối chiếu lại trạng thái từ hợp đồng.
    * Chỉ khi khớp toàn bộ mới chuyển `sync_state` sang `ISSUED`.
* **Bước 5 (`BE-05`) — Các API tra cứu & nhật ký:**
  * `GET /api/v1/certificates/:id/public`: Trả metadata kỹ thuật công khai **không chứa PII**.
  * `GET /api/v1/me/certificates`: Trả danh sách chứng chỉ của ví Student đang đăng nhập.
  * `GET /api/v1/stats`: Thống kê đối chiếu số liệu từ on-chain (`issued`, `revoked`, `active`).
  * `GET /api/v1/events`: Trả nhật ký sự kiện cấp/thu hồi có phân trang, không lộ PII.
* **Bước 6 (`BE-06`) — Cơ chế Retry & Kiểm thử Backend (`BE-01` → `BE-10`):**
  * Nếu giao dịch on-chain đã thành công nhưng kết nối tới `finalize` bị ngắt, giữ `PENDING_CHAIN` + `tx_hash` để lần gọi lại `finalize` tự kiểm tra lại receipt/event (idempotent), không bắt Issuer ký lại hay tạo chứng chỉ trùng.
  * Viết và chạy đầy đủ **10 ca kiểm thử Backend/API** (`BE-01` đến `BE-10` trong Bảng 24 Phụ lục A: nonce hết hạn/replay, chữ ký sai 401, Issuer bị tước role, file > 5 MiB, Student A tải file Student B bị 403, public download bị 401, fake txHash, retry finalize, hash tải lại, path traversal) và lưu log.

---

### 4.3. Nguyễn Thế Trưởng (`2351170626`) — Frontend & Tích hợp Web3 (Mốc M3: `FE-01` → `FE-06`)

Mục tiêu của Frontend là cung cấp giao diện tiếng Việt cho 4 tác nhân, tích hợp MetaMask cho thao tác ghi và dùng RPC + Web Crypto API cho xác minh công khai không cần ví.

#### Các bước thực hiện
* **Bước 1 (`FE-01`) — Khởi tạo `frontend/` (React + Vite + TypeScript):**
  * Khởi tạo cấu trúc `frontend/src/pages/` và `frontend/src/lib/`.
  * Xây dựng Layout tiếng Việt, thanh điều hướng, chỉ báo ví/mạng (`chainId`, `contractAddress`) và bộ định tuyến cho **8 màn hình** (Bảng 14):
    1. `/` — Trang chủ (giới thiệu, quy trình, lối tắt tra cứu).
    2. `/verify/:id?` — Trang xác minh công khai (`Verifier`, **không cần ví**).
    3. `/issue` — Trang phát hành (`Issuer`).
    4. `/student` — Cổng sinh viên (`Student`).
    5. `/revoke` — Trang thu hồi (`Issuer` / `Admin`).
    6. `/admin` — Trang quản trị phân quyền (`Admin`).
    7. `/dashboard` — Thống kê (`Admin` / `Issuer`).
    8. `/history` — Nhật ký sự kiện (`Tất cả`, phân trang, không PII).
* **Bước 2 (`FE-02`) — Kết nối ví & Luồng giao dịch Admin / Issuer:**
  * Trong `frontend/src/lib/`, đọc `abi`, `contractAddress`, `chainId` qua `GET /api/v1/config`. Backend lấy cấu hình từ `config/contract-config.json`.
  * Tích hợp `ethers.BrowserProvider` với MetaMask (`CORE-01`): hiển thị tài khoản, phát hiện đổi tài khoản/sai `chainId` và cảnh báo rõ trước khi ký.
  * Trang `/admin` (`CORE-02`): Gọi `grantRole(ISSUER_ROLE, wallet)`, `revokeRole(ISSUER_ROLE, wallet)` và tra cứu `hasRole`.
  * Trang `/issue` (`CORE-03`): Đăng nhập nonce với Backend -> nhập thông tin hoặc upload PDF tạo draft -> hiển thị bản PDF cuối (đã chèn QR) để xem trước -> Frontend tính lại SHA-256 bằng Web Crypto API để đối chiếu với hash draft -> ký `issueCertificate(id, hash, student)` qua MetaMask -> hiển thị `pending` + `txHash` -> chờ receipt -> gọi `POST /api/v1/certificates/:id/finalize`.
  * Trang `/revoke` (`CORE-06`): Nhập `certificateId`, chọn `reasonCode` (1–4) và ký `revokeCertificate(id, reasonCode)`.
* **Bước 3 (`FE-03`) — Trang Xác minh công khai `/verify/:id?` (`CORE-05`, `CORE-08`):**
  * Kết nối chỉ đọc qua `JsonRpcProvider` (**tuyệt đối không yêu cầu MetaMask**).
  * **Mức 1 (Chỉ nhập ID hoặc mở URL từ QR):** Gọi `getCertificate(id)` hiển thị rõ 4 trạng thái: `NOT_FOUND`, `REGISTERED_ACTIVE`, `REVOKED`, `RPC_ERROR`. Không được hiển thị thông báo như `"PDF đã xác minh"` khi chưa chọn tệp đối chiếu.
  * **Mức 2 (Chọn tệp PDF):** Tính SHA-256 ngay trên trình duyệt bằng `crypto.subtle.digest('SHA-256', arrayBuffer)` (**không gửi tệp lên server**). Đối chiếu với `fileHash` và `revoked` từ `getCertificate(id)` / `verifyCertificate(id, candidateHash)`: nếu vừa sai hash vừa bị thu hồi thì phải hiển thị **cả 2 cảnh báo**.
  * Tách riêng lỗi mạng/sai chain thành `RPC_ERROR` để không kết luận nhầm là chứng chỉ giả.
* **Bước 4 (`FE-04`) — Cổng Sinh viên `/student` (`EXT-02`):**
  * Cho phép Student kết nối ví, ký nonce xác thực với Backend (`POST /auth/nonce`, `POST /auth/verify`).
  * Gọi `GET /api/v1/me/certificates` lấy danh sách thuộc ví đã xác thực và tải PDF qua `GET /api/v1/certificates/:id/download`.
* **Bước 5 (`FE-05`) — QR UI, Dashboard & Lịch sử sự kiện (`CORE-07`, `EXT-01`, `EXT-05`):**
  * Tích hợp hiển thị/quét QR dẫn đúng tới `/verify/{certificateId}`.
  * Trang `/dashboard`: Đọc bộ đếm on-chain từ `getStats()` (`issued`, `revoked`, `active`) và hiển thị đối chiếu.
  * Trang `/history`: Đọc event `CertificateIssued` / `CertificateRevoked` có phân trang, hiển thị `txHash`, số khối, không công bố PII.
* **Bước 6 (`FE-06`) — Responsive & Kiểm soát trạng thái lỗi:**
  * Hoàn thiện responsive, thông báo rõ trạng thái `pending / confirmed / failed / user rejected / wrong network / RPC_ERROR`, phối hợp Hoàng Tùng test E2E.

---

### 4.4. Hoàng Tùng (`2351170630`) — PDF, QR, E2E & Hồ sơ nghiệm thu (Mốc M2–M4: `QA-01` → `QA-06`)

Mục tiêu của QA/Tài liệu là đảm bảo module tạo PDF/QR và biên bản hoạt động đúng quy tắc băm, xây dựng bộ test E2E + dữ liệu thực nghiệm thật và hoàn thiện hồ sơ nghiệm thu.

> **Trạng thái:** Đã triển khai QA-01 → QA-06: `backend/src/services/pdf-template.ts`, `backend/src/services/verification-report.ts`, thư mục `e2e/` và các tài liệu liệt kê ở đầu README. Hạng mục còn lại cần người thật thực hiện: MetaMask thật, quét QR bằng điện thoại, chạy lại trên máy khác.

#### Các bước thực hiện
* **Bước 1 (`QA-01`) — Module tạo PDF mẫu & Chèn mã QR (`EXT-01`, `EXT-03`):**
  * Cài đặt bằng `pdf-lib` và thư viện QR:
    * **Chế độ tạo từ mẫu:** Sinh PDF tiếng Việt chứa tên sinh viên, khóa học, ngày cấp, tên đơn vị phát hành, `certificateId` và mã QR trỏ về `${PUBLIC_APP_URL}/verify/{certificateId}`.
    * **Chế độ upload PDF có sẵn:** Đọc file nguồn, tạo **một bản PDF mới** có chèn QR vào vùng phù hợp (không ghi đè file gốc; không hỗ trợ tự chèn vào PDF đã có chữ ký số sẵn trong v1).
  * Phối hợp Backend đảm bảo: **QR luôn được chèn xong trước khi tính SHA-256 trên byte cuối cùng**.
* **Bước 2 (`QA-02`) — Chức năng xuất Biên bản xác minh (`EXT-04`):**
  * Sinh tệp PDF biên bản từ kết quả đọc on-chain tại thời điểm kiểm tra, bắt buộc chứa: `certificateId`, `chainId`, `contractAddress`, địa chỉ `issuer`, `fileHash` tham chiếu, kết quả đối chiếu, dấu thời gian (UTC/hiển thị rõ) và **câu chú thích đây là báo cáo kỹ thuật tại thời điểm xác minh, không thay thế xác nhận pháp lý của cơ sở giáo dục**.
* **Bước 3 (`QA-03`) — Dữ liệu demo & Bộ kiểm thử E2E (`E2E-01` → `E2E-12`):**
  * Chuẩn bị bộ dữ liệu demo giả lập: sinh viên `"Nguyễn Văn A"`, khóa học `"Blockchain Fundamentals"`, đơn vị `"Demo University"`, kèm **1 PDF gốc hợp lệ** và **1 bản PDF đã chỉnh sửa nội dung** để test sai lệch hash.
  * Thực thi đầy đủ **12 ca E2E** theo **Bảng 25 Phụ lục A** (tự động bằng Playwright hoặc thực hiện thủ công có biên bản/ảnh chụp) và diễn tập kịch bản trình diễn 8 bước (Mục 4.5), bao gồm cả các tình huống lỗi:
    * Sai mạng MetaMask, người dùng từ chối ký, tài khoản không có quyền (`401`/`403`), tắt RPC node để kiểm tra `RPC_ERROR`, quét QR từ điện thoại tới `PUBLIC_APP_URL`.
* **Bước 4 (`QA-04`) — Sơ đồ kiến trúc & Use Case (`docs/`):**
  * Đặt đầy đủ sơ đồ (Use Case 4 tác nhân, Kiến trúc tổng thể On-chain/Off-chain, Vòng đời trạng thái chứng chỉ vs đồng bộ Backend, Sequence Diagram phát hành & xác thực) vào `docs/`.
* **Bước 5 (`QA-05`) — Đo đạc thực nghiệm & Cập nhật tài liệu nghiệm thu:**
  * Bổ sung số liệu đo thực tế cho **Bảng 18** (cùng với số đo gas từ Lục Văn Thuận):
    * **Thời gian băm PDF trong trình duyệt:** Dùng `performance.now()` trước/sau hàm `crypto.subtle.digest`, chạy lặp nhiều lần trên nhiều kích thước tệp (tới `5 MiB`) và ghi trung bình/trung vị.
    * **Thời gian đọc chain:** Đo thời gian thực thi `eth_call` qua RPC.
    * **Log kiểm thử tổng hợp:** Gom log từ 20 CT + 10 BE + 12 E2E = **42 ca kiểm thử** (Bảng 17).
  * Cập nhật lại `README.md` (lệnh cài đặt & chạy cả 3 mô-đun) và cập nhật Chương 4–5 trong báo cáo bằng **số liệu thật, ảnh chụp giao diện thật, commit hash thật** (tuyệt đối không dùng số liệu ước lượng).
* **Bước 6 (`QA-06`) — Review PR & Đối soát nghiệm thu:**
  * Rà soát tất cả PR, đối chiếu danh mục kiểm tra ở **Phụ lục D** trước khi chốt nộp bài.

---

## 5. Lộ trình mốc kiểm soát & Hồ sơ nghiệm thu (M0 → M4)

| Mốc | Tên mốc | Điều kiện hoàn thành bắt buộc (Bảng 22 & Phụ lục D) |
| :-: | :--- | :--- |
| **M0** | Khóa đặc tả | 4/4 thành viên duyệt `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `INTERFACE_CONTRACT.md`, `DECISIONS.md`, chốt `PUBLIC_APP_URL`. |
| **M1** | Blockchain | Compile/deploy thành công, $\ge 15$ unit test *(đã đạt 20/20)*, xuất `config/contract-config.json`, đo `gasUsed`. |
| **M2** | Backend / PDF | Khởi chạy Backend, migration SQLite, auth nonce/session, tạo PDF có QR trước khi hash, lưu private, `finalize` có đối soát RPC, đạt 10 API tests. |
| **M3** | Tích hợp Web | Khởi chạy Frontend 8 trang kết nối đúng mạng/contract, chạy thông suốt luồng cấp – tra cứu – xác minh – tải – thu hồi – thống kê – xuất biên bản. |
| **M4** | Nghiệm thu | Máy khác clone repo và làm theo `README.md` chạy được đủ 3 mô-đun; hoàn tất 42 ca test có log; đo gas + thời gian thực nghiệm; chụp ảnh/video demo các ca thành công & ca lỗi; cập nhật báo cáo Chương 4–5. |

### Checklist hồ sơ minh chứng trước khi nộp cuối kỳ (Mục 4.8)
- [ ] Mã nguồn GitHub đầy đủ lịch sử commit/PR của 4 thành viên, có lockfile phiên bản (`package-lock.json`) và `README.md` chạy lại được trên máy khác. *(Đã có commit/PR và lockfile; chưa ghi nhận lần chạy trên máy khác.)*
- [x] Danh sách ABI, `contractAddress`, `chainId` và `transaction hash` của phiên chạy demo — [`run-summary.json`](docs/evidence/e2e/run-summary.json).
- [x] Ảnh chụp giao diện thật theo luồng: Admin cấp role, Issuer phát hành, Student tải PDF, Verifier tra cứu QR/PDF hợp lệ, cảnh báo `FILE_HASH_MISMATCH`, thu hồi `REVOKED`, Dashboard & History — [`screenshots/`](docs/evidence/e2e/screenshots/).
- [x] Log chạy thực tế cho 42 ca kiểm thử (**20 Contract** + **10 Backend/API** + **12 E2E**) — [`docs/evidence/final/`](docs/evidence/final/).
- [x] Bảng số liệu thực nghiệm (**Bảng 18**: `gasUsed`, thời gian băm PDF, thời gian đọc RPC) kèm thông số môi trường — [EXPERIMENT_RESULTS.md](docs/EXPERIMENT_RESULTS.md).
- [x] Bộ tệp minh chứng: PDF chứng chỉ mẫu có QR, PDF đã bị sửa nội dung, và PDF biên bản xác minh xuất từ hệ thống — [`docs/evidence/e2e/`](docs/evidence/e2e/).

---

## 6. Lệnh nhanh hiện có ở thư mục gốc (Smart Contract)

```bash
npm run compile        # Biên dịch CertificateRegistry.sol
npm test               # Chạy 20 Unit Tests Smart Contract (CT-01 → CT-20)
npm run measure-gas    # Đo gasUsed thực tế (grantRole, issueCertificate, revokeCertificate)
npx hardhat node       # Khởi động mạng Hardhat local tại http://127.0.0.1:8545 (chainId 31337)
npm run deploy:local   # Deploy hợp đồng qua Hardhat Ignition vào mạng localhost
npm run export-config  # Xuất ABI, chainId, địa chỉ hợp đồng ra config/contract-config.json
npm run test:e2e       # 13 ca E2E Playwright trên stack riêng (cần npm --prefix e2e ci)
npm run measure:e2e    # Đo thời gian băm PDF và đọc chain (Bảng 18)
npm run demo-data      # Tạo chứng chỉ demo + PDF đã sửa trên stack demo đang chạy
```
