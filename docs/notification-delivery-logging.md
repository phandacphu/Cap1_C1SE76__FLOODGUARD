# CCF-152 — Notification Delivery Logging

## Phạm vi

Ghi lịch sử xử lý notification vào collection notification_delivery_logs.

Các luồng đã nối log queued:

- createNotification.
- triggerNotification.
- Notification cảnh báo lũ.
- Notification thay đổi trạng thái SOS.

Delivery ghi log sent/failed cùng transaction cập nhật kết quả.
Không thay đổi chính sách retry hoặc tự gửi lại khi kết quả chưa xác định.

## Trạng thái và mã kết quả

| Log status | providerResponseCode               | Ý nghĩa                                           |
| ---------- | ---------------------------------- | ------------------------------------------------- |
| queued     | LOCAL_QUEUED                       | Notification đã được tạo, chờ xử lý               |
| sent       | PROVIDER_ACCEPTED                  | Provider xác nhận chấp nhận                       |
| failed     | NOTIFICATION_TRANSPORT_SEND_FAILED | Transport báo gửi thất bại                        |
| failed     | NOTIFICATION_TRANSPORT_TIMEOUT     | Timeout; kết quả có thể chưa xác định             |
| failed     | NOTIFICATION_OUTCOME_UNKNOWN       | Lease cũ hết hạn, chưa biết kết quả lần gửi trước |

Notification chính vẫn dùng deliveryStatus=pending cho trạng thái chờ.
sent chỉ thể hiện provider chấp nhận, không xác nhận thiết bị đã nhận.

providerResponseCode là mã nội bộ đã chuẩn hóa từ transport.
Không lưu phản hồi thô, lỗi provider nguyên bản hoặc providerMessageId.

retryCount giữ nghĩa hiện tại: số lần thất bại đã ghi nhận,
không phải tổng số lần gọi provider.
Khôi phục lease hết hạn không tự tăng retryCount.

## Cấu trúc log

```json
{
  "notificationId": "notification_001",
  "eventId": "sos_status:history_001",
  "correlationId": "notification_<sha256>",
  "status": "queued",
  "retryCount": 0,
  "providerResponseCode": "LOCAL_QUEUED",
  "outcomeUnknown": false,
  "timestamp": "<Firestore Timestamp>"
}
```

- correlationId cố định theo notificationId qua các lần retry.
- eventId liên kết sự kiện nghiệp vụ.
- Thiếu business eventId thì dùng legacy:<sha256(notificationId)>.
- Timestamp được Firestore tạo khi commit.
- ID log cố định theo notificationId và entryKey.
- Log queued dùng entryKey=queued.
- Log kết quả delivery dùng delivery lease ID.

Không lưu title, body, recipientId, payload, access token,
authorization header hoặc lỗi provider nguyên bản trong log.

## Tính nguyên tử

Notification mới và log queued được ghi cùng batch/transaction.
Kết quả delivery và log sent/failed được ghi cùng transaction.

Nếu ghi log lỗi, batch/transaction tương ứng không commit.

Nếu provider đã nhận nhưng transaction lưu kết quả lỗi,
notification có thể còn lease và cần đối soát;
không được coi là gửi thất bại chắc chắn rồi tự gửi lại.

Gọi lại cùng sự kiện không tạo thêm queued log.
Các lần retry khác nhau có log kết quả riêng.

Không ghi bù queued log cho notification đã tồn tại trước triển khai.
Không ghi log mới chỉ vì worker bỏ qua một notification đã sent,
chưa đến giờ retry, đang khóa hoặc chưa cấu hình provider.

## API tra cứu

GET /api/admin/notification-logs

Yêu cầu:

Authorization: Bearer <JWT>

Chỉ Admin đang hoạt động được truy cập.
Backend kiểm tra role/tài khoản trong Firestore ngoài kiểm tra JWT.

Mỗi request phải có đúng một khóa:

- notificationId
- correlationId
- eventId

Ví dụ:

```text
/api/admin/notification-logs?notificationId=notification_001&limit=20
/api/admin/notification-logs?correlationId=notification_<sha256>&limit=20
/api/admin/notification-logs?eventId=sos_status%3Ahistory_001&limit=20
```

limit mặc định 20, tối đa 100.
Request lặp khóa hoặc có tham số không hỗ trợ bị từ chối.

Kết quả được phân trang theo ID log, không phải thứ tự thời gian.
Muốn xem diễn biến theo thời gian, cần lấy đủ các trang rồi sắp xếp timestamp.

Response mẫu:

```json
{
  "success": true,
  "message": "Notification delivery logs retrieved successfully",
  "data": {
    "logs": [
      {
        "id": "<64-character SHA-256>",
        "notificationId": "notification_001",
        "eventId": "sos_status:history_001",
        "correlationId": "notification_<sha256>",
        "status": "queued",
        "retryCount": 0,
        "providerResponseCode": "LOCAL_QUEUED",
        "outcomeUnknown": false,
        "timestamp": "2026-11-02T00:00:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

Nếu nextCursor khác null, gửi cursor đó cùng khóa tra cứu
và các tham số phân trang cho request tiếp theo.

Không tìm thấy log trả HTTP 200 với logs=[] và nextCursor=null.
Response chỉ chọn các trường log cho phép.

## Lỗi API

| HTTP | Trường hợp                                             |
| ---- | ------------------------------------------------------ |
| 400  | Thiếu/nhiều khóa tra cứu, ID sai hoặc phân trang sai   |
| 401  | Thiếu/sai/hết hạn JWT hoặc tài khoản không còn tồn tại |
| 403  | Không phải Admin đang hoạt động                        |
| 500  | Lỗi xử lý/database, chỉ trả Internal server error      |

Không dùng 404 cho kết quả tra cứu rỗng.
API chỉ đọc nên không có thao tác gây xung đột 409.

## Bằng chứng kiểm thử local

Đã chạy và cung cấp terminal:

- Notification delivery log validation/mock: 11 PASS.
- Notification trigger mock: 8 PASS.
- Delivery log Firestore Emulator: 10 PASS.
- Admin notification log API Emulator: 14 PASS.
- Notification delivery Emulator: 13 PASS.
- Notification validation hồi quy: 7 PASS.
- Notification Firestore mock hồi quy: 10 PASS.
- Accept rescue request API: PASS.
- Update rescue status API: PASS.
- SOS notification Emulator: 10 PASS.
- Flood warning recipient Emulator: 22 PASS.
- Notification retry worker Emulator: 13 PASS.
- Flood warning worker Emulator: 13 PASS.
- Flood warning scheduler mock: 10 PASS.
- Các lần kiểm tra cú pháp và git diff --check đã gửi: không báo lỗi.

Một số test Emulator có MetadataLookupWarning nhưng assertion PASS.
Các test cố tình gây lỗi có thể in LOOKUP_FAILED hoặc
EVENT_PROCESSING_FAILED với mã cố định, không in lỗi thô.

## Giới hạn

Chưa tích hợp provider push thật hoặc xác minh nhận trên thiết bị.
Kết quả test không xác minh Firestore Security Rules.
Chưa có chính sách TTL/xóa log tự động hoặc giao diện tra cứu.
API tra cứu phục vụ kiểm tra lỗi bằng JWT Admin.
