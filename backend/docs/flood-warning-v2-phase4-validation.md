# Warning V2 — bằng chứng PHASE4

Ngày22/11/2026, giờ Việt Nam. Nền PR149/develop29185aeefeebfb04b0cd8c3b5f59c523631a97ab. Nhánh triển khai feature/flood-warning-v2-event-worker; chưa commit/push/merge/deploy gói này.

## Phạm vi đã viết

Worker chuẩn bị general/near/inside với receipt theo Resident+bản tin, fan-out từng trang và cursor bền vững; wake-up GPS + quét binding; hủy pending job theo điều kiện mới nhất; control deactivated giữ cho sender sau. Scheduler opt-in, mặc định tắt, không chồng tick. Không gửi FCM, không thêm/đổi endpoint HTTP hoặc DTO giao diện.

Mã và giới hạn: docs/flood-warning-v2-worker.md.

## Kiểm thử executor

Node24.22.3, Java21, Firebase CLI15.37.0, Firestore Emulator1.22.0. Dùng dependency injection và project demo-floodguard-warning-v2 loopback8087; không nạp service-account production.

| Bộ kiểm thử | Kết quả |
|---|---|
| node scripts/test-flood-warning-v2-phase4.js |104 pass,0 fail,0 skipped |
| Bốn file Firestore Emulator chạy tuần tự |4 pass,0 fail,0 skipped |

Log selected-suite.log và firestore-emulator.log trong ZIP. Đây là suite chọn lọc, không phải toàn bộ tests repository. 26 bài mới gồm worker và scheduler; các bài API/GPS/geometry cùng hồi quy auth/RBAC/audit/Notification/SOS/Điểm tránh trú/bản đồ nằm trong suite cũ tiếp tục được chạy.

SDK Emulator kiểm tra cursor qua khởi tạo lại worker, general không GPS/token/quyền push, loại Admin/Rescue/inactive, payload creation bất biến sau edit, nhiều worker tạo trùng, hai thiết bị dùng chung receipt, near→inside, GPS event cũ, GPS mới vẫn cùng điều kiện, vùng không liên quan đổi, hết hạn vị trí, account mất quyền và tắt/hủy từng trang. Dọn dữ liệu chỉ theo ID TEST ngẫu nhiên đã tạo.

## Bằng chứng Windows và production

- PHASE3 trước đây: Phú đã gửi log78/78 suite và3/3 Emulator, source tree98d06c538131f7d748c0059564909e72d547b072; đã push1bb4be1 và mergePR149 thành29185ae.
- PHASE4: **chưa chạy trên Windows của Phú lúc đóng gói**. Không lấy PASS executor làm PASS Windows.
- Chưa bật worker, chưa ghi/test Firebase production, chưa test Render/APK/Web/FCM thật sau gói sửa này.
- Các response HTTP vẫn được bộ test app thật với DB giả kiểm tra; không coi HTTP test đó là thử đăng nhập tài khoản thật trên Render.

## Còn chờ

Phú nhập gói vào worktree/nhánh mới, chạy suite104 và Emulator4; sau đó review bản thay đổi để quyết định commit/push/PR. Sender/provider/control FCM, Android/deep-link/background, Rules/indexes production, retention/chi phí và tải thực cần kiểm chứng riêng. Không thông báo tính năng nhận cảnh báo hoàn chỉnh đã nghiệm thu chỉ vì job pending/processed/prepared.
