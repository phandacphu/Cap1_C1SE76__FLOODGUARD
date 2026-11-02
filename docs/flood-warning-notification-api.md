# CCF-150 — Flood Warning Notification

## Phạm vi

Đăng ký nhận cảnh báo theo vùng và tạo notification trong Firestore
khi cảnh báo đủ điều kiện.

Chưa tích hợp provider push thật hoặc xác minh nhận trên thiết bị.
Không dùng GPS để tự xác định người nhận.

## API đăng ký vùng

Yêu cầu header:

Authorization: Bearer <JWT>

Role được hỗ trợ: resident, rescue_staff, admin.
Backend kiểm tra lại tài khoản tồn tại, đang hoạt động và role trong Firestore.
Người dùng chỉ quản lý đăng ký của chính mình; recipientId lấy từ JWT.

### Xem trạng thái

GET /api/flood-warning-subscriptions/:areaId

Không nhận query parameters.

Response 200:

```json
{
  "success": true,
  "message": "Flood warning subscription retrieved successfully",
  "data": {
    "subscription": {
      "areaId": "area_001",
      "enabled": false
    }
  }
}
```

Chưa đăng ký trả enabled=false.
GET không xác minh vùng còn tồn tại.

### Đăng ký hoặc hủy nhận

PUT /api/flood-warning-subscriptions/:areaId

Body chỉ nhận một trường enabled kiểu boolean.

Đăng ký:

```json
{
  "enabled": true
}
```

Hủy nhận:

```json
{
  "enabled": false
}
```

Response 200:

```json
{
  "success": true,
  "message": "Flood warning subscription updated successfully",
  "data": {
    "subscription": {
      "areaId": "area_001",
      "enabled": true
    }
  }
}
```

Đăng ký yêu cầu vùng tồn tại.
Hủy nhận vẫn được phép sau khi vùng đã bị xóa.
Lặp lại cùng trạng thái không cập nhật timestamps.

### Lỗi

| HTTP | Trường hợp                                                      |
| ---- | --------------------------------------------------------------- |
| 400  | ID không hợp lệ, body sai, trường thừa hoặc query không hỗ trợ  |
| 401  | Thiếu/sai/hết hạn JWT hoặc tài khoản không còn tồn tại          |
| 403  | Role không được hỗ trợ hoặc tài khoản không hoạt động           |
| 404  | Bật đăng ký cho vùng không tồn tại                              |
| 500  | Lỗi xử lý nội bộ; response không trả lỗi Firestore hoặc secrets |

API đăng ký không sử dụng HTTP 409.
Xung đột dữ liệu notification được xử lý nội bộ bằng
NOTIFICATION_EVENT_CONFLICT.

## Rule cảnh báo

- Chỉ tạo notification khi cảnh báo active và startAt <= now <= endAt.
- Người nhận phải có đăng ký enabled=true đúng areaId và tài khoản hợp lệ.
- Tạo cảnh báo hoặc thay đổi title, content, severity, status, areaId,
  startAt, endAt có thể tạo sự kiện.
- Cập nhật giống dữ liệu cũ không tạo phiên bản hoặc sự kiện mới.
- Cảnh báo đặt lịch tương lai có sự kiện chờ đến startAt.
- Cảnh báo hết hạn hoặc inactive không tạo notification mới.
- Cảnh báo/vùng có isTest=true, testOnly=true hoặc dấu TEST ONLY
  trong các trường văn bản được rule kiểm tra sẽ bị bỏ qua.
- Sự kiện của phiên bản cũ bị bỏ qua khi cảnh báo đã có phiên bản mới.
- Chỉ luồng Admin tạo/cập nhật cảnh báo hiện được nối tạo sự kiện.
  Ghi trực tiếp Firestore hoặc gọi service cấp thấp không tự tạo sự kiện.
- Không tự tạo lại sự kiện cho cảnh báo có từ trước khi triển khai.

## Firestore

### flood_warning_subscriptions

ID: SHA-256 của JSON.stringify([recipientId, areaId]).

Fields:
recipientId, areaId, enabled, createdAt, updatedAt.

### flood_warning_notification_events

ID trùng notificationRevision lưu trong flood_alerts.

