# EduCert — API Backend dành cho Frontend

Người phụ trách: Nguyễn Văn Trường (2351170625). Đây là giao diện tích hợp cụ thể để nhóm review, triển khai trong backend/src. Giữ nguyên ABI CertificateRegistry.

## 1. Kết nối và định dạng

- Base URL: `http://localhost:3001/api/v1`. Frontend mặc định `http://localhost:5173`, cấu hình bằng PUBLIC_APP_URL trong backend/.env.
- Dùng cùng hostname cho FE/BE: cùng localhost hoặc cùng IP LAN; không trộn localhost và 127.0.0.1 khi dùng cookie.
- Mọi fetch dùng `credentials: 'include'`. POST sau đăng nhập cần `X-CSRF-Token` từ auth/verify hoặc auth/me.
- Cookie educert_session là HttpOnly, SameSite=Lax. JavaScript không đọc cookie. Backend không giữ khóa ví.
- JSON camelCase; ví checksum; ID/hash/txHash là `0x` + 64 ký tự hex, chuẩn hóa chữ thường. Thời gian là ISO 8601 UTC.
- Thành công: `{success:true,data:...}`. Lỗi: `{success:false,error:{code,message}}`.
- Preview/download thành công trả byte application/pdf; lỗi vẫn trả JSON. Header X-File-Hash chứa hash tham chiếu và được expose qua CORS.
- Cấu hình contract cùng nguồn config/contract-config.json. `/config` không công khai RPC_URL; FE cấu hình RPC riêng, ví dụ VITE_RPC_URL.

## 2. Danh sách API

Các đường dẫn đều sau /api/v1. Session là ví đã ký đăng nhập.

| Method | Đường dẫn | Quyền | Thành công |
| --- | --- | --- | --- |
| GET | `/health` | Public | 200: `{status:"ok"}`; kiểm tiến trình, không chứng minh RPC hoạt động |
| GET | `/config` | Public | 200: `{chainId,contractAddress,abi,publicAppUrl,maxPdfBytes}` |
| POST | `/auth/nonce` | Public, rate limit | 201: challenge |
| POST | `/auth/verify` | Chữ ký hợp lệ | 200: cookie và phiên |
| GET | `/auth/me` | Session | 200: phiên và roles hiện tại |
| POST | `/auth/logout` | Session + CSRF | 200: `{loggedOut:true}` |
| POST | `/drafts/generate` | Session + CSRF + Issuer hiện tại | 201: draft |
| POST | `/drafts/upload` | Session + CSRF + Issuer hiện tại | 201: draft |
| GET | `/drafts/:id` | Issuer tạo draft | 200: draft |
| GET | `/drafts/:id/preview` | Issuer tạo draft | 200: PDF cuối, inline |
| POST | `/certificates/:id/finalize` | Issuer tạo draft + CSRF | 200: ISSUED/REVOKED; 202: PENDING_CHAIN |
| GET | `/certificates/:id/public` | Public, không cần ví | 200: dữ liệu chain; 404: NOT_FOUND |
| GET | `/certificates/:id/download` | Session; Student sở hữu / Issuer gốc / Admin | 200: PDF attachment |
| GET | `/me/certificates` | Session | 200: danh sách của ví phiên |
| GET | `/stats` | Public | 200: counters chain |
| GET | `/events` | Public | 200: event phân trang |

Giữ 11 endpoint nghiệp vụ theo README; 5 endpoint hỗ trợ là health, config, auth/me, auth/logout và preview.

## 3. Đăng nhập

POST auth/nonce nhận `{wallet:"<ví hợp lệ>"}`, trả data `{wallet,nonce,message,expiresAt}`. Gửi **nguyên message từ Backend** vào signer.signMessage(message). Message gắn domain, URI, chainId, ví, nonce và thời hạn; đây là chữ ký đăng nhập EIP-191, không phải giao dịch.

POST auth/verify nhận `{wallet,nonce,signature}`, trả data `{wallet,csrfToken,expiresAt}` và Set-Cookie. Nonce mặc định 5 phút, một lần; phiên mặc định 8 giờ. Auth giới hạn 60 yêu cầu/phút/IP cho mỗi instance.

GET auth/me trả thêm `roles:{admin:boolean,issuer:boolean}` đọc lại trên chain. Khi reload trang, dùng endpoint này khôi phục phiên/CSRF. Đổi tài khoản trong MetaMask: logout, xóa trạng thái cũ và đăng nhập lại. Kiểm tra chain trước khi ký giao dịch.

## 4. Draft và preview

POST drafts/generate, Content-Type application/json:

