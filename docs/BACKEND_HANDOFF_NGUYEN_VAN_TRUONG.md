# Tổng hợp công việc Backend — Nguyễn Văn Trường

Người thực hiện: Nguyễn Văn Trường, MSSV 2351170625. Phạm vi BE-01 → BE-06 theo README mục 4.2. Bàn giao ngày 23/11/2026 để nhóm review và tích hợp; không tự ghi nhận đã merge hoặc có phê duyệt 4/4 thành viên.

## 1. Công việc đã làm

| Đầu việc | Sản phẩm | Bằng chứng |
| --- | --- | --- |
| BE-01, issue #1 | Express/TypeScript, SQLite migration v1, cấu hình chung và đặc tả tích hợp | typecheck/build/migration; backend/src/config.ts và database.ts |
| BE-02, issue #2 | Nonce gắn ví/domain/chain, chữ ký EIP-191, session HttpOnly, CSRF, kiểm role | BE-01/02/03 và các test phiên/CSRF/Origin |
| BE-03, issue #3 | Kho PDF riêng tư, đường dẫn nội bộ, tệp bất biến, kiểm hash và quyền tải | BE-04/05/06/09/10, kiểm tệp bị sửa và quyền Admin/Issuer |
| BE-04, issue #4 | Tạo/upload PDF có QR, font tiếng Việt, preview, SHA-256, receipt/event/state finalize | BE-07/08/09 và các test wrong hash/student/contract/sender, pending/revert |
| BE-05, issue #5 | Public lookup không PII, danh sách cá nhân, thống kê, events phân trang | Test public/list/revoke/stats/events/RPC |
| BE-06, issue #6 | Retry sau restart, lệnh đối soát bản chờ, 42 Backend tests, CI và tài liệu Frontend | docs/TEST_RESULTS.md và docs/evidence |

Giữ nguyên mã Solidity và ABI. Backend dùng contract hiện có của Thuận; giao dịch được ví người dùng ký, không có private key hoặc seed phrase trong mã nguồn Backend.

## 2. Các API đã dùng để Frontend kết nối

Base URL local: **http://localhost:3001/api/v1**. Chi tiết request/response, lỗi, ví dụ và phân quyền: [INTERFACE_CONTRACT.md](INTERFACE_CONTRACT.md). Client có thể chép vào Frontend: [examples/frontend-api.ts](examples/frontend-api.ts), đã được typecheck.

| Method | Endpoint | Frontend sử dụng khi |
| --- | --- | --- |
| GET | /health | Kiểm Backend đang chạy |
| GET | /config | Lấy ABI/address/chainId và giới hạn |
| POST | /auth/nonce | Lấy message đăng nhập |
| POST | /auth/verify | Gửi chữ ký, tạo cookie và lấy CSRF |
| GET | /auth/me | Khôi phục phiên, CSRF và roles |
| POST | /auth/logout | Đăng xuất/đổi ví |
| POST | /drafts/generate | Tạo chứng chỉ từ mẫu |
| POST | /drafts/upload | Upload PDF có sẵn để tạo bản mới có QR |
| GET | /drafts/:id | Xem lại trạng thái và thông tin draft |
| GET | /drafts/:id/preview | Lấy byte PDF cuối để preview và tính SHA-256 |
| POST | /certificates/:id/finalize | Đối soát txHash sau ký hoặc retry |
| GET | /certificates/:id/public | Trang xác minh không cần ví |
| GET | /certificates/:id/download | Tải PDF có quyền |
| GET | /me/certificates | Cổng sinh viên, danh sách có phân trang |
| GET | /stats | Dashboard, counters từ chain |
| GET | /events | Lịch sử cấp/thu hồi có phân trang |

Các POST sau đăng nhập gửi X-CSRF-Token. Mọi fetch gửi credentials:include. Dùng cùng hostname cho FE/BE để cookie hoạt động; PUBLIC_APP_URL phải đúng origin FE. Không nhận URL tải công khai từ storage.

## 3. Luồng tích hợp bắt buộc

1. Đọc config; kết nối đúng ví/mạng và đăng nhập bằng nonce.
2. Tạo draft hoặc upload; preview PDF cuối, tính Web Crypto SHA-256 để so fileHash.
3. Dùng MetaMask gọi issueCertificate(id, hash, student); giữ ID + txHash ngay khi gửi.
4. Chờ receipt rồi gọi finalize. 202 hoặc RPC_ERROR thì đối soát lại cùng giao dịch, không yêu cầu ký cấp mới.
5. Student đăng nhập bằng ví nhận, lấy danh sách và tải PDF.
6. Verifier đọc public metadata không cần ví; chỉ kết luận PDF khớp sau khi băm tệp tại trình duyệt.
7. Issuer gốc còn role hoặc Admin thu hồi bằng contract. Kiểm lại public/list/stats/events để hiện trạng thái mới.

Finalize vẫn kiểm giao dịch đã thành công khi Issuer mất role sau đó; tạo draft mới luôn yêu cầu role hiện tại. Thiết kế không làm mất hiệu lực chứng chỉ cũ chỉ vì tước quyền Issuer.

## 4. Chạy và kiểm tra

Hướng dẫn cài, chạy ba terminal, cấu hình LAN và khôi phục: [backend/README.md](../backend/README.md).

```powershell
npm --prefix backend run verify
```

