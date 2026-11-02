# CCF-151 — SOS Status Notification

## Phạm vi

Tạo notification trong Firestore khi SOS chuyển trạng thái qua các API hiện có.
Notification được ghi cùng transaction với SOS, assignment và history.

Chưa tích hợp provider push thật hoặc xác minh nhận trên thiết bị.
Không thêm API notification mới trong task này.

## Luồng và API

Yêu cầu Authorization: Bearer <JWT>.
Chỉ role backend `rescue` được gọi hai endpoint.
Service kiểm tra lại tài khoản và phân quyền trong Firestore.

### Tiếp nhận SOS

POST /api/rescue-requests/:requestId/accept

Chuyển submitted -> received.
Một SOS chỉ được tiếp nhận một lần.

### Cập nhật trạng thái

PATCH /api/rescue-requests/:requestId/status

Body mẫu:

```json
{
  "status": "in_progress",
  "note": "Đang tiếp cận"
}
```

Hoặc:

```json
{
  "status": "assisted"
}
```

Giữ nguyên hợp đồng response và lỗi của API hiện có:

- docs/accept-rescue-request-api.md
- docs/update-rescue-status-api.md

Chỉ nhân viên được phân công mới được cập nhật.
Không chấp nhận recipientId hoặc residentId từ body.

PATCH lặp lại trạng thái hiện trả 409 theo quy tắc chuyển trạng thái cũ;
không tạo thêm history hoặc notification.

## Người nhận

recipientId lấy từ residentId của SOS đang lưu trong Firestore.
Chỉ tạo notification nếu owner tồn tại, role=resident và isActive=true.

Nếu owner không hợp lệ, không tồn tại hoặc không hoạt động:

- Vẫn cho phép xử lý cứu hộ theo phân quyền hiện có.
- Không tạo notification.
- Không tự gửi bù khi tài khoản hoạt động trở lại.

Không gửi notification này cho rescue staff, admin hay resident khác.

## Cấu trúc notification

Ví dụ cấu trúc đã lưu; timestamp dưới đây được biểu diễn dạng ISO
để minh họa, trong Firestore là Timestamp:

```json
{
  "recipientId": "resident_001",
  "type": "sos_status",
  "title": "Cập nhật trạng thái SOS",
  "body": "Yêu cầu SOS của bạn đã được tiếp nhận.",
  "relatedEntity": {
    "type": "rescue_request",
    "id": "request_001"
  },
  "eventId": "sos_status:history_001",
  "statusEvent": {
    "requestId": "request_001",
    "historyId": "history_001",
    "oldStatus": "submitted",
    "newStatus": "received",
    "sequence": 1,
    "changedAt": "2026-11-02T00:00:00.000Z"
  },
  "createdAt": "2026-11-02T00:00:00.000Z",
  "readAt": null,
  "deliveryStatus": "pending",
  "retryCount": 0,
  "lastAttemptAt": null,
  "nextRetryAt": null
}
```

Không đưa ghi chú hiện trường, tọa độ hoặc danh tính nhân viên
vào nội dung notification.

## Chống trùng và thứ tự

ID notification dùng cách băm eventId + recipientId của CCF-149.
eventId sử dụng historyId được cấp một lần ngoài callback transaction.

History và notification được ghi cùng transaction:

- Transaction thất bại không để lại notification riêng lẻ.
- Lỗi ghi notification làm rollback các thay đổi SOS/assignment/history.
- Gọi lặp hoặc chạy đồng thời phải tuân theo điều kiện trạng thái hiện tại.

Thứ tự luồng hiện có:

1. submitted -> received: sequence=1.
2. received -> in_progress: sequence=2.
3. in_progress -> assisted: sequence=3.

changedAt của notification khớp changedAt của history cùng transaction.
Sequence biểu diễn thứ tự nghiệp vụ trong luồng này;
chưa cam kết thứ tự push tới thiết bị.

Không bổ sung luồng cancelled, thông báo submitted hoặc thông báo
cho các lần ghi trực tiếp Firestore/service cấp thấp trong task này.

## Bằng chứng kiểm thử

Đã chạy và cung cấp terminal:

- sos-status-notification.firestore-emulator.test.js: 10 PASS.
- accept-rescue-request.test.js: PASS.
- update-rescue-status.test.js: PASS.
- rescue-request-status-history.service.test.js: PASS.
- get-my-sos-requests.test.js: PASS.
- get-sos-detail.test.js: PASS.
- notification.service.test.js: 7 PASS.
- notification.firestore-mock.test.js: 10 PASS.
- Kiểm tra cú pháp và git diff --check đã gửi: không báo lỗi.

Test Emulator bao gồm:

- Đúng owner và liên kết history.
- Thứ tự trạng thái và timestamp.
- PATCH lặp không tạo thêm dữ liệu.
- Chặn người khác đọc qua notification service.
- Không đưa ghi chú và thông tin người khác vào notification.
- Tiếp nhận/cập nhật đồng thời không tạo trùng.
- Owner không đủ điều kiện không chặn cứu hộ.
- Nhân viên không được phân công không thể cập nhật.
- Rollback khi tạo notification lỗi.

Test tích hợp dùng Firestore Emulator và mock audit.
Một số lần chạy có MetadataLookupWarning nhưng assertion PASS.
Không dùng kết quả này để xác nhận Firestore Security Rules,
push trên thiết bị hoặc toàn bộ hệ thống production đã hoạt động.
