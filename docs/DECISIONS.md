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
