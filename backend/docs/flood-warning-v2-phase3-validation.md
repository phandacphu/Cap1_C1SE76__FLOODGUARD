# Warning V2 — báo cáo giai đoạn2B / gói PHASE3

Ngày22/11/2026, giờ Việt Nam. Source HEAD43f0bda536951ef42c34d397ed4d56a3ae6c8c85 + gói PHASE1/PHASE2 đã được Phú nhập; giai đoạn này chưa commit/push/merge/deploy.

## Phạm vi

- GET/PUT/DELETE notification-devices; proof32..64byte, hash server, CAS binding/revision, receipt chống phiên cũ, claim token độc quyền theo installation.
- PUT flood-alerts/location và GET location-evaluation: riêng Resident + proof/owner/binding; kiểm tra live role trong transaction, sequence/replay, ghi giờ nhận server, outbox sequence atomically.
- Logout/rebind xóa nội dung GPS cũ, giải phóng token, không cho DELETE cũ hủy tài khoản mới.
- Sau tải vùng đọc lại account/binding/sample/active alerts để không trả GPS tài khoản đã đổi; GET không tạo event.
- Contract bổ sung expectedBindingId/expectedRevision và API đọc installation; không đổi quyết định nghiệp vụ.

## Bằng chứng nhận từ Windows trước gói này

- PHASE2 suite: **64/64**, không fail/skip, log Phú gửi.
- PHASE2 Emulator: **2/2**, không fail/skip, exit0,21.333s. Lệnh `node --test --test-concurrency=1 tests/flood-warning-v2.firestore-emulator.test.js tests/flood-warning-v2.zones.firestore-emulator.test.js` trong CLI demo-floodguard-warning-v2; không phải Firebase thật/Render.
- PHASE3 chưa được chạy Windows tại thời điểm đóng gói; không ghi các kết quả executor dưới đây là kết quả máy Phú.

## Bằng chứng executor

Node24, Java21, Firebase CLI15.37.0; Firestore Emulator project demo-floodguard-warning-v2, loopback8087. Không nạp service-account production; tests inject DB hoặc SDK demo.

| Kiểm thử | Lệnh | Kết quả |
|---|---|---|
| Unit/HTTP với DB giả + hồi quy | node scripts/test-flood-warning-v2-phase3.js |78 pass,0 fail,0 skip |
| Firestore transaction thật trên Emulator | node --test --test-concurrency=1 tests/flood-warning-v2.firestore-emulator.test.js tests/flood-warning-v2.zones.firestore-emulator.test.js tests/flood-warning-v2.devices.firestore-emulator.test.js |3 pass,0 fail,0 skip |

Suite gồm13 ca device/GPS service,1 ca HTTP mới qua production app cùng các ca lifecycle/geometry/zones/evaluation và hồi quy auth/RBAC/Notification/SOS/Điểm tránh trú/bản đồ đã chọn. Đây không phải toàn bộ tests repository. HTTP test dùng JWT test và DB giả, không chứng minh thông tin đăng nhập thật hoặc giao diện Android.

Ca chính: retry đăng ký đồng thời, hai phiên CAS, secret sai, account cũ, token trùng, refresh token không xoay binding, logout lặp, rebind xóa GPS, request cũ không hủy người mới, sequence thấp/conflict/replay, upload đồng thời, auth bị thu hồi lúc retry transaction, DB lỗi không ghi một nửa, hết60s, unavailable/accuracy kém, GET không tạo event, upload mới hoặc đổi binding trong lúc tải vùng. Emulator kiểm chứng SDK query/transaction thật và dọn đúng dữ liệu TEST của nó.

Log trong ZIP: selected-suite.log, firestore-emulator.log. Gói patch có SHA trong MANIFEST.json; các thay đổi source chưa có commit riêng nên không gán các test này cho HEAD43f0bda nguyên bản.

## Còn chờ

- Chạy lại bộ PHASE3 trên máy Windows của Phú.
- Worker general/near/inside và sổ chống trùng theo Resident+bản tin, vùng đổi nền, outbox cancellation, retry/provider quota, gửi FCM thật.
- Nối Android binding/GPS, chia sẻ nguồn vị trí với SOS, background/foreground, hết hạn UI, logout/đổi account, FCM/deep link trên điện thoại.
- Kiểm tra Security Rules production, quy trình token conflict/mất secret, retention và tải thực tế trước deploy. Không có thay đổi Rules production trong gói này.
- Chưa test Firebase thật, Render, Web, APK hoặc FCM. Chưa chứng minh tính năng nhận cảnh báo hoàn chỉnh.
