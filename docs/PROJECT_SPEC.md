# EduCert v1 — đặc tả tích hợp Backend

Căn cứ: README và báo cáo thiết kế v1. Backend sở hữu BE-01 → BE-06; không thay đổi hợp đồng hoặc mở rộng sang token/NFT/AI/SSO.

Admin cấp role; Issuer chuẩn bị PDF, xem trước và dùng ví ký phát hành; Student đăng nhập bằng chữ ký ví để tải tài liệu; Verifier đọc dữ liệu công khai và băm PDF tại trình duyệt mà không gửi PDF đến API xác minh.

Mạng nghiệm thu là Hardhat local. Dữ liệu mẫu là giả lập. PDF và PII lưu ngoài chuỗi, chỉ công khai metadata kỹ thuật. Tra cứu ID không đồng nghĩa xác minh PDF. Hash khớp không chứng minh thành tích học tập hoặc tư cách pháp lý của tổ chức.

Nghiệm thu Backend: migration, auth, private storage, PDF/QR/hash, đối soát và retry, API public/private, 10 tình huống BE có bằng chứng chạy, tài liệu Frontend. Nghiệm thu toàn nhóm còn cần UI, E2E và hồ sơ do các thành viên phối hợp.
