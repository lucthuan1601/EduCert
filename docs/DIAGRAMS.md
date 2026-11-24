# Sơ đồ hệ thống EduCert (QA-04)

Người phụ trách: Hoàng Tùng (2351170630). Các sơ đồ được vẽ lại theo **mã nguồn đã triển khai** (hợp đồng, `backend/src`, `frontend/src`), dùng đánh số hình của báo cáo. GitHub hiển thị trực tiếp các khối Mermaid; bản SVG/PNG để chèn vào báo cáo nằm trong [`docs/diagrams/`](diagrams/) và được sinh lại bằng `npm --prefix e2e run diagrams`.

## Hình 1. Hai mức tra cứu bản ghi và xác minh toàn vẹn tệp PDF

```mermaid
flowchart TD
  start([Người xác minh mở /verify hoặc quét QR]) --> id[Nhập certificateId]
  id --> read{"getCertificate(id) qua RPC chỉ đọc"}
  read -- lỗi mạng / sai chainId / không có contract --> rpc[RPC_ERROR<br/>không kết luận chứng chỉ giả]
  read -- exists = false --> nf[NOT_FOUND]
  read -- exists = true --> level1["Mức 1 · Trạng thái bản ghi<br/>REGISTERED_ACTIVE hoặc REVOKED"]
  level1 --> ask{Có chọn tệp PDF?}
  ask -- không --> nochk["Chưa đối chiếu tệp PDF<br/>(không hiển thị 'PDF đã xác minh')"]
  ask -- có --> hash["Mức 2 · SHA-256 tính trong trình duyệt<br/>crypto.subtle.digest, không gửi tệp lên server"]
  hash --> cmp{hash = fileHash?}
  cmp -- có --> match[Mã băm trùng khớp]
  cmp -- không --> mismatch[FILE_HASH_MISMATCH]
  match & mismatch & nochk --> rev{revoked?}
  rev -- có --> both[Hiển thị thêm cảnh báo THU HỒI<br/>song song với kết quả hash]
  rev -- không --> done[Giữ kết quả]
  both & done --> report["Tải biên bản PDF<br/>GET /certificates/:id/verification-report?fileHash="]
```

## Hình 2. Sơ đồ trường hợp sử dụng của bốn nhóm tác nhân

```mermaid
flowchart LR
  admin["👤 Admin<br/>DEFAULT_ADMIN_ROLE"]
  issuer["👤 Issuer<br/>ISSUER_ROLE"]
  student["👤 Student<br/>ví người nhận"]
  verifier["👤 Verifier<br/>không cần ví"]

  subgraph sys [Hệ thống EduCert]
    direction TB
    subgraph chainOps [Ký bằng ví · ghi on-chain]
      direction TB
      UC1([Cấp / tước ISSUER_ROLE, kiểm tra quyền])
      UC4([Tạo PDF từ mẫu + QR])
      UC5([Upload PDF, thêm trang QR])
      UC6([Xem trước, đối chiếu SHA-256])
      UC7([Ký issueCertificate + finalize])
      UC8([Thu hồi chứng chỉ])
    end
    subgraph common [Dùng chung]
      direction TB
      UC3([Ký đăng nhập bằng nonce])
      UC14([Thống kê và lịch sử sự kiện])
    end
    subgraph publicOps [Truy cập riêng của Student · công khai]
      direction TB
      UC9([Xem chứng chỉ của mình])
      UC10([Tải PDF riêng tư])
      UC11([Tra cứu ID / quét QR])
      UC12([Đối chiếu PDF trong trình duyệt])
      UC13([Xuất biên bản xác minh])
    end
  end

  admin --- UC1 & UC8 & UC3 & UC14
  issuer --- UC4 & UC5 & UC7 & UC8 & UC3 & UC14
  UC4 -. include .-> UC6
  UC5 -. include .-> UC6
  UC6 -. include .-> UC7
  UC11 -. extend .-> UC12
  UC3 --- student
  UC9 --- student
  UC10 --- student
  UC11 --- verifier
  UC12 --- verifier
  UC13 --- verifier
  UC14 --- verifier
```

