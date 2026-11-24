# EduCert E2E, dữ liệu demo và đo đạc (QA-03, QA-05)

Người phụ trách: Hoàng Tùng (2351170630).

Bộ kiểm thử chạy **giao diện thật** (React/Vite), **Backend thật** (Express, SQLite, kho PDF riêng) và **hợp đồng thật** trên một Hardhat node riêng. Mỗi lần chạy tự khởi động một stack độc lập, không đụng tới node `8545`, backend `3001` hay frontend `5173` đang dùng để demo:

| Thành phần | Cổng E2E | Biến đổi cổng |
| --- | --- | --- |
| Hardhat node (chainId 31337) | `8546` | `E2E_RPC_PORT` |
| Backend `/api/v1` | `3101` | `E2E_BACKEND_PORT` |
| Frontend Vite | `5175` | `E2E_FRONTEND_PORT` |

Hợp đồng được deploy mới, ví #1 được cấp `ISSUER_ROLE`; SQLite, kho PDF và log nằm trong `e2e/.tmp/` (không commit).

## Cài đặt

Cài root, backend và frontend như README chính, sau đó:

```powershell
npm.cmd --prefix e2e ci
```

Playwright cần một trình duyệt Chromium. Chọn **một** cách:

- Dùng Chrome hoặc Edge đã cài: đặt `$env:PW_CHANNEL = 'chrome'` (hoặc `'msedge'`) trước khi chạy.
- Hoặc tải Chromium của Playwright một lần: `npx.cmd --prefix e2e playwright install chromium`.

## Chạy

```powershell
npm.cmd --prefix e2e test          # 13 test: E2E-01 → E2E-12 (+ E2E-01b chế độ upload)
npm.cmd --prefix e2e run measure   # QA-05: thời gian băm PDF và đọc chain
npm.cmd --prefix e2e run report    # mở báo cáo HTML của lần chạy gần nhất
```

Kết quả được ghi vào `docs/evidence/e2e/`: `e2e-results.json` (Playwright), `run-summary.json` (certificateId, txHash, block, ví), ảnh chụp từng bước, PDF chứng chỉ hợp lệ, PDF đã sửa và các biên bản xác minh.

## Ví thay cho MetaMask

Trình duyệt tự động hóa không cài được tiện ích MetaMask, nên `wallet.ts` cài một ví EIP-1193 trong trang. Ví này chuyển `personal_sign`, `eth_sendTransaction` và các lệnh đọc tới Hardhat node, nơi giữ khóa tài khoản phát triển; frontend vẫn chạy đúng mã `ethers.BrowserProvider` như với MetaMask. Ví cho phép test:

- đổi tài khoản (`accountsChanged`) và đổi mạng (`chainChanged`, `wallet_switchEthereumChain`);
- giả lập người dùng bấm **Từ chối** (lỗi `4001`) cho lần ký hoặc giao dịch kế tiếp.

Giới hạn: không kiểm tra giao diện popup của MetaMask và việc quét QR bằng camera điện thoại. Hai mục này thực hiện thủ công theo [biên bản kiểm thử E2E](../docs/E2E_TEST_REPORT.md#kiểm-tra-thủ-công-bổ-sung).

## Dữ liệu demo cho buổi trình diễn

Khi stack demo chính đang chạy (`npx hardhat node`, `npm run deploy:local`, `npm run setup-demo`, `npm run dev:backend`):

```powershell
npm.cmd --prefix e2e run demo-data
```

Script đăng nhập bằng ví #1 (Issuer) qua API thật, tạo PDF từ mẫu cho **Nguyễn Văn A / Blockchain Fundamentals / Demo University**, ký `issueCertificate`, finalize, đăng nhập ví #2 (Student) để tải lại đúng bản đã đăng ký, rồi tạo thêm một bản bị sửa nội dung. Kết quả nằm trong `e2e/.tmp/demo/` (đổi bằng `-- --out <thư mục>`):

- `demo-certificate-valid.pdf` — đối chiếu ra **Mã băm trùng khớp**;
- `demo-certificate-tampered.pdf` — đối chiếu ra **FILE_HASH_MISMATCH**;
- `demo-data.json` — certificateId, liên kết xác minh, txHash, gasUsed.

Đặt `RPC_URL`/`API_URL` nếu stack demo dùng cổng khác. Script chỉ chạy trên chainId 31337.
