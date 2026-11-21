# Flood Warning V2 — Giai đoạn 1: lifecycle bản tin

Ngày thực hiện: 22/11/2026, giờ Việt Nam.
Nền: `43f0bda536951ef42c34d397ed4d56a3ae6c8c85` (commit contract do Phú đã push).
Code là thay đổi chưa commit trên nền này. Đối chiếu chính xác bằng patch và MANIFEST của gói bàn giao; không lấy SHA nền làm SHA code đã kiểm thử.

## Phần đã làm

- GET list/detail/active alias của Resident/Rescue/Admin; chỉ schemaVersion=2, endAt nullable.
- Admin list/detail/summary, POST create với Idempotency-Key UUID v4, GET receipt của chính Admin.
- PATCH title/content với expectedRevision khi active; giữ ID/startAt/createdAt, no-op không tạo audit/event mới.
- POST deactivate: ghi endAt một lần, lặp/concurrent an toàn, không bật lại hoặc xóa bản tin.
- Transaction tạo đồng thời alert/receipt/general-outbox/audit. Sửa/tắt kiểm tra live account/role trong transaction.
- Sửa không reset outbox. Tắt hủy general job pending/processing và ghi control event deactivated.
- Outbox `flood_warning_v2_events` là công việc bền vững, **chưa có worker gửi FCM**. Queued không có nghĩa thiết bị đã nhận.
- JWT HS256/expiry và mã lỗi JSON; role hiện tại từ users, không tin role cũ trong JWT.
- JSON malformed ở đúng nhóm endpoint trả400 cấu trúc, không trả HTML/stack. Không thay handler lỗi của module khác.
- Chưa có GPS: các path /zones, /location, /location-evaluation trả503 WARNING_V2_FEATURE_NOT_READY thay vì trả kết quả giả hoặc rơi nhầm vào detail.

## Thay đổi test nghiệp vụ cũ

Hai file `tests/admin-flood-alert-management.test.js` và `tests/admin-warning-summary-statistics.test.js` được thay bằng các bộ V2 bên dưới. Các file cũ kiểm thử severity/areaId/time-window và fake DB của route V1, không còn phù hợp quyết định nhóm bỏ V1.
Không bỏ các ca quyền/đồng thời/read-only: bộ V2 kiểm tra lại bằng hợp đồng mới, gồm summary không ghi DB và V1 không lẫn vào list/count.
Các service/controller V1 chưa được xóa hàng loạt để tránh ảnh hưởng import nội bộ. Routes production của cảnh báo đã chuyển V2; không deploy bản giữa chừng khi client/FCM/GPS chưa sẵn sàng.

## Test tự động dùng DB thay thế

Lệnh trong backend:

```text
node scripts/test-flood-warning-v2-phase1.js
```

Script chỉ chạy danh sách test đã kiểm tra dùng injected/fake DB, đặt JWT chỉ dùng cho test ở tiến trình con. Không yêu cầu .env/serviceAccountKey.json, không gọi Firebase thật hoặc gửi push.
Kết quả trên môi trường thực thi Linux/Node 24: **32/32 test-runner entries đạt, 0 lỗi, 0 skip**. Bao gồm 21 ca V2 (15 lifecycle/service, 6 HTTP qua production app với fake DB) và 11 entry hồi quy ở 10 file (auth, RBAC, notification trigger/transport/failure policy, audit, SOS, Safe Locations, flood-area controller). Một số test cũ có nhiều assert nội bộ nhưng được Node đếm theo file; không cộng nhầm thành số ca API thật.

Các ca trọng yếu:

