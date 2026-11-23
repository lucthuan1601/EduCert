# Xác nhận hoàn thành phần Backend của Nguyễn Văn Trường

Đối chiếu với README mục 4.2, BE-01 → BE-06. Người thực hiện: Nguyễn Văn Trường (2351170625), tài khoản GitHub NguyenTruongNT. Ngày rà soát: 23/11/2026.

## 1. Kết luận phạm vi cá nhân

Đã hoàn thành mã nguồn, API, kiểm thử và tài liệu bàn giao cho cả sáu đầu việc Backend. Các thành viên có thể bắt đầu tích hợp Frontend/PDF/E2E. Trạng thái này không tự xác nhận review/merge, phê duyệt M0 của 4/4 thành viên hoặc nghiệm thu toàn bộ đề tài.

| Nhiệm vụ | Tiêu chí đã kiểm | Mã nguồn / bằng chứng | Kết quả |
| --- | --- | --- | --- |
| BE-01 | Express/TypeScript; SQLite migration, CertificateFile, nonce/session; dùng ABI/address/chainId chung | backend/src/config.ts, database.ts, migrate.ts; build/typecheck; SQLite thật trong tests | Hoàn thành |
| BE-02 | Nonce ngẫu nhiên gắn ví/domain/chain, hết hạn và dùng một lần; verifyMessage; cookie HttpOnly; role đọc lại on-chain | auth.ts; BE-01/02/03; session, CSRF, Origin và nonce đồng thời | Hoàn thành |
| BE-03 | PDF nằm ngoài public; MIME/magic bytes/5 MiB; storage key nội bộ; tải chỉ Student/Issuer gốc/Admin; hash byte tải lại | storage.ts, routes/files.ts; BE-04/05/06/09/10, tamper, Admin/Issuer và public alias tests | Hoàn thành |
| BE-04 | ID CSPRNG 32 byte; PDF có QR trước SHA-256; draft chỉ chủ đọc; finalize kiểm mạng/contract/sender/receipt/event và state | pdf.ts, routes/drafts.ts, chain.ts, finalize.ts; pending/revert/wrong sender/contract/hash/student/event | Hoàn thành |
| BE-05 | Public metadata không PII; danh sách theo ví session; stats từ chain; event phân trang; RPC_ERROR tách NOT_FOUND | routes/queries.ts; public/list/stats/events/RPC tests, public không phụ thuộc SQLite | Hoàn thành |
| BE-06 | Giữ txHash/PENDING_CHAIN khi RPC lỗi; retry idempotent qua restart; không yêu cầu ký lại; 10 tình huống BE và log | BE-01 → BE-10 đều có; thêm 32 test; reconcile:pending; logs và workflow CI | Hoàn thành |
| Bàn giao tích hợp | Định nghĩa API, payload, lỗi, phân quyền và ví dụ client để FE dùng | INTERFACE_CONTRACT.md, BACKEND_HANDOFF_NGUYEN_VAN_TRUONG.md, examples/frontend-api.ts | Hoàn thành |
| Git/review | Commit theo công việc, issue/nhánh từng giai đoạn, PR có mô tả và bằng chứng | 6 issue, 6 nhánh giai đoạn; giữ 6 commit gốc và commit rà soát; PR đích main repo nhóm | Đã chuẩn bị để chủ sở hữu review |

## 2. Kiểm tra nghiệp vụ quan trọng

- Không thay contract/ABI và không lưu PDF/PII trên chain.
- Backend không có signer giữ khóa riêng; MetaMask ký issue/revoke ở Frontend.
- Admin không mặc nhiên là Issuer; tạo draft cần ISSUER_ROLE hiện tại.
- Finalize chỉ chủ draft thực hiện; chấp nhận chứng cứ phát hành hợp lệ ngay cả khi role đã bị gỡ sau giao dịch.
- Thu hồi không xóa tệp/lịch sử; public lookup và danh sách kiểm chain thay vì tin trạng thái SQLite đơn lẻ.
- Public lookup không cần ví hoặc bản ghi off-chain; PDF phải được băm riêng trước khi kết luận toàn vẹn.
- Frontend nhận đủ 16 endpoint, gồm 11 nghiệp vụ theo README và 5 endpoint hỗ trợ.
- Cookie cần cùng hostname và credentials:include; POST cần CSRF; request Origin ngoài cấu hình bị chặn.

## 3. Các sửa lỗi sau rà soát

| Vấn đề đã tái hiện | Hành vi sau sửa | Bằng chứng |
| --- | --- | --- |
| Multipart không đóng boundary trả 500 INTERNAL_ERROR | 400 UPLOAD_ERROR; vẫn giữ nguyên 413 cho quá dung lượng và lỗi validation khác | Test malformed multipart |
| Storage đi qua symlink vào public được chấp nhận; tên ..private bị nhầm là đi lên thư mục cha | Kiểm cả đường dẫn logic và realpath, phân biệt thành phần .. chính xác | Test symlink/public alias và ..private |
| Review PR #8: nhập nhầm txHash vào draft khác để lại liên kết FAILED, khiến draft đúng bị TX_ALREADY_USED | Giải phóng liên kết bị từ chối dứt điểm, dọn cả dữ liệu FAILED cũ; giữ pending/RPC_ERROR/TX_NOT_FOUND và bản đã xác nhận | Hai test hồi quy mới đã thất bại trước sửa và đạt sau sửa; tăng assertion trong các test pending/RPC/unknown/revert |

Lệnh kiểm chứng: `npm --prefix backend run verify`. Kết quả local: typecheck Backend/client mẫu/build PASS, 20 contract + 42 Backend tests PASS, không skip. Logs cập nhật tại docs/evidence. CI phải được kiểm trên đúng HEAD của PR; liên kết và trạng thái được ghi trong mô tả PR.

## 4. Việc toàn nhóm còn cần làm

Frontend và tương tác MetaMask trên trình duyệt thật, mẫu PDF hoàn thiện/biên bản, 12 ca UI/E2E, kiểm QR trên điện thoại và hồ sơ nghiệm thu chung vẫn cần các thành viên phụ trách thực hiện cùng nhau. Trường cần hỗ trợ sửa vấn đề tích hợp nếu phát sinh và phản hồi review; đây là công việc phối hợp sau bàn giao, không phải chức năng Backend đang thiếu trong BE-01 → BE-06.
