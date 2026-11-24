# Nội dung cập nhật Chương 4–5 của báo cáo (QA-05)

Người soạn: Hoàng Tùng (2351170630). Tệp này gom các đoạn văn và bảng cần thay trong `Bao_cao_EduCert_Nhom11_Hoan_chinh.docx` sau khi có mã nguồn và log thật. Mỗi mục ghi rõ vị trí trong báo cáo; số liệu lấy từ [EXPERIMENT_RESULTS.md](EXPERIMENT_RESULTS.md), [E2E_TEST_REPORT.md](E2E_TEST_REPORT.md) và [`docs/evidence/`](evidence/). Nhóm duyệt rồi mới chép vào bản Word.

## Lời mở đầu và đoạn mở Chương 4

**Thay đoạn** "Tại thời điểm biên soạn, nhóm mới cung cấp tài liệu ý tưởng…" bằng:

> Phiên bản báo cáo này được cập nhật sau khi nhóm hoàn thành mã nguồn trên repository `lucthuan1601/EduCert`. Các phần triển khai và kiểm thử trình bày kết quả chạy thực tế trên Hardhat local kèm log, commit và tệp minh chứng; những hạng mục chưa thực hiện (MetaMask thật trên điện thoại, triển khai Sepolia) được ghi rõ là chưa có kết quả.

**Thay đoạn mở Chương 4** "Chương này mô tả phương án hiện thực và quy trình đánh giá dự kiến…" bằng:

> Chương này mô tả cách nhóm hiện thực EduCert và kết quả kiểm thử thực tế trên mạng Hardhat local (chainId 31337). Lệnh chạy, phiên bản phụ thuộc, commit, log và ảnh giao diện được lưu trong thư mục `docs/evidence/` của repository; số đo chỉ đại diện cho môi trường đã nêu.

## 4.1. Môi trường phát triển và cấu trúc mã nguồn

**Sửa câu** "Node.js từ 22.13.0 để tương thích Hardhat 3" thành "Node.js từ 22.13.0; dự án giữ Hardhat 2.29 theo lockfile hiện có (quyết định BE-D01)". **Bỏ** dòng `AGENTS.md` trong Bảng 16 vì repository không có tệp này, và **bổ sung** các dòng:

| Thư mục / tệp | Vai trò |
| --- | --- |
| `backend/src/services/pdf-template.ts` | Mẫu PDF chứng chỉ, trang QR cho chế độ upload (QA-01) |
| `backend/src/services/verification-report.ts` | Biên bản xác minh PDF (QA-02) |
| `e2e/` | Playwright E2E, ví EIP-1193 tự động, dữ liệu demo, đo đạc, vẽ sơ đồ (QA-03 → QA-05) |
| `docs/evidence/` | Log, ảnh giao diện, PDF minh chứng, số đo |

Môi trường chạy thực tế: Windows 11 x64, Intel Core i5-12450H, 32 GiB RAM, Node.js v24.22.0, Solidity 0.8.20 (optimizer 200 runs), Hardhat 2.29.2, Chrome 157 qua Playwright 1.57.0.

## 4.4. Triển khai Frontend, PDF và QR

**Thêm sau đoạn thứ hai:**

> Mẫu PDF được hiện thực bằng `pdf-lib` và font Noto Sans (giấy phép OFL) để hiển thị đúng tiếng Việt. Chế độ tạo từ mẫu sinh trang A4 ngang gồm đơn vị cấp, tên người nhận, khóa học, ngày cấp, mã chứng chỉ, liên kết và mã QR `PUBLIC_APP_URL/verify/{certificateId}`. Chế độ upload giữ nguyên các trang nguồn và thêm một trang thông tin xác minh có QR, do việc vẽ đè lên nội dung gốc có thể che thông tin. QR luôn được vẽ trước khi lưu tệp, nên SHA-256 được tính trên byte cuối cùng. Kiểm thử tự động giải mã QR trực tiếp từ ảnh nhúng trong PDF và trích xuất chữ tiếng Việt bằng pdf.js để xác nhận nội dung.

**Thay đoạn biên bản** bằng:

> Biên bản xác minh do Backend sinh qua `GET /api/v1/certificates/:id/verification-report`. Backend đọc `getCertificate` tại một khối cố định và ghi certificateId, chainId, địa chỉ hợp đồng, số khối, ví issuer, ví người nhận, fileHash tham chiếu, kết quả đối chiếu (`NOT_CHECKED`, `MATCH` hoặc `FILE_HASH_MISMATCH`), mã `verifyCertificate`, thời điểm đọc theo UTC và UTC+7, QR tra cứu và câu chú thích "đây là báo cáo kỹ thuật tại thời điểm xác minh, không thay thế xác nhận pháp lý của cơ sở giáo dục". Trình duyệt chỉ gửi mã băm đã tính, không gửi tệp PDF. Khi chứng chỉ vừa bị thu hồi vừa sai hash, biên bản ghi đồng thời hai kết luận.