Admin thu hồi mọi chứng chỉ; Issuer chỉ thu hồi chứng chỉ do chính mình cấp và khi vẫn còn `ISSUER_ROLE` (kiểm tra trong `revokeCertificate`). Tra cứu, đối chiếu, biên bản, thống kê và lịch sử là công khai.

## Hình 3. Kiến trúc tổng thể EduCert theo mô hình On-chain/Off-chain

```mermaid
flowchart LR
  subgraph browser [Trình duyệt]
    ui["React + Vite<br/>8 trang: / verify issue student<br/>revoke admin dashboard history"]
    crypto[Web Crypto SHA-256]
    wallet[MetaMask / ví EIP-1193]
  end

  subgraph vite [Vite dev/preview server]
    proxyApi["/api/v1 → backend"]
    proxyRpc["/rpc → chỉ eth_chainId,<br/>eth_getCode, eth_call"]
  end

  subgraph offchain [Off-chain · Backend Express/TypeScript]
    auth["auth: nonce EIP-191,<br/>session HttpOnly, CSRF, Origin"]
    drafts["drafts + finalize<br/>đối soát receipt/event"]
    pdf["pdf-template (QA-01)<br/>PDF + QR trước khi hash"]
    report["verification-report (QA-02)"]
    queries["public, me, stats, events"]
    db[(SQLite<br/>CertificateFile, nonce, session)]
    store[(Kho PDF private<br/>ngoài thư mục public)]
  end

  subgraph onchain [On-chain · Hardhat / EVM]
    sc["CertificateRegistry<br/>AccessControl<br/>id, fileHash, issuer, student,<br/>issuedAt, revoked…"]
  end

  ui --> crypto
  ui -->|cookie + CSRF| proxyApi --> auth & drafts & queries & report
  ui -->|đọc công khai| proxyRpc --> sc
  ui --> wallet -->|"ký issue / revoke / grantRole"| sc
  drafts --> pdf
  drafts & auth --> db
  drafts --> store
  auth & drafts & queries & report -->|RPC chỉ đọc| sc
```

Backend không giữ khóa ví nên không thể tự phát hành. `config/contract-config.json` là nguồn duy nhất cho ABI, địa chỉ hợp đồng và chainId. Dữ liệu cá nhân (tên, khóa học) chỉ nằm trong SQLite và PDF private; chain chỉ lưu ID, hash, ví và thời gian.

## Hình 4. Vòng đời chứng chỉ: trạng thái blockchain và trạng thái đồng bộ

```mermaid
stateDiagram-v2
  direction LR
  state "On-chain · CertificateRegistry" as chain {
    [*] --> NotExist
    NotExist: Chưa tồn tại (exists = false)
    Active: Đã cấp, hiệu lực
    Revoked: Đã thu hồi (revoked = true)
    NotExist --> Active: issueCertificate(id, hash, student)
    Active --> Revoked: revokeCertificate(id, reasonCode 1–4)
    Revoked --> [*]
  }
  state "Off-chain · CertificateFile.sync_state" as sync {
    [*] --> DRAFT: drafts/generate | upload
    DRAFT --> PENDING_CHAIN: finalize(txHash)
    PENDING_CHAIN --> PENDING_CHAIN: chưa có receipt (202) hoặc RPC_ERROR
    PENDING_CHAIN --> ISSUED: receipt + event + getCertificate khớp draft
    PENDING_CHAIN --> FAILED: TX_FAILED / TX_MISMATCH / EVENT_MISMATCH / CHAIN_STATE_MISMATCH
    FAILED --> PENDING_CHAIN: finalize với txHash đúng
    ISSUED --> REVOKED: đọc chain thấy revoked
  }
```

