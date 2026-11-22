# Warning V2 — thiết bị và GPS riêng (giai đoạn2B / PHASE3)

Nghiệp vụ đã duyệt không đổi. Bổ sung cơ chế chống request đến muộn; thay thế trạng thái API GPS chưa triển khai của gói PHASE2. Code vẫn là thay đổi local trên HEAD43f0bda, chưa push/merge/deploy. Base URL phải trỏ đúng build nhập PHASE3; Render cũ chưa có các API này.

## 1. Dữ liệu lưu trên Android

- installationId UUIDv4 và secret32..64 byte ngẫu nhiên bảo mật, encode base64url không padding; giữ cho lần cài, bảo vệ trong kho an toàn. Không đưa secret vào URL, log, analytics hoặc ảnh chụp.
- registrationId UUIDv4 mới cho mỗi phiên đăng nhập/liên kết. Không tái sử dụng ID phiên đã kết thúc. Retry cùng lần đăng ký giữ nguyên body và ID.
- bindingId, revision và sequence đã xác nhận. Sequence tăng trong binding và lưu qua khởi động lại. Binding đổi: xóa GPS/cache cũ, sequence bắt đầu1. Token refresh cùng registration giữ binding/sequence.
- Generation cục bộ cho phiên: tăng ngay khi logout/đổi tài khoản. Mỗi callback kiểm tra generation/account/binding trước ghi cache hoặc chạy tiếp. Backend không thể hủy callback Android đã lên lịch.

## 2. Đăng ký, reconcile và token refresh

Mọi request gửi Bearer JWT. API installation gửi X-Installation-Secret. GPS và DELETE thêm X-Installation-Id, X-Device-Binding-Id. Dùng HTTPS ngoài loopback.

1. Sau login, chỉ phiên hiện tại gọi GET `/api/notification-devices/{installationId}` lấy installation.bindingId/revision. Chưa có: null/0. GET cần secret dù chưa có token hoặc người dùng từ chối thông báo.
2. PUT cùng path với đúng6 trường:

```json
{
  "platform":"android",
  "fcmToken":null,
  "notificationPermission":"denied",
  "registrationId":"50000000-0000-4000-8000-000000000001",
  "expectedBindingId":null,
  "expectedRevision":0
}
```

3. Lưu `data.device.bindingId/revision`. pushEligible=false không chặn đọc bản tin hoặc gửi GPS; true cũng chưa chứng minh token hợp lệ/gửi push thành công.
4. Token/quyền đổi: cùng registrationId, expectedBindingId/revision hiện tại, cập nhật token/quyền. Binding giữ nguyên, revision tăng. Xếp tuần tự các thay đổi thiết bị; không gửi PUT cạnh tranh không kiểm soát.
5. Timeout: retry chính body đó. Nếu đã commit và đây vẫn là mutation gần nhất, trả200 cùng liên kết/revision. Nếu409, đọc lại installation **chỉ khi phiên cục bộ còn hiện hành**, kiểm tra và tạo thao tác phù hợp. Không nâng revision của callback cũ rồi gửi lại.
6. GET chỉ trả installationId/bindingId/revision/active/boundToCurrentAccount, không trả chủ tài khoản khác. UUID không đủ nhận chủ; secret sai403. Token trùng installation khác409, không tự chiếm claim.

## 3. GPS upload và đánh giá

PUT `/api/flood-alerts/location`, headers như trên, đủ6 trường. Không nhận residentId/alertId/zoneId/kết luận từ client.

```json
{
  "sequence":1,
  "availability":"available",
  "reason":null,
  "location":{"latitude":16.0544,"longitude":108.2022},
  "capturedAt":"2026-11-22T01:00:20.000Z",
  "accuracyM":20
}
```

capturedAt là giờ GPS được đo, UTC ISO; không thay bằng giờ gửi/retry. Backend không gia hạn mẫu cũ. Tuổi≤60giây, accuracy≤100m mới đối chiếu; thiếu accuracy/quá ngưỡng trả200 unknown. Body sai400 không thay mẫu trước.

