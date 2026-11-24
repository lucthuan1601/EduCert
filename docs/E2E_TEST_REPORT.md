# Biên bản kiểm thử End-to-End EduCert (QA-03)

Người thực hiện: Hoàng Tùng (2351170630). Danh mục theo **Bảng 25, Phụ lục A**.

## Môi trường của lần chạy được ghi nhận

| Mục | Giá trị |
| --- | --- |
| Thời điểm chạy | 24/11/2026, bắt đầu `2026-11-24T05:02:10Z`, thời lượng 32,1 s |
| Hệ điều hành / Node.js | Windows 11 x64 / Node.js v24.22.0 |
| Trình duyệt | Google Chrome (Playwright 1.57.0, `PW_CHANNEL=chrome`), headless |
| Mạng | Hardhat node local, chainId 31337, port 8546 |
| Hợp đồng | `0x5FbDB2315678afecb367f032d93F642f64180aa3` (deploy mới cho lần chạy) |
| Mã nguồn | nhánh `feature/QA-03-e2e-demo-data` (xây trên QA-01 `b6e510c`, QA-02 `9a55edc`) |
| Lệnh | `npm --prefix e2e test` |
| Kết quả | **13/13 PASS**, 0 skip, 0 flaky — [`e2e-results.json`](evidence/e2e/e2e-results.json) |

