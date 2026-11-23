# PDF fixtures

encrypted-demo.pdf là PDF tổng hợp một trang chứa dòng “EduCert encrypted demo fixture. No personal data.”, được mã hóa AES-256 bằng PyMuPDF để kiểm API từ chối PDF mã hóa trước khi lưu. Không chứa dữ liệu sinh viên hoặc tài liệu thật.

Mật khẩu fixture công khai, chỉ phục vụ test: user educert-test-reader, owner educert-test-owner. Không phải thông tin xác thực của ứng dụng. Node tests đọc fixture có sẵn nên CI không cần Python/PyMuPDF.
