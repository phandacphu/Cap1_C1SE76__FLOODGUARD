# Warning V2 — bằng chứng PHASE5 và bàn giao

Ngày22/11/2026 (Việt Nam). Base đã merge PR150: be9d99cbc954eb0800bba20fd824ac69a61cd569. Nhánh local feature/flood-warning-v2-sender-handoff. Chưa stage/commit/push/PR/merge/deploy gói PHASE5.

## Thay đổi

Sender FCM qua Firebase Admin SDK, data-only, per-installation target/lease, preflight quyền/binding/token/GPS/vùng, retry có backoff/Retry-After, unknown không resend, invalid token cập nhật có CAS, control deactivated, scheduler opt-in và cấu hình TEST/live. Không đổi HTTP endpoint/body/DTO. FCM thêm installationId/bindingId để client guard phiên. Không thêm dependency hoặc sửa SOS/Điểm tránh trú/UI app hiện tại.

Bộ bàn giao có HTML bốn giao diện đã duyệt, bốn hướng dẫn theo người, contract API hiện hành,21 request Postman có guard ghi mặc định tắt, quy ước chung, checklist và rollout/rollback. Request Postman bao phủ16 endpoint HTTP (một số role/biến thể dùng chung endpoint).

## Kiểm thử executor

Node24.22.3, Java21, Firebase CLI15.37.0, Firestore Emulator1.22.0.

| Lệnh/phạm vi | Kết quả |
|---|---|
| node scripts/test-flood-warning-v2-phase5.js |132 pass,0 fail,0 skipped |
| Năm file Firestore Emulator, test-concurrency=1 |5 pass,0 fail,0 skipped |
| HTML script và JSON/Postman script parse |PASS |
| git diff --check |PASS |

Suite chọn lọc gồm104 ca nền PHASE4 +28 bài sender mới. Đây không phải toàn bộ repository tests.5 Emulator gồm4 ca nền +1 bài tích hợp sender thực qua SDK Firestore; provider send được inject giả, không gọi mạng FCM.

Các ca mới kiểm tra: default-off/allowlist, fanout nhiều thiết bị/cursor restart, tranh lease, known-failure backoff/maxattempt5/Retry-After, timeout/late result/crash/lost DB commit→unknown, token refresh/invalid token CAS/account A→B, quyền/role/token claim, GPS stale/near→inside/source đổi, deactivate trước/trong gửi và control, Unicode byte budget, scan lỗi và tiếp tục. Emulator chứng minh lease/dedup nhiều worker, token rotation và control với transaction SDK thật.

Không nạp service account production hoặc tạo dữ liệu/FCM thật. Emulator dùng project demo-floodguard-warning-v2 loopback8087, dữ liệu TEST ngẫu nhiên, dọn theo đúng ID test. Logs selected-suite.log và firestore-emulator.log nằm trong ZIP; manifest xác định nội dung gói, không tự ghi một commit chưa tồn tại.

## Chưa chạy/giới hạn

- Windows của Phú trên gói PHASE5 chưa chạy; không lấy PASS executor làm PASS Windows.
- Render deploy SHA/API auth thật, Rules/indexes/IAM/quota production chưa xác minh.
- FCM thật, Android foreground/background/Doze/force-stop/deep-link/permission/account switching chưa nghiệm thu.
- Huy/Khoa/Thiên/Phú Rescue chưa triển khai/nghiệm thu UI mới chỉ vì có HTML/docs. Mẫu không phải source ứng dụng hoàn chỉnh.
- Chưa load-test chi phí/độ trễ; nhịp15s là khoảng nghỉ sau tick, không SLA. Không hứa không có lỗi hoặc exactly-once trên FCM.

Phú nhập gói vào worktree mới, chạy lại132 +5, review rồi tự quyết định Git/merge/Render. Sau môi trường TEST sẵn sàng mới bàn giao trạng thái “API thật ready”; nhóm có thể bắt đầu UI/adapter từ contract/fixture trước đó. Không bật live hoặc phát thử người dân thật từ gói này.
