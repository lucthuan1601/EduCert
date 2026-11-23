# Kết quả kiểm tra Backend EduCert

Ngày kiểm tra: 23/11/2026. Môi trường local: Windows x64, Node.js v22.17.0; compiler Solidity 0.8.20, optimizer runs 200, Hardhat 2 theo lockfile. Không suy diễn các số đo local thành kết quả mạng công khai.

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript Backend | PASS |
| Client TypeScript dành cho Frontend | PASS |
| Build Backend | PASS |
| Smart contract CT-01 → CT-20 | 20 PASS |
| Backend BE-01 → BE-10 bắt buộc | 10 PASS |
| Backend/API bổ sung | 32 PASS |
| Tổng kiểm thử contract + Backend | 62 PASS, không có ca skip |
| PDF tiếng Việt và QR | Render kiểm tra trực quan; lấy lại đúng tên tiếng Việt, giải QR độc lập khớp URL ID |

## Phạm vi bằng chứng

Backend tests thực sự mở Hardhat node ở port trống, deploy CertificateRegistry, cấp role, ký giao dịch bằng ví ngẫu nhiên trong bộ nhớ, tạo PDF thật, gọi Express API, đọc/ghi SQLite và kho riêng. Test retry giữ txHash, đóng/mở lại Backend rồi đối soát; test pending/revert điều khiển mining của node. Không ghi private key vào log.

Các ca bổ sung kiểm signed PDF, CSRF/Origin, phiên hết hạn, preview riêng tư, sai hash/student/contract/sender/event, receipt pending/revert, public không PII, trạng thái thu hồi, thống kê/events, RPC sai mạng/không có contract/node mất kết nối, tệp bị sửa, danh sách cá nhân và chống dùng lại txHash.

Lượt rà soát tiếp theo bổ sung 9 test: multipart hỏng trả 400; kho PDF không được trỏ qua symlink hoặc tên ..private vào public; nonce gửi đồng thời chỉ tạo một phiên; finalize đồng thời không tạo trùng; ví khác không thể gắn tx vào draft; public lookup hoạt động khi SQLite không có record; thu hồi trước finalize trả REVOKED; thay tx chưa biết bằng giao dịch thật; PDF mã hóa AES-256 thật bị từ chối trước khi lưu.

Hai lỗi multipart/symlink đã được tái hiện bằng test thất bại trước sửa, sau đó kiểm hồi quy trong toàn bộ bộ test. Fixture encrypted-demo.pdf hoàn toàn tổng hợp, không chứa PII và không cần Python để chạy CI.

Review PR #8 của trggg2185 phát hiện draft FAILED giữ txHash khi giao dịch không khớp, khiến draft đúng bị chặn. Hai test mới đã tái hiện 409 trước sửa, sau sửa đều đạt: nhập nhầm tx vào draft khác rồi finalize đúng draft; dữ liệu FAILED cũ qua restart không chặn draft đúng. Bộ Backend hiện có 42 test. Các test RPC/pending/TX_NOT_FOUND được tăng assertion để xác nhận vẫn giữ txHash và chặn draft khác; các test sai contract/reverted xác nhận giải phóng txHash. Bản ghi đã xác nhận vẫn được kiểm chống thay hoặc dùng lại tx.

Lệnh tái hiện: `npm --prefix backend run verify` sau npm ci ở root và backend. Không cần MetaMask hoặc node demo; không cần .env cho bộ test. Báo cáo mới được sinh trong backend/reports. Bản log tại thời điểm bàn giao: [evidence](evidence/). summary JSON ghi thời gian UTC, runtime và exit code thực tế; các duration trong log là thời gian runner, không phải benchmark sản phẩm.

PDF được kiểm thêm bằng PyMuPDF/OpenCV trong môi trường phát triển: render một trang, kiểm tên Nguyễn Văn A còn đúng dấu và decode QR khớp chính URL certificateId. Đây là kiểm tra bổ sung thủ công; hai công cụ này không phải dependency chạy Backend. Mẫu dùng kiểm layout chưa đăng ký on-chain.

## Các phần chưa thuộc kết quả này

12 ca UI/E2E, MetaMask trên trình duyệt/điện thoại, responsive, biên bản xác minh và benchmark toàn hệ thống cần các thành viên khác tích hợp. Không ghi các phần này là PASS. Workflow GitHub Actions đã thêm; kết quả CI xem trên PR, không thay thế bằng kết quả local.

Backend dependencies được kiểm bằng npm audit khi cài đặt, không phát hiện lỗ hổng tại thời điểm này. Dependency dev của phần Hardhat gốc có cảnh báo audit đã tồn tại; không chạy cập nhật phá vỡ phiên bản hoặc thay ABI trong phạm vi BE.
