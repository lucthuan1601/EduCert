# Quyết định tích hợp Backend

Đây là các quyết định triển khai được đề xuất trong PR Backend để nhóm review, không phải biên bản đã duyệt M0.

| Mã | Quyết định | Lý do |
| --- | --- | --- |
| BE-D01 | Giữ Hardhat 2 đang có, Solidity 0.8.20 và ABI hiện tại | Bộ 20 contract tests chạy được trên Node 22.17.0; báo cáo nhắc Hardhat 3 cần nhóm cập nhật riêng |
| BE-D02 | Một nguồn contract-config; RPC_URL chỉ chọn node, không tự thay address/chain | Tránh FE/BE đọc nhầm mạng |
| BE-D03 | API camelCase, ví checksum, ID/hash hex thường, thời gian ISO UTC | Khóa định dạng tích hợp |
| BE-D04 | Cookie HttpOnly, SameSite=Lax, CSRF token và Origin allowlist | Bảo vệ thao tác API qua trình duyệt |
| BE-D05 | Upload PDF tạo bản mới có trang xác minh QR bổ sung | Không che nội dung gốc; từ chối PDF mã hóa hoặc đã có chữ ký số |
| BE-D06 | Cung cấp PDF adapter cơ bản và font tiếng Việt có giấy phép | Cho phép Backend chạy độc lập; Tùng có thể thay mẫu theo giao diện adapter |
| BE-D07 | Finalize yêu cầu chủ draft và chứng cứ on-chain; không yêu cầu vẫn giữ issuer role để đối soát giao dịch đã thành công | Khôi phục được giao dịch hợp lệ sau khi role thay đổi; tạo draft mới vẫn kiểm tra issuer role hiện tại |
| BE-D08 | Preview draft chỉ Issuer tạo draft; download chứng chỉ đối chiếu chain và quyền | Không công khai PII hoặc bản nháp |
| BE-D09 | Event API giới hạn cửa sổ tối đa 5000 block, có phân trang và trả mốc block | Truy vấn hữu hạn; FE có thể lần lượt đọc các cửa sổ |
| BE-D10 | Giữ nhánh giai đoạn nối tiếp; sau khi nhận quyền write, push trực tiếp các nhánh vào lucthuan1601/EduCert và mở PR cùng repo về main | Giữ đủ 6 commit gốc và các commit rà soát bổ sung; PR fork #7 được thay thế bằng PR chính |
| BE-D11 | Multipart hỏng trả 400 UPLOAD_ERROR; xác minh cả đường dẫn logic và realpath của kho PDF | Rà soát đã tái hiện lỗi 500 cho multipart và symlink vào public; kiểm tra đường dẫn phải nhận đúng thành phần .. thay vì tên bắt đầu bằng .. |
| BE-D12 | Giải phóng txHash khi finalize xác định TX_MISMATCH, EVENT_MISMATCH, TX_FAILED hoặc CHAIN_STATE_MISMATCH; giữ trạng thái FAILED/errorCode | Nhận xét review PR #8 phát hiện nhập nhầm tx của draft khác có thể chặn draft đúng. Dọn cả liên kết FAILED cũ trong transaction gắn tx; không giải phóng pending, RPC_ERROR, TX_NOT_FOUND hoặc bản đã xác nhận |
| QA-D01 | Mẫu PDF chính dùng `TemplatePdfAdapter` (A4 ngang, QR góc phải dưới); `DefaultPdfAdapter` giữ lại làm adapter dự phòng | Thay mẫu theo đúng giao diện adapter của BE-D06, không đổi API; QR vẫn được vẽ trước `doc.save()` nên hash luôn tính trên byte cuối |
| QA-D02 | Kiểm tra QR và chữ tiếng Việt bằng cách đọc trực tiếp PDF đã lưu (jsQR trên image XObject, pdf.js cho ToUnicode) | Tự động hóa kiểm tra thủ công PyMuPDF/OpenCV trước đây; chạy được trong CI không cần Python |
