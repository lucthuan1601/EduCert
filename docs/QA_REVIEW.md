# Rà soát PR và đối chiếu nghiệm thu (QA-06)

Người rà soát: Hoàng Tùng (2351170630). Ngày: 24/11/2026. Phạm vi: mã trên `main` tại `a9df7c8` (sau PR #8 Backend và PR #9 Frontend) cùng các nhánh QA-01 → QA-05. Cách rà soát: đọc diff từng commit, chạy lại toàn bộ kiểm thử, rồi dùng chính bộ E2E để đối chiếu hành vi giao diện với báo cáo. Mỗi phát hiện ghi mức độ, bằng chứng và người nên xử lý; không tự sửa phần thuộc thành viên khác trừ khi phần đó nằm trong phạm vi QA.

## 1. Kết quả chạy lại

| Kiểm tra | Kết quả |
| --- | --- |
| `npm --prefix backend run verify` (typecheck, client mẫu, build, 20 CT, 51 Backend) | PASS — [verify-summary.json](evidence/final/verify-summary.json) |
| `npm --prefix frontend run lint` và `run build` | PASS — [frontend-lint-build.txt](evidence/final/frontend-lint-build.txt) |
| `npm --prefix e2e test` (13 ca) | PASS — [E2E_TEST_REPORT.md](E2E_TEST_REPORT.md) |
| ABI trong `config/contract-config.json` so với artifact biên dịch | Trùng khớp; chainId 31337; 16 hàm gồm đủ 6 hàm của Phụ lục C |

## 2. Rà soát theo PR

| PR | Nội dung | Nhận xét QA | Kết luận |
| --- | --- | --- | --- |
| Commit `5ae14ea` (SC, Lục Văn Thuận) | Hợp đồng, 20 unit test, Ignition, đo gas | Đúng chữ ký hàm Phụ lục C; thu hồi chỉ cho Admin hoặc Issuer gốc còn quyền; gas đo lại khớp (51.537 / 207.508 / 58.751) | Đạt |
| PR #8 (BE-01 → BE-06, Nguyễn Văn Trường) | 16 endpoint, SQLite, auth ví, kho PDF riêng, finalize/retry | Đã có review trước đó phát hiện lỗi giữ txHash (BE-D12, đã sửa). E2E xác nhận thêm luồng finalize, 401/403 và tải lại đúng byte qua giao diện | Đạt |
| PR #9 (FE-01 → FE-06, Nguyễn Thế Trưởng) | 8 trang, MetaMask, xác minh hai mức, dashboard, lịch sử | 12 ca E2E chạy trên chính giao diện này đều đạt; phát hiện F-03, F-04 ở mục 3 | Đạt, có góp ý nhỏ |
| QA-01 → QA-05 (Hoàng Tùng) | Mẫu PDF, biên bản, E2E, sơ đồ, số đo | Cần một thành viên khác review trước khi merge theo quy ước nhóm | **Chờ review** |

## 3. Phát hiện

| Mã | Mức | Phát hiện | Bằng chứng | Đề xuất / người xử lý |
| --- | --- | --- | --- | --- |
| F-01 | Trung bình (tài liệu) | Báo cáo ghi Hardhat 3 (Mục 4.1, 4.2, Phụ lục D), repo dùng Hardhat 2.29.2 | `package.json`, BE-D01 | Sửa báo cáo theo [REPORT_CH4_5_UPDATE.md](REPORT_CH4_5_UPDATE.md) — Tùng |
| F-02 | Thấp (tài liệu) | Bảng 16 nhắc `AGENTS.md` nhưng repo không có tệp này | Cây thư mục | Bỏ khỏi báo cáo hoặc thêm tệp — nhóm quyết định |
| F-03 | Thấp (UI) | `dateTime()` dùng `dateStyle: 'short'` nên năm hiển thị 2 chữ số (`24/11/26`); dễ nhầm khi chụp ảnh làm minh chứng | `frontend/src/lib/ui.ts`, ảnh `11-verifier-revoked-and-tampered.png` | Dùng `year: 'numeric'` — Trưởng |
| F-04 | Thấp (UI) | Nút "In hoặc lưu biên bản PDF" cũ dùng `window.print()` nên phụ thuộc trình duyệt; đã bổ sung nút "Tải biên bản PDF" (QA-02) và đổi nút cũ thành "In trang" | `frontend/src/pages/verify.tsx` | Đã xử lý trong QA-02, cần Trưởng review |
| F-05 | Thấp (hiệu năng) | Mỗi lệnh đọc của Backend gọi thêm `eth_chainId` + `eth_getCode`; API public mất ~53 ms so với ~3 ms khi trình duyệt đọc trực tiếp | [EXPERIMENT_RESULTS.md](EXPERIMENT_RESULTS.md#33-thời-gian-đọc-chain-ms) | Chấp nhận cho demo (tránh NOT_FOUND giả); nếu mở rộng, cache kết quả kiểm tra mạng vài giây — Trường |
| F-06 | Thấp (vận hành) | `/certificates/:id/public`, `/stats`, `/events` không có rate limit, mỗi yêu cầu sinh 3 lệnh RPC | `backend/src/routes/queries.ts` | Thêm limiter như `/auth/*` trước khi triển khai ngoài local — Trường |
| F-07 | Thông tin | `AccessControl` cho phép Admin `renounceRole` và mất quyền quản trị vĩnh viễn | ABI có `renounceRole` | Ghi vào hướng dẫn vận hành; đúng với khuyến nghị multisig ở Bảng 15 — Thuận |
| F-08 | Thông tin | CI chỉ chạy cho `feature/BE-*`, không kiểm Frontend và E2E | `.github/workflows/backend.yml` | Đã thêm trigger `feature/FE-*`, `feature/QA-*` và job `e2e` (lint/build FE + Playwright). **Chưa có lần chạy CI** cho tới khi nhánh được push |
| F-09 | Thông tin | `DECISIONS.md` ghi rõ chưa phải biên bản duyệt M0; chưa có bằng chứng 4/4 thành viên duyệt đặc tả | `docs/DECISIONS.md` dòng đầu | Cả nhóm xác nhận trên PR hoặc ghi biên bản họp — nhóm |

Không phát hiện dữ liệu cá nhân trên chain, trong event, QR, biên bản hay API công khai: E2E-09 kiểm tra `/history` không chứa tên sinh viên; test QA-02 kiểm tra biên bản không chứa tên.

## 4. Đối chiếu Phụ lục D

| Bước | Điều kiện | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| M0 | Duyệt PROJECT_SPEC, ARCHITECTURE, INTERFACE_CONTRACT, DECISIONS | Tài liệu đã có; **chưa có biên bản duyệt 4/4** (F-09) | `docs/` |
| M1 | Compile, unit test, deploy local, xuất ABI/chainId/address | Đạt (Hardhat 2, F-01) | `ct-unit-tests.txt`, `config/contract-config.json` |
| M2 | Backend, migration SQLite, nonce/session, PDF có QR, lưu private, finalize | Đạt | `be-api-tests.txt`, `pdf.test.ts` |
| M3 | Frontend đúng mạng; cấp – tra cứu – tải – thu hồi | Đạt (tự động) | E2E-01 → E2E-12 |
| M4 | Test tổng thể, đo gas, log/ảnh, cập nhật Chương 4–5 | Đã có log, ảnh, số đo và nội dung cập nhật; **chưa chép vào bản Word**, **chưa chạy trên máy khác** | [EXPERIMENT_RESULTS.md](EXPERIMENT_RESULTS.md), [REPORT_CH4_5_UPDATE.md](REPORT_CH4_5_UPDATE.md) |

| Mục đối chiếu trước khi nộp | Trạng thái |
| --- | --- |
| Thông số môi trường có thật | Có — EXPERIMENT_RESULTS mục 1 |
| Hình chụp giao diện ứng dụng thật | Có — 18 ảnh từ lần chạy E2E |
| Địa chỉ hợp đồng đã triển khai | Có cho Hardhat local; Sepolia không triển khai (tùy chọn) |
| Mã nguồn trùng với ABI trình bày | Có — so khớp ABI ở mục 1 |
| Test result có log | Có — `docs/evidence/final/` |
| Bảng gas và thời gian có phương pháp đo | Có — EXPERIMENT_RESULTS mục 3 |
| Phân công có bằng chứng theo PR | Có cho SC/BE/FE; nhánh QA cần push và mở PR |
| Nhận định chưa kiểm chứng giữ ở dạng dự kiến | Có — các mục MetaMask thật, điện thoại, máy khác ghi "chưa thực hiện" |

## 5. Việc còn lại trước khi nộp

1. Push các nhánh `feature/QA-01` → `feature/QA-06`, mở PR về `main`, một thành viên khác review (quy ước Mục 2.2).
2. Chép nội dung [REPORT_CH4_5_UPDATE.md](REPORT_CH4_5_UPDATE.md) và sơ đồ `docs/diagrams/` vào bản Word sau khi nhóm duyệt.
3. Một thành viên clone mới trên máy khác, chạy theo README, ghi lại kết quả.
4. Diễn tập với MetaMask thật và quét QR bằng điện thoại, điền bảng thủ công trong [E2E_TEST_REPORT.md](E2E_TEST_REPORT.md#kiểm-tra-thủ-công-bổ-sung).