Trạng thái đồng bộ chỉ phục vụ Backend (danh sách, retry). Kết quả hiệu lực luôn đọc từ chain; `FAILED` do giao dịch sai sẽ giải phóng `txHash` (BE-D12).

## Hình 5. Sơ đồ tuần tự phát hành chứng chỉ và xác thực giao dịch

```mermaid
sequenceDiagram
  autonumber
  actor I as Issuer
  participant FE as Frontend
  participant W as MetaMask
  participant BE as Backend
  participant SC as CertificateRegistry

  I->>FE: Kết nối ví, Ký đăng nhập
  FE->>BE: POST /auth/nonce {wallet}
  BE-->>FE: message (domain, chainId, nonce, hạn)
  FE->>W: personal_sign(message)
  W-->>FE: signature
  FE->>BE: POST /auth/verify
  BE->>SC: hasRole(ISSUER_ROLE, wallet)
  BE-->>FE: Set-Cookie HttpOnly + csrfToken
  I->>FE: Nhập dữ liệu mẫu hoặc upload PDF
  FE->>BE: POST /drafts/generate | /drafts/upload (CSRF)
  BE->>SC: hasRole(ISSUER_ROLE) tại thời điểm tạo
  Note over BE: certificateId = CSPRNG 32 byte<br/>tạo PDF + QR /verify/{id} rồi mới SHA-256<br/>lưu private, sync_state = DRAFT
  BE-->>FE: draft {certificateId, fileHash, previewUrl}
  FE->>BE: GET /drafts/:id/preview
  FE->>FE: SHA-256 bằng Web Crypto = fileHash?
  I->>FE: Ký phát hành
  FE->>W: issueCertificate(id, fileHash, student)
  W->>SC: giao dịch đã ký
  SC-->>W: txHash, event CertificateIssued
  FE->>FE: chờ receipt (status = 1)
  FE->>BE: POST /certificates/:id/finalize {txHash}
  Note over BE: PENDING_CHAIN
  BE->>SC: getTransaction + getTransactionReceipt
  BE->>BE: đúng chainId, contract, sender, event khớp id/hash/issuer/student
  BE->>SC: getCertificate(id) đối chiếu lại
  alt khớp toàn bộ
    BE-->>FE: 200 ISSUED
  else chưa có receipt hoặc RPC lỗi
    BE-->>FE: 202 / 503, giữ PENDING_CHAIN để retry với cùng txHash
  else giao dịch sai
    BE-->>FE: 409 TX_MISMATCH / EVENT_MISMATCH…, FAILED, giải phóng txHash
  end
```

## Hình 6 (bổ sung). Tuần tự xác minh công khai và xuất biên bản

```mermaid
sequenceDiagram
  autonumber
  actor V as Verifier
  participant FE as Frontend /verify
  participant RPC as /rpc (chỉ đọc)
  participant BE as Backend
  participant SC as CertificateRegistry

  V->>FE: Quét QR hoặc nhập certificateId
  FE->>RPC: eth_chainId, eth_getCode, getCertificate(id)
  RPC->>SC: eth_call
  SC-->>FE: bản ghi hoặc exists = false
  FE-->>V: REGISTERED_ACTIVE / REVOKED / NOT_FOUND / RPC_ERROR
  opt Chọn tệp PDF
    V->>FE: chọn tệp
    FE->>FE: SHA-256 trong trình duyệt (tệp không rời máy)
    FE->>RPC: getCertificate(id) đọc lại
    FE-->>V: trùng khớp / FILE_HASH_MISMATCH (+ cảnh báo thu hồi nếu có)
  end
  V->>FE: Tải biên bản PDF
  FE->>BE: GET /certificates/:id/verification-report?fileHash=0x…
  BE->>SC: getBlockNumber, getCertificate(id) tại khối đó
  BE-->>FE: PDF biên bản (ID, chainId, contract, khối, issuer, hash, kết quả, thời điểm UTC, QR, chú thích pháp lý)
```