Bộ test dùng ví EIP-1193 tự động thay MetaMask (chi tiết trong [e2e/README.md](../e2e/README.md#ví-thay-cho-metamask)); mọi chữ ký và giao dịch vẫn do Hardhat node ký và ghi lên chain thật của lần chạy.

## Kết quả theo ca

| ID | Kịch bản | Kết quả kỳ vọng | Cách kiểm | Kết quả |
| --- | --- | --- | --- | --- |
| E2E-01 | Admin → Issuer → Student → Verifier | Đi hết quy trình, đúng vai trò | Admin cấp `ISSUER_ROLE` cho ví #4 tại `/admin`; ví #4 tạo PDF mẫu, đối chiếu SHA-256, ký phát hành, backend finalize; Student tải PDF; Verifier không ví đối chiếu PDF | PASS |
| E2E-01b | (bổ sung) Chế độ upload PDF + từ chối ký | Bản mới có trang QR; từ chối không gửi giao dịch | Ví #1 upload PDF nguồn, lần ký đầu bị từ chối (`4001`) → thông báo "Bạn đã từ chối yêu cầu trong ví.", lần hai thành công; PDF tải về 2 trang, QR đúng | PASS |
| E2E-02 | Tra cứu public không ví | Đọc được bản ghi on-chain | Context không có `window.ethereum`, nhập ID ở `/verify` → `REGISTERED_ACTIVE`, đúng ví issuer | PASS |
| E2E-03 | Quét QR từ PDF | Mở đúng `/verify/{certificateId}` | Giải mã QR từ ảnh nhúng trong PDF đã tải (jsQR) → URL đúng; mở URL hiển thị bản ghi | PASS |
| E2E-04 | Kiểm tra PDF gốc | Hash trùng và chưa thu hồi | Chọn PDF đã tải → "Mã băm trùng khớp." + "đang hiệu lực" | PASS |
| E2E-05 | Kiểm tra PDF đã sửa | `FILE_HASH_MISMATCH` | Thêm một dòng chữ vào trang chứng chỉ rồi lưu; `verifyCertificate` trả 3; UI báo "Mã băm PDF không khớp." | PASS |
| E2E-06 | Kiểm tra sau thu hồi | `REVOKED` | Issuer thu hồi tại `/revoke` (lý do 1); Verifier thấy `REVOKED`; chọn PDF đã sửa → hiển thị **đồng thời** thu hồi và sai hash; biên bản ghi `REVOKED` + `FILE_HASH_MISMATCH` | PASS |
| E2E-07 | Chỉ nhập ID | Không tự kết luận PDF đã kiểm tra | "Chưa đối chiếu tệp PDF."; không có "Mã băm trùng khớp"; biên bản ghi `NOT_CHECKED` | PASS |
| E2E-08 | Xuất biên bản | Có thời gian, chainId, ID, trạng thái | Nút "Tải biên bản PDF" → PDF chứa certificateId, chainId 31337, contract, `checkedAt` UTC, `REGISTERED_ACTIVE`, `MATCH`, câu chú thích pháp lý | PASS |
| E2E-09 | Dashboard | issued = active + revoked | `/dashboard` hiển thị 2 = 1 + 1, khớp `getStats()`; `/history` có 2 phát hành, 1 thu hồi, không có tên sinh viên | PASS |
| E2E-10 | Sai mạng hoặc mất RPC | `RPC_ERROR` rõ ràng | Chặn `/rpc` → `data-status="RPC_ERROR"`, không hiện "Không tìm thấy"; ví ở chainId 1 → "Ví đang ở sai mạng", chuyển mạng được; từ chối ký đăng nhập; ví không quyền → `ISSUER_REQUIRED` 403 và trang admin bị chặn | PASS |
| E2E-11 | Student khác ví | Không xem/tải chứng chỉ người khác | Ví #3: danh sách rỗng; gọi download → 403 `FORBIDDEN`; không đăng nhập → 401 | PASS |
| E2E-12 | Tải lại tệp và tính hash | Giữ đúng mã băm đã đăng ký | Tải lại sau thu hồi: byte trùng bản tải lần đầu, SHA-256 Node = Web Crypto trình duyệt = `fileHash` on-chain | PASS |

## Dữ liệu chain của lần chạy

| Sự kiện | certificateId | txHash | Khối |
| --- | --- | --- | --- |
| ISSUED (mẫu) | `0x38f9c964…ee260a` | `0x1d4f40c5…746ebd` | 4 |
| ISSUED (upload) | `0x06279a33…7fd345` | `0xc0ca5795…288f7f` | 5 |
| REVOKED | `0x38f9c964…ee260a` | `0x3794d492…5c15d9` | 6 |

Giá trị đầy đủ trong [`run-summary.json`](evidence/e2e/run-summary.json). Các ID thay đổi ở mỗi lần chạy vì `certificateId` sinh bằng CSPRNG.

## Bộ tệp minh chứng (Mục 4.8)

- PDF chứng chỉ mẫu có QR: [`certificate-valid.pdf`](evidence/e2e/certificate-valid.pdf); bản upload có trang QR: [`certificate-upload-mode.pdf`](evidence/e2e/certificate-upload-mode.pdf)
- PDF đã bị sửa nội dung: [`certificate-tampered.pdf`](evidence/e2e/certificate-tampered.pdf)
- Biên bản xác minh: [chỉ ID](evidence/e2e/verification-report-id-only.pdf), [PDF hợp lệ](evidence/e2e/verification-report-valid.pdf), [đã thu hồi + PDF sửa](evidence/e2e/verification-report-revoked-tampered.pdf)
- Ảnh chụp giao diện theo luồng: [`screenshots/`](evidence/e2e/screenshots/) (01 cấp quyền → 18 sinh viên sau thu hồi)

Ảnh `02-issuer-draft-preview.png` hiển thị khung xem trước PDF màu tối vì Chrome headless không có trình xem PDF tích hợp; trong trình duyệt thường khung hiển thị chứng chỉ.

## Kiểm tra thủ công bổ sung

Các mục dưới đây không tự động hóa được trong CI và **chưa có kết quả** trong biên bản này. Người chạy demo điền khi thực hiện:

| Mục | Cách làm | Kết quả / ảnh |
| --- | --- | --- |
| MetaMask thật: ký đăng nhập, phát hành, từ chối, sai mạng | Theo [frontend/README.md](../frontend/README.md#thử-theo-từng-vai-trò) | _chưa thực hiện_ |
| Quét QR bằng camera điện thoại | Đặt `PUBLIC_APP_URL` = IP LAN, chạy Vite `--host 0.0.0.0`, tạo PDF mới, quét bằng điện thoại | _chưa thực hiện_ |
| Tắt hẳn Hardhat node khi đang mở trang | Dừng terminal 1, bấm "Tra cứu lại" | _chưa thực hiện_ |