- 12 create đồng thời cùng key ->một ID, một receipt, một general event, một audit.
- Cùng key khác body ->409; key theo Admin, không đọc receipt của Admin khác.
- Read phản hồi lỗi sau commit ->retry cùng key tìm lại đúng ID, không tạo trùng.
- Hai sửa cùng revision ->một thắng; sửa/tắt đồng thời không hồi sinh bản tin.
- Tắt đồng thời/lặp ->một thời điểm kết thúc/control event; sửa sau tắt409.
- Role/active thay đổi khi transaction retry ->không ghi; tài khoản bị khóa không replay receipt cũ.
- Commit/audit lỗi không để alert/receipt/event nửa chừng.
- Hai active độc lập; summary/list/detail không lẫn bản tin V1.
- Field cũ/status/startAt/endAt do client gửi bị từ chối; unsupported query400.
- Phân quyền JWT giả role, không JWT, expired/invalid token, thiếu account; lỗi DB500 không lộ raw error.
- Summary/list chỉ đọc; inactive endAt được giữ đúng; unknown path không xóa/bật lại dữ liệu.

## Firestore Emulator

Test: `tests/flood-warning-v2.firestore-emulator.test.js`.
Chỉ chấp nhận `GCLOUD_PROJECT=demo-floodguard-warning-v2` và FIRESTORE_EMULATOR_HOST loopback.
Config: `tests/fixtures/warning-v2-emulator/firebase.json`, cổng8087, rules không cho client trực tiếp ghi. Test dùng Admin SDK trên Emulator, không dùng key thật.

Lệnh PowerShell (sau khi dependency/Java/firebase CLI đã sẵn sàng):

```powershell
$previousProject = $env:GCLOUD_PROJECT
try {
    $env:GCLOUD_PROJECT = "demo-floodguard-warning-v2"
    firebase.cmd emulators:exec --only firestore `
        --project demo-floodguard-warning-v2 `
        --config "tests/fixtures/warning-v2-emulator/firebase.json" `
        "node --test tests/flood-warning-v2.firestore-emulator.test.js"
    if ($LASTEXITCODE -ne 0) { throw "Emulator test failed." }
}
finally { $env:GCLOUD_PROJECT = $previousProject }
```

Kết quả đã chạy trên môi trường thực thi: **1/1 ca tích hợp Emulator đạt, 0 lỗi, 0 skip**, thời gian khoảng12 giây; Firestore Emulator1.22.0, Firebase CLI15.37.0, Java21. Kiểm tra6 create đồng thời cùng key, sửa trùng revision,4 deactivate đồng thời, replay sau tắt, đọc theo role, hủy outbox và khóa Admin. Không sử dụng Firebase thật. Log thành công được đóng kèm gói bàn giao. Kết quả trên máy Windows Phú chưa xác minh.

## Chưa làm/chưa nghiệm thu

- Chuẩn hóa ba nhóm vùng, radar/Admin low_lying, HIST thiếu polygon, point-in-polygon và khoảng cách500m.
- GPS upload/binding/sequence/age60s/accuracy100m, vị trí nền và privacy khi đổi account.
- Dedupe general/near/inside theo từng Resident, fan-out all Resident và worker hủy/retry.
- Đăng ký thiết bị/FCM provider, thông báo điện thoại thật, deep link/late push.
- Bốn giao diện mới nối API, Firebase thật, Render hoặc kiểm thử thiết bị thực tế.
- Bộ test toàn repository: chỉ chạy suite chọn lọc ở trên; không kết luận mọi test/Emulator khác đã đạt.

## Nhập vào Windows và giới hạn thao tác

- Worktree: E:\2026\Ki_1__cuoi\capstone\FLOODGUARD-flood-warning-v2-backend.
- Branch: feature/flood-warning-v2-backend, HEAD phải43f0bda... và working tree sạch trước áp patch.
- Kiểm hash, git apply --check rồi git apply patch. Không git am, reset, clean, chép service key hoặc sửa .env.
- npm.cmd ci, rồi node scripts/test-flood-warning-v2-phase1.js. Gửi output trước bước phụ thuộc tiếp theo.
- Không thử create bản tin trên Firebase/Render thật ở giai đoạn này. Chưa đủ điều kiện merge/deploy toàn chức năng. Commit/push/PR/merge do Phú quyết định.