Lệnh trên chạy typecheck Backend/client mẫu, build, 20 contract tests và 42 Backend tests với Hardhat node tạm. Logs mới nằm backend/reports; ảnh chụp bằng chứng chạy tại thời điểm bàn giao nằm docs/evidence. Xem [TEST_RESULTS.md](TEST_RESULTS.md).

Backend có lệnh reconcile:pending cho các bản chờ đã lưu txHash. Migration và setup:env có thể chạy lại; setup:env không ghi đè secret. Node Hardhat reset làm mất chain; khi demo lại cần triển khai/config đúng và chọn database mới nếu dữ liệu cũ thuộc phiên chain đã reset.

## 5. Điểm bàn giao cho từng thành viên

- **Thuận:** giữ ABI hiện tại, xác nhận mạng/address deploy; npm run setup-demo cấp role cho ví demo trên Hardhat local. Không cần Backend ký thay.
- **Thế Trưởng:** dùng 16 API và client mẫu; xây dựng các trang/UI, Web Crypto, MetaMask, cảnh báo kép revoked + hash mismatch, trạng thái giao dịch và cơ chế khôi phục ID/txHash.
- **Tùng:** PdfAdapter ở backend/src/services/pdf.ts có hai hàm generate/stamp. Có font tiếng Việt, QR đúng URL, upload tạo phụ lục. Tiếp tục mẫu hoàn thiện, biên bản xác minh, 12 E2E, ảnh/video và hồ sơ toàn nhóm.

PDF/QR cơ bản ở Backend giúp BE chạy độc lập, không đồng nghĩa QA-01 → QA-06 đã hoàn tất. Không chỉnh PDF sau khi hash. QR chỉ tra cứu bản ghi; hash trùng không tự chứng minh thành tích học tập hoặc pháp lý.

## 6. Git và review

Repo đích: https://github.com/lucthuan1601/EduCert. Tài khoản thực hiện: NguyenTruongNT, dùng Git identity đã cấu hình trong workspace. Sau khi nhận lời mời cộng tác, đã xác minh quyền push vào repo đích. Sáu nhánh giai đoạn và toàn bộ lịch sử commit được đưa trực tiếp vào repo nhóm, mở PR cùng repo về main để chủ sở hữu đánh giá. PR #7 từ fork là phiên bản trước, được đánh dấu thay thế bằng PR chính.

Mỗi giai đoạn có issue và nhánh theo [BACKEND_PLAN.md](BACKEND_PLAN.md). Commit dùng feat/test/docs/fix(BE): truong - nội dung. Nhánh giai đoạn nối tiếp giữ các mốc; PR cuối tổng hợp toàn bộ phần Backend. Chỉ nhóm review/merge mới xác nhận nghiệm thu chung.

## 7. Xác nhận sau rà soát bổ sung

Đã đối chiếu đầy đủ BE-01 → BE-06 với README mục 4.2. Chi tiết từng tiêu chí và bằng chứng: [BACKEND_REVIEW_CHECKLIST.md](BACKEND_REVIEW_CHECKLIST.md). Phần mã nguồn và kiểm thử Backend của Trường đã đủ để review/tích hợp; chưa thay thế phê duyệt M0, review/merge hoặc nghiệm thu toàn nhóm.

Lượt rà soát tái hiện và sửa hai lỗi: multipart upload hỏng trả 500 và cấu hình storage qua symlink vào public. Bổ sung kiểm tra gửi đồng thời, bảo vệ chủ draft, trạng thái thu hồi trước finalize, public lookup không cần SQLite, retry từ tx chưa biết và PDF mã hóa thật. Bộ Backend tăng lên 40 test, cộng 20 contract tests là 60 test.

## 8. Chỉnh sửa theo review PR #8

Nhận xét của trggg2185: [draft bị từ chối vẫn giữ txHash, chặn draft đúng](https://github.com/lucthuan1601/EduCert/pull/8#discussion_r4668193012). Đã tái hiện cả trường hợp mới và dữ liệu lỗi lưu từ phiên bản trước: draft đúng nhận 409 thay vì 200.

- Khi finalize xác định TX_MISMATCH, EVENT_MISMATCH, TX_FAILED hoặc CHAIN_STATE_MISMATCH, ghi FAILED/errorCode và đặt txHash = null. Draft đúng có thể dùng giao dịch đó; draft nhập nhầm vẫn có thể hoàn tất bằng giao dịch riêng của nó.
- Dọn liên kết FAILED cũ thuộc bốn lỗi này ngay trong transaction SQLite trước khi gắn tx. Không cần xóa database, chạy migration mới hoặc sửa chain.
- Giữ liên kết khi receipt đang chờ, RPC_ERROR hoặc TX_NOT_FOUND. Bản ISSUED/REVOKED vẫn giữ txHash; không được thay hoặc dùng lại cho draft khác.
- Frontend giữ nguyên endpoint/payload. Sau lỗi dứt điểm, gọi GET /drafts/:id để lấy trạng thái FAILED, errorCode và txHash = null; tham khảo bảng lỗi mới trong INTERFACE_CONTRACT.md.

Kiểm chứng sau sửa: typecheck Backend/client mẫu và build PASS; 42 Backend/API + 20 contract tests PASS, 0 fail, 0 skip. Hai test hồi quy mới kiểm nhập nhầm giao dịch và khôi phục liên kết FAILED cũ qua restart. Các test RPC/pending/TX_NOT_FOUND được tăng kiểm tra để bảo đảm không giải phóng nhầm liên kết chưa có kết luận.