## 4.5. Kịch bản trình diễn xuyên suốt

**Thêm sau danh sách 8 bước:**

> Kịch bản đã được diễn tập tự động bằng bộ E2E (Mục 4.6): ví quản trị cấp quyền cho ví Issuer mới, Issuer tạo chứng chỉ cho "Nguyễn Văn A – Blockchain Fundamentals – Demo University", Backend đối soát receipt, Student tải PDF, Verifier đối chiếu bản gốc và bản đã sửa, Issuer thu hồi, dashboard hiển thị 2 = 1 + 1. Các tình huống lỗi gồm từ chối ký, sai mạng, mất RPC và ví không có quyền. Ảnh chụp từng bước nằm trong `docs/evidence/e2e/screenshots/`; các giao dịch của lần chạy được ghi trong `run-summary.json`.

## 4.6. Thiết kế bộ kiểm thử — Bảng 17 (thay cột "Số ca dự kiến")

| Nhóm kiểm thử | Số ca | Kết quả thực tế | Điều kiện đã xác nhận |
| --- | --- | --- | --- |
| Contract unit tests | 20 | 20 PASS | Phân quyền, chống trùng, kiểm tra hash, thu hồi, event, counter |
| Backend/API integration | 10 | 10 PASS (+ 41 ca bổ sung PASS) | Nonce, session, private storage, finalize, retry, phân quyền; mẫu PDF/QR; biên bản |
| UI/End-to-end | 12 | 12 PASS (+ 1 ca upload PASS) | QR, Student, xác minh PDF, dashboard, export, lỗi RPC |
| **Tổng mục tiêu** | **42** | **42 PASS** | Log: `docs/evidence/final/` |

**Thay câu cuối 4.6** "Một số kiểm thử giao diện có thể viết bằng Playwright…" bằng:

> Mười hai ca E2E được tự động hóa bằng Playwright trên giao diện, Backend và hợp đồng thật. Do trình duyệt tự động không cài được tiện ích MetaMask, nhóm dùng một ví EIP-1193 chuyển lệnh ký tới tài khoản phát triển của Hardhat node; mã `ethers.BrowserProvider` của Frontend vẫn chạy như khi dùng MetaMask. Giao diện popup của MetaMask và việc quét QR bằng camera điện thoại được kiểm tra thủ công.

## 4.7. Phương pháp thu thập số liệu — Bảng 18 (thay cột "Trạng thái bản thảo")

| Chỉ số | Cách đo | Kết quả thực đo |
| --- | --- | --- |
| Gas cấp chứng chỉ | receipt.gasUsed của issueCertificate | 207.508 gas |
| Gas thu hồi | receipt.gasUsed của revokeCertificate | 58.751 gas |
| Gas cấp quyền | receipt.gasUsed của grantRole | 51.537 gas |
| Thời gian băm PDF | performance.now() quanh crypto.subtle.digest, 50 lần/kích thước | 1 MiB: 0,9 ms; 5 MiB: 4,0 ms (trung vị); gồm đọc tệp: 2,1 ms và 6,7 ms |
| Thời gian đọc chain | eth_call getCertificate qua RPC | Trình duyệt → /rpc: 3,3 ms; Node → RPC: 15,7 ms; API public: 52,8 ms (trung vị) |
| Kết quả kiểm thử | Test runner, logs và commit | 42/42 PASS (Bảng 17) |

**Thêm đoạn sau bảng:**

> Số đo được lấy trên một máy cá nhân với Hardhat node chế độ automine, nên thời gian từ khi gửi tới khi có receipt (64 ms) không đại diện cho thời gian xác nhận trên mạng công khai. Phí giao dịch không được quy đổi vì `effectiveGasPrice` của mạng local không có ý nghĩa kinh tế. Gas của `issueCertificate` dao động vài đơn vị giữa các lần đo do số byte 0 trong `certificateId` và `fileHash` ngẫu nhiên khác nhau.

## 4.8. Tiêu chí hoàn thành và hồ sơ minh chứng