```json
{
  "studentWallet":"<ví sinh viên>",
  "studentName":"Nguyễn Văn A",
  "courseName":"Blockchain Fundamentals",
  "issuerName":"Demo University",
  "issuedDate":"2026-11-23"
}
```

Ba trường đầu bắt buộc. Tên sinh viên tối đa 120, khóa học 200, tên đơn vị 120 ký tự. issuerName mặc định Demo University. issuedDate tùy chọn, ngày YYYY-MM-DD hợp lệ, mặc định ngày UTC hiện tại; đây là ngày trong PDF, khác thời gian giao dịch chain. Không nhận issuerWallet do client khai.

POST drafts/upload dùng FormData, file ở trường **file**, các trường metadata giống generate. Không tự đặt Content-Type của FormData. PDF phải có MIME application/pdf, magic bytes %PDF-, đọc được, không mã hóa hoặc có chữ ký số sẵn. Tối đa 5 MiB cho cả đầu vào và đầu ra. Bản mới có trang phụ lục QR; không ghi đè nguồn.

Draft data:

```ts
{
  certificateId: string; studentWallet: string; issuerWallet: string;
  studentName: string; courseName: string; fileHash: string; fileSize: number;
  txHash: string | null; chainId: number; contractAddress: string;
  syncState: 'DRAFT' | 'PENDING_CHAIN' | 'ISSUED' | 'FAILED' | 'REVOKED';
  errorCode: string | null; createdAt: string; updatedAt: string;
  verifyUrl: string; previewUrl: string;
}
```

PreviewUrl có dạng `/api/v1/drafts/<id>/preview`, là đường dẫn từ **origin Backend**, đã chứa /api/v1. Fetch với cookie, đọc Blob để xem trước và băm SHA-256. Hash phải khớp fileHash trước khi ký. Không sửa PDF sau khi hash.

## 5. Ký phát hành và finalize

FE lấy ABI/address/chainId từ config, kiểm tra ví ký bằng issuerWallet, kiểm đúng mạng, rồi gọi:

```ts
const contract = new Contract(config.contractAddress, config.abi, signer);
const tx = await contract.issueCertificate(draft.certificateId, draft.fileHash, draft.studentWallet);
// Giữ ID + tx.hash để tiếp tục sau reload, không giữ PII trong localStorage.
await tx.wait();
const result = await api.finalize(draft.certificateId, tx.hash);
```

POST certificates/:id/finalize nhận `{txHash}`. Backend kiểm mạng, contract, sender, receipt status, event, ID/hash/issuer/student và trạng thái contract. Không nhận receipt/success do FE tự khai. Trả metadata riêng như draft, không bổ sung verifyUrl/previewUrl.

| Kết quả | Ý nghĩa và cách xử lý |
| --- | --- |
| 200 ISSUED | Đã đối soát thành công |
| 200 REVOKED | Giao dịch cấp hợp lệ, chứng chỉ hiện đã thu hồi; hiện cảnh báo |
| 202 PENDING_CHAIN | Đã biết giao dịch nhưng chưa có receipt; gọi lại cùng ID/txHash |
| 503 RPC_ERROR | Giữ PENDING_CHAIN + txHash; đợi RPC rồi gọi lại, không ký lại |
| 400 TX_NOT_FOUND | Node chưa biết giao dịch hoặc hash giả; ghi FAILED, có thể thử lại cùng hash khi node nhận giao dịch |
| 409 TX_FAILED / TX_MISMATCH / EVENT_MISMATCH / CHAIN_STATE_MISMATCH | Không công nhận phát hành; kiểm nguyên nhân, không tự ghi đè hash cũ |

Finalize cần chủ draft và chứng cứ giao dịch hợp lệ; vẫn đối soát được giao dịch đã thành công sau khi Issuer bị tước role. Tạo draft mới luôn kiểm role hiện tại. Gọi lại cùng giao dịch không tăng số đã cấp. Không thay txHash bản đã xác nhận; txHash dùng cho draft khác trả TX_ALREADY_USED.

Nếu chain đã có dữ liệu sai, xử lý thu hồi/cấp lại theo nghiệp vụ; không sửa bản ghi cũ. Vận hành có thể chạy `npm --prefix backend run reconcile:pending` để đối soát tối đa 100 bản chờ/lần, không ký giao dịch.

## 6. Tra cứu công khai

GET certificates/:id/public chỉ đọc chain, kể cả khi SQLite không có bản ghi tương ứng. Trả:

```ts
{
  certificateId: string; chainId: number; contractAddress: string;
  fileHash: string; issuer: string; student: string;
  issuedAt: string; revokedAt: string | null; revokeReasonCode: number;
  exists: true; revoked: boolean; status: 'REGISTERED_ACTIVE' | 'REVOKED';
}
```