Cảnh báo và sự kiện được ghi cùng transaction.
Trạng thái sự kiện: pending, completed hoặc cancelled.

Worker lưu recipientCursor và khóa xử lý tạm trong sự kiện.
Khóa hết hạn được phép xử lý lại vì worker chỉ ghi Firestore.

### notifications

type: flood_warning.
relatedEntity: { type: "flood_alert", id: "<alertId>" }.
deliveryStatus ban đầu: pending.

ID cố định theo sự kiện và người nhận để chống tạo trùng.
Đăng ký, tài khoản, phiên bản và thời gian được kiểm tra lại
trong transaction tạo notification.

completed của sự kiện chỉ có nghĩa đã xử lý các trang đăng ký,
không có nghĩa đã gửi push hoặc thiết bị đã nhận.

Hủy đăng ký hoặc đổi cảnh báo không thu hồi notification đã tạo.
Kiểm tra điều kiện tại thời điểm gửi push cần được xem xét khi
tích hợp provider thật.

## Scheduler

Mặc định tắt.

Bật bằng biến môi trường:

FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED=true

Khởi động cùng backend qua src/server.js.
Lượt đầu sau khoảng 1 giây.
Lượt sau cách thời điểm hoàn thành lượt trước 60 giây.

Mỗi lượt:

- Quét tối đa 20 document sự kiện pending.
- Xử lý tối đa 5 sự kiện.
- Mỗi sự kiện xử lý tối đa 20 đăng ký.

Cursor quét sự kiện nằm trong bộ nhớ.
Cursor người nhận nằm trong Firestore.
Mỗi tiến trình không chạy chồng các lượt; khóa Firestore hạn chế
nhiều tiến trình xử lý cùng sự kiện.

Đây là xử lý định kỳ, không cam kết gửi ngay đúng giây startAt.
Tiến trình backend phải đang chạy; khi bị dừng hoặc nền tảng sleep,
việc xử lý sẽ chờ tới khi backend hoạt động lại.

SIGINT/SIGTERM dừng timer và chờ công việc đang chạy;
server có giới hạn shutdown 15 giây.

## Bằng chứng kiểm thử local

Chạy và cung cấp terminal:

- Subscription API Emulator: 15 PASS.
- Notification rule: 22 ca PASS và kiểm tra thời gian không hợp lệ PASS.
- Event transaction Emulator: 10 PASS.
- Recipient notification Emulator: 22 PASS.
- Worker Emulator: 13 PASS.
- Scheduler mock: 10 PASS.
- Hồi quy CCF-148/149: 63 ca PASS.
- Admin flood warning management API: PASS.
- Admin warning summary statistics API: PASS.
- Các lần kiểm tra cú pháp và git diff --check đã gửi: không báo lỗi.

Một số test Emulator có MetadataLookupWarning nhưng assertion PASS.
Chưa xác định nguyên nhân warning.

Scheduler được kiểm thử bằng mock.
Chưa xác minh toàn bộ luồng qua server thật và lịch chạy thật.
Test Admin dùng mock Firestore.
Test sự kiện dùng Emulator Firestore và mock audit.
Các test này không xác minh Firestore Security Rules.

## Checklist Tú kiểm thử trước khi tích hợp giao diện

1. Kiểm tra GET/PUT với JWT hợp lệ và response như hợp đồng.
2. Kiểm tra 400/401/403/404 và mô phỏng lỗi 500.
3. Không cho truyền recipientId để quản lý đăng ký người khác.
4. Đăng ký đúng vùng, hủy nhận và gửi lại cùng yêu cầu.
5. Tạo/cập nhật cảnh báo đang hiệu lực trong môi trường test cô lập.
6. Cập nhật giống cũ không tạo thêm notification.
7. Chỉ tài khoản hợp lệ đăng ký đúng vùng nhận notification.
8. Cảnh báo tương lai chờ đến giờ; hết hạn/inactive bị bỏ qua.
9. TEST ONLY và sự kiện phiên bản cũ không tạo notification.
10. Chạy lại hoặc chạy đồng thời không tạo trùng.

Kiểm thử tạo notification dùng project Emulator demo và provider giả,
không phát cảnh báo giả tới người dùng thật.