| Hồ sơ | Trạng thái | Vị trí |
| --- | --- | --- |
| Mã nguồn GitHub có commit/PR, lockfile, tài liệu cài đặt | Có | Repository, `README.md`, `frontend/README.md`, `e2e/README.md` |
| ABI, địa chỉ contract, chainId, transaction hash của demo | Có (lần chạy E2E) | `config/contract-config.json`, `docs/evidence/e2e/run-summary.json` |
| Ảnh giao diện theo quy trình | Có (18 ảnh) | `docs/evidence/e2e/screenshots/` |
| Log kiểm thử tự động | Có | `docs/evidence/final/`, `docs/evidence/e2e/e2e-results.json` |
| Bảng gas/thời gian và cấu hình môi trường | Có | `docs/EXPERIMENT_RESULTS.md`, `docs/evidence/measurements.json` |
| PDF chứng chỉ có QR, PDF đã sửa, biên bản xác minh | Có | `docs/evidence/e2e/*.pdf` |
| Demo trên máy khác theo README | **Chưa thực hiện** | Cần một thành viên clone mới và ghi lại |
| MetaMask thật, quét QR bằng điện thoại | **Chưa thực hiện** | Bảng kiểm tra thủ công trong `E2E_TEST_REPORT.md` |

## 5.1. Mức độ đáp ứng mục tiêu — Bảng 19 (thay cột "Trạng thái hiện có")

| Mục tiêu | Bằng chứng | Trạng thái hiện có |
| --- | --- | --- |
| Đúng quyền phát hành | CT về role; E2E-01 cấp quyền qua `/admin`; E2E-10 ví không quyền nhận 403 | Đạt, có log |
| Kiểm tra tính toàn vẹn | E2E-04/05: PDF gốc trùng hash, bản sửa ra FILE_HASH_MISMATCH | Đạt, có log và tệp |
| Đồng bộ on/off-chain | BE-07/08: txHash giả, retry sau mất RPC; E2E-01 finalize | Đạt, có log |
| Tải PDF có quyền | BE-05/06, E2E-11: 403/401; E2E-12 hash tải lại | Đạt, có log |
| Trình diễn mở rộng | QR (E2E-03), Student, PDF mẫu, biên bản (E2E-08), dashboard (E2E-09) | Đạt, có ảnh và tệp |
| Đánh giá gas | `measure-gas`, receipt trong lần đo QA-05 | Đã đo trên Hardhat local |

**Thay đoạn thứ hai của 5.1** bằng:

> Kết quả trên xác nhận các chức năng cốt lõi và mở rộng hoạt động đúng trong môi trường Hardhat local với dữ liệu giả lập. Chúng chưa chứng minh hiệu năng hay độ tin cậy trên mạng công khai, chưa thử với MetaMask thật trên thiết bị di động và chưa được một máy khác chạy lại theo README.

## 5.2. Đánh đổi và hạn chế — bổ sung đoạn thứ năm

> Thứ năm, số đo cho thấy Backend mất khoảng 53 ms cho mỗi lần tra cứu công khai vì luôn kiểm tra chainId và mã hợp đồng trước khi đọc bản ghi, trong khi trình duyệt đọc trực tiếp qua RPC chỉ mất khoảng 3 ms. Nhóm chấp nhận chi phí này để không bao giờ trả nhầm NOT_FOUND khi cấu hình mạng sai. Băm SHA-256 phía trình duyệt không phải điểm nghẽn: tệp 5 MiB chỉ mất khoảng 7 ms kể cả bước đọc tệp.

## 5.4. Phân công — bổ sung sau Bảng 22

> Bằng chứng đóng góp theo Git (tính tới ngày 24/11/2026): Lục Văn Thuận — hợp đồng, 20 unit test, đo gas (`5ae14ea`); Nguyễn Văn Trường — Backend BE-01 → BE-06 và các lần sửa sau review (10 commit, PR #8); Nguyễn Thế Trưởng — Frontend 8 trang và hướng dẫn chạy (PR #9); Hoàng Tùng — mẫu PDF/QR, biên bản xác minh, bộ E2E, sơ đồ, số đo và hồ sơ nghiệm thu (QA-01 → QA-06). Tỷ lệ đóng góp cuối cùng do bốn thành viên thống nhất theo tiêu chí ở Phụ lục B.

## Phụ lục A

Thêm cột **Kết quả** vào Bảng 23, 24 và 25 với giá trị `PASS` cho tất cả các ca, kèm chú thích: "Kết quả chạy ngày 24/11/2026; log tại `docs/evidence/final/`."

## Danh mục hình

Thay năm hình bằng ảnh trong `docs/diagrams/` (`hinh-1.png` → `hinh-5.png`), được vẽ lại theo mã nguồn đã triển khai. `hinh-6.png` là sơ đồ tuần tự xác minh và xuất biên bản; có thể chèn vào Mục 3.7 nếu cần.