Thu hồi quyền/tắt GPS/no fix: sequence mới, availability unavailable, reason permission_denied/location_disabled/no_fix, location/capturedAt/accuracyM=null. UI bỏ trạng thái vị trí hiện hành ngay. Khi mất mạng, cập nhật UI cục bộ, lấy GPS mới khi nối lại; không replay hàng loạt hàng đợi. Nếu không gửi được unavailable, Backend hết hạn mẫu theo capturedAt+60s; không cam kết nhận tức thời lúc offline.

GET `/api/flood-alerts/location-evaluation` đọc lại vùng/mẫu mới nhất, kiểm tra lại binding/role trước trả. Không tạo event/push khi GET. DTO đầy đủ trong contract chính. Response phải kiểm tra generation/account/binding/sequence; bỏ phản hồi đến muộn. Không dùng evaluatedAt kéo dài validUntil.

Sequence mới ghi atomically sample + event pending, chưa gửi FCM. Cùng sequence+cùng body replay an toàn, giữ receivedAt; sequence nhỏ hoặc cùng sequence khác body409. Nếu response lỗi sau commit, retry nguyên mẫu hoặc GET; không coi timeout là chưa ghi, không tăng sequence để replay mẫu cũ. Nếu có upload mới trong khi tải vùng, response trả mẫu mới nhất hoặc409 nếu đã đổi binding.

Nguồn vùng lỗi có thể trả200 unknown + coverage unavailable/partial; không biến thành far. Có match hợp lệ dù coverage partial vẫn inside/near và ghi rõ phần chưa đối chiếu được. Bản tin đã tắt được bỏ khỏi activeAlertIds ở lần đọc kế; UI không gắn khối đỏ vào lịch sử inactive.

## 4. Logout/đổi tài khoản

1. Ngừng uploader, tăng generation, xóa vị trí/cache cá nhân ngay.
2. Khi còn JWT và mạng, DELETE installation đúng binding. Lặp cùng binding đã hủy200; sau rebind, DELETE binding cũ409 và không ảnh hưởng người mới. Không có body hoặc body rỗng; ID trên URL khớp header.
3. Backend xóa token khỏi device, giải phóng claim, xóa nội dung GPS. Giữ receipt đăng ký chống login cũ; không sửa sổ chống lặp theo Resident (sổ sẽ triển khai ở worker tiếp).
4. Login tiếp: registrationId mới, GET installation rồi PUT theo phiên bản vừa đọc. Không dùng token/account cũ gửi dữ liệu người mới.
5. `/api/auth/logout` cũ vẫn stateless, chưa tự gọi DELETE installation. Mobile phải thực hiện các bước trên; không coi JWT đã thu hồi server chỉ vì gọi logout.

## 5. Lưu trữ và giới hạn

| Collection | Vai trò |
|---|---|
| warning_v2_devices | owner/binding/revision, hash secret, token và quyền; không mở trực tiếp cho client |
| warning_v2_device_registrations | Receipt ID phiên, chặn tái dùng sau rebind/logout |
| warning_v2_token_claims | Hash token làm ID, claim installation/binding |
| warning_v2_locations | Mẫu mới nhất theo installation, owner/binding; xóa nội dung khi unbind/rebind |
| warning_v2_location_events | Outbox sequence đổi, chỉ có tham chiếu, không chép tọa độ/token/secret |

Trước deploy phải kiểm tra Firestore Security Rules chặn client đọc/ghi trực tiếp các collection riêng. Tests Emulator dùng Admin SDK, **không chứng minh Security Rules production**. Chưa có chính sách dọn receipt/event quá hạn, màn hỗ trợ mất secret/token conflict, worker vùng đổi, fan-out hoặc senderFCM. Mất secret: tạo installation/secret mới; token cũ còn claim cần chủ cũ hủy hoặc xử lý quản trị có kiểm chứng, chưa có API tự động.

Không đổi module Notification/SOS cũ. GPS nền, FCM thật, đổi tài khoản điện thoại cần test sau nối Android, chưa PASS từ Backend.