Không trả tên sinh viên, khóa học, storageKey hoặc URL tải. Không tồn tại: 404 NOT_FOUND. Lỗi node, sai mạng hoặc không có contract: 503 RPC_ERROR.

Chỉ nhập ID/quét QR: hiện trạng thái bản ghi, chưa kết luận PDF đúng. Chọn PDF: băm tại trình duyệt, không upload đến API; so hash và đồng thời kiểm revoked. Nếu vừa sai hash vừa thu hồi phải hiện cả hai. verifyCertificate trên contract ưu tiên REVOKED nên không tự thể hiện cảnh báo kép.

## 7. Danh sách và tải tệp

GET me/certificates?offset=0&limit=20 trả `{items,total,offset,limit}`. Offset 0–100000, mặc định 0; limit 1–100, mặc định 20. Không nhận wallet trong query. Chỉ lấy các bản đã finalize trong DB thuộc ví phiên và đúng mạng/contract, kiểm lại trạng thái chain.

Item gồm metadata riêng, thêm issuedAt, revokedAt, revokeReasonCode, downloadUrl. GET downloadUrl cần cookie; Byte PDF được kiểm lại SHA-256 trước khi trả. Draft chưa finalize trả 409 NOT_ISSUED. Chứng chỉ thu hồi vẫn tải được theo quyền để lưu hồ sơ; UI phải hiện trạng thái thu hồi.

## 8. Thống kê và lịch sử

GET stats trả `{chainId,contractAddress,issued,revoked,active}` từ getStats. Active = issued − revoked; contract chưa có ngày hết hạn.

GET events?offset=0&limit=20&type=ALL&fromBlock=0&toBlock=100:

- type: ALL / ISSUED / REVOKED, mặc định ALL. Offset/limit như danh sách.
- fromBlock/toBlock tùy chọn; mặc định tối đa 5000 block gần nhất. Khoảng truyền vào phải đã được mine, có thứ tự và tối đa 5000 block.
- Trả `{chainId,contractAddress,items,total,offset,limit,fromBlock,toBlock,previousToBlock,nextFromBlock}`.
- Mới nhất trước theo blockNumber/logIndex. Giữ toBlock khi chuyển trang; dùng previousToBlock để đọc cửa sổ cũ hơn.
- Item chung: `{type,certificateId,txHash,blockNumber,blockHash,logIndex}`.
- ISSUED thêm `{issuer,student,fileHash,issuedAt}`; REVOKED thêm `{revokedBy,revokeReasonCode,revokedAt}`.
- Chỉ hai sự kiện chứng chỉ; không gộp RoleGranted/RoleRevoked và không có PII.

## 9. Mã lỗi

| HTTP | Code tiêu biểu |
| --- | --- |
| 400 | VALIDATION_ERROR, INVALID_JSON, INVALID_PDF, FILE_REQUIRED, UPLOAD_ERROR, SIGNED_PDF_UNSUPPORTED, INVALID_BLOCK_RANGE |
| 401 | UNAUTHENTICATED, SESSION_EXPIRED, NONCE_INVALID, SIGNATURE_INVALID |
| 403 | FORBIDDEN, ISSUER_REQUIRED, CSRF_INVALID, ORIGIN_NOT_ALLOWED |
| 404 | NOT_FOUND, ROUTE_NOT_FOUND |
| 409 | NOT_ISSUED, TX_ALREADY_BOUND, TX_ALREADY_USED, TX_FAILED, TX_MISMATCH, EVENT_MISMATCH, CHAIN_STATE_MISMATCH |
| 413 | FILE_TOO_LARGE, REQUEST_TOO_LARGE |
| 429 | RATE_LIMITED |
| 503 | RPC_ERROR, STORAGE_UNAVAILABLE, FILE_INTEGRITY_ERROR |
| 500 | INTERNAL_ERROR |

401: đăng nhập lại; 403: kiểm ví/role/CSRF/origin; 503: hiện lỗi hạ tầng hoặc toàn vẹn, không kết luận chứng chỉ giả. API trả message để hỗ trợ chẩn đoán; FE có thể ánh xạ code sang thông báo tiếng Việt.

Admin cấp/tước role và Issuer/Admin thu hồi qua MetaMask gọi contract trực tiếp. Backend cập nhật thu hồi khi đọc danh sách/tải hoặc finalize lại; public verification luôn đọc chain.

Client TypeScript dùng lại: [examples/frontend-api.ts](examples/frontend-api.ts). Luồng tích hợp: đăng nhập → draft → preview/hash → ký → finalize → Student tải → public kiểm tra → thu hồi và kiểm tra lại.
