# Kế hoạch Backend — Nguyễn Văn Trường

Người thực hiện: Nguyễn Văn Trường, MSSV 2351170625. Phạm vi BE-01 → BE-06 theo README mục 4.2. Đích tích hợp là Hardhat local, chainId 31337; giữ nguyên ABI của CertificateRegistry.

| Giai đoạn | Issue | Nhánh | Sản phẩm và điều kiện nghiệm thu |
| --- | --- | --- | --- |
| BE-01 | #1 | `feature/BE-01-backend-foundation` | Express/TypeScript, SQLite có migration, cấu hình chung, đặc tả API |
| BE-02 | #2 | `feature/BE-02-wallet-auth` | Nonce một lần, xác minh chữ ký, session HttpOnly, CSRF và kiểm tra role on-chain |
| BE-03 | #3 | `feature/BE-03-private-storage` | Kho PDF riêng tư, kiểm tra loại/dung lượng, đọc ghi an toàn, tải đúng quyền |
| BE-04 | #4 | `feature/BE-04-draft-finalize` | PDF/QR trước SHA-256, preview, draft, receipt/event/state reconciliation |
| BE-05 | #5 | `feature/BE-05-query-api` | Tra cứu public không PII, danh sách cá nhân, thống kê và event phân trang |
| BE-06 | #6 | `feature/BE-06-tests-handoff` | Retry, 10 tình huống BE và kiểm tra bổ sung, CI, hướng dẫn và bàn giao Frontend |

Các nhánh được tạo nối tiếp để giữ phụ thuộc giữa các giai đoạn. PR cuối tổng hợp các commit về `main`; mỗi nhánh giai đoạn giữ mốc tương ứng để nhóm review. Quy ước commit: `feat(BE): truong - ...`, `test(BE): truong - ...`, `docs(BE): truong - ...`, `fix(BE): truong - ...`.

Sau khi tài khoản NguyenTruongNT nhận quyền write, các nhánh được push trực tiếp lên repo nhóm. Giữ nguyên 6 commit giai đoạn, thêm commit sửa lỗi và tài liệu rà soát; PR cùng repo thay thế PR fork #7. Không push thẳng main hoặc tự merge.

## Các ràng buộc phải giữ

- Không lưu PDF, họ tên, tên khóa học hoặc lý do thu hồi dạng tự do lên chain.
- Không giữ private key/seed phrase của Issuer ở Backend.
- ID ngẫu nhiên mật mã 32 byte. SHA-256 tính trên byte PDF cuối đã có QR.
- PDF tối đa 5 MiB ở cả đầu vào và đầu ra; không ghi đè PDF đã phát hành.
- Chỉ Student sở hữu, Issuer gốc hoặc Admin tải được chứng chỉ; preview draft chỉ thuộc Issuer tạo draft.
- Blockchain quyết định trạng thái hiệu lực; lỗi RPC là `RPC_ERROR`, không phải `NOT_FOUND`.
- `finalize` phải kiểm receipt, mạng, contract, event, ID/hash/issuer/student và trạng thái contract; gọi lại không phát hành trùng.

## Phối hợp và đánh giá

Thuận cung cấp contract/config và môi trường local. Thế Trưởng sử dụng API trong `INTERFACE_CONTRACT.md` và ví để ký giao dịch. Tùng tiếp tục phụ trách mẫu PDF/biên bản và E2E; Backend cung cấp bộ tạo/stamp PDF cơ bản để kiểm thử luồng mà không chờ giao diện.

Các tài liệu do Trường chuẩn bị là đề xuất tích hợp cụ thể để nhóm review; không tự ghi nhận đã có phê duyệt M0 của 4/4 thành viên. Bằng chứng cuối ghi trong `BACKEND_HANDOFF_NGUYEN_VAN_TRUONG.md` và `TEST_RESULTS.md`.
