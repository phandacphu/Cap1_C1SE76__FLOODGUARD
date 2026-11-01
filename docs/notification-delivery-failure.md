# CCF-153 — Notification Delivery Failure

## Phạm vi

Phân loại lỗi gửi notification, retry có giới hạn với exponential
backoff, đánh dấu thất bại cuối cùng và chặn gửi lại khi chưa xác định
được kết quả lần gửi trước.

Không bổ sung endpoint hoặc thay đổi quyền JWT/role trong task này.
API tra cứu log admin tiếp tục sử dụng contract của CCF-152.

## Phân loại lỗi

| Tín hiệu từ provider adapter         | Phân loại | Tự động retry | Mã log                             |
| ------------------------------------ | --------- | ------------- | ---------------------------------- |
| HTTP 429                             | Transient | Có            | PROVIDER_RATE_LIMITED              |
| HTTP 500–599, ngoại trừ 504          | Transient | Có            | PROVIDER_SERVER_ERROR              |
| INVALID_DEVICE_TOKEN                 | Permanent | Không         | PROVIDER_INVALID_TOKEN             |
| HTTP 400–499, ngoại trừ 408/429      | Permanent | Không         | PROVIDER_REJECTED                  |
| HTTP 408/504                         | Unknown   | Không         | NOTIFICATION_OUTCOME_UNKNOWN       |
| ETIMEDOUT/ECONNRESET/EPIPE/ABORT_ERR | Unknown   | Không         | NOTIFICATION_OUTCOME_UNKNOWN       |
| Hết thời gian chờ của transport      | Unknown   | Không         | NOTIFICATION_TRANSPORT_TIMEOUT     |
| Provider throw lỗi thông thường      | Transient | Có            | NOTIFICATION_TRANSPORT_SEND_FAILED |

HTTP status ở bảng trên là lỗi provider, không phải HTTP response
của FLOODGUARD API.

Adapter phải cung cấp HTTP status dưới dạng số nguyên. Không sao chép
message, raw response hoặc mã lỗi tùy ý của provider vào log.

INVALID_DEVICE_TOKEN là mã quy ước nội bộ của adapter, chưa phải tích
hợp trực tiếp mã lỗi của một dịch vụ push cụ thể.

## Hợp đồng provider

- provider.send(notification, { signal }) resolve khi provider chấp nhận.
- Adapter phải throw khi provider từ chối yêu cầu.
- Adapter phải nhận diện lỗi mạng có kết quả không chắc chắn bằng các
  tín hiệu đã hỗ trợ, thay vì chuyển thành Error thông thường.
- Resolve không chứng minh thiết bị đã nhận hoặc hiển thị notification.
- AbortSignal yêu cầu hủy; không bảo đảm provider chưa xử lý yêu cầu.

## Retry

Giới hạn hiện tại là 5 lần gửi thất bại được ghi nhận.

Thời gian chờ sau các lần thất bại transient:

| Lần thất bại | Chờ trước lần tiếp theo |
| ------------ | ----------------------- |
| 1            | 60 giây                 |
| 2            | 120 giây                |
| 3            | 240 giây                |
| 4            | 480 giây                |
| 5            | Dừng retry              |

Hàm tính delay có mức trần 3.600.000 ms; với giới hạn 5 lần hiện tại,
các lịch retry thực tế chưa chạm mức trần này.

retryCount lưu số lần thất bại, không phải tổng số lần gửi.
Gửi thành công sau retry giữ lại số lần thất bại đã ghi nhận.

Worker bỏ qua notification chưa đến nextRetryAt, đang có lease,
đã đạt giới hạn, thất bại permanent/final hoặc cần đối soát.

## Trạng thái lưu trong notifications

deliveryStatus tiếp tục dùng pending/sent/failed.
Log tương ứng dùng queued/sent/failed.

Các trường phân loại được ghi khi xử lý kết quả delivery:

| Trường                         | Ý nghĩa                                       |
| ------------------------------ | --------------------------------------------- |
| deliveryFailureType            | transient, permanent, unknown hoặc null       |
| deliveryFinalFailure           | Dừng retry vì lỗi permanent hoặc hết giới hạn |
| deliveryFinalFailureReason     | permanent_error, attempts_exhausted hoặc null |
| deliveryFailedAt               | Timestamp thất bại cuối cùng                  |
| deliveryOutcomeUnknown         | Chưa xác định provider đã chấp nhận hay chưa  |
| deliveryRequiresReconciliation | Cần đối soát trước khi quyết định gửi lại     |
| lastDeliveryCode               | Mã kết quả an toàn gần nhất                   |
| nextRetryAt                    | Lịch retry hoặc null                          |

Notification mới hoặc dữ liệu cũ có thể chưa có các trường bổ sung này.

Ví dụ trạng thái permanent sau khi adapter báo invalid token:

```json
{
  "deliveryStatus": "failed",
  "retryCount": 1,
  "deliveryFailureType": "permanent",
  "deliveryFinalFailure": true,
  "deliveryFinalFailureReason": "permanent_error",
  "deliveryOutcomeUnknown": false,
  "deliveryRequiresReconciliation": false,
  "lastDeliveryCode": "PROVIDER_INVALID_TOKEN",
  "nextRetryAt": null
}
```

Ví dụ trên minh họa một phần document, không phải API response.

## Timeout và lease hết hạn

Timeout hoặc lỗi mạng không chắc chắn không được tự động retry vì
provider có thể đã chấp nhận yêu cầu.

Lease hết hạn cũng không chứng minh lần gửi trước thất bại. Hệ thống
đánh dấu unknown và yêu cầu đối soát, tránh tự động gửi trùng.

Unknown không được coi là thất bại permanent đã xác nhận.
Task này chưa bổ sung công cụ đối soát hoặc thao tác gửi lại thủ công.

## Logging và bảo mật

- Giữ correlationId và eventId theo cơ chế CCF-152.
- Kết quả delivery và log được ghi trong cùng transaction.
- Chỉ lưu mã kết quả thuộc allowlist.
- Không lưu access token, device token, payload nhạy cảm, raw provider
  response hoặc message lỗi provider.
- Giữ nguyên kiểm tra JWT và tài khoản admin trong API tra cứu log.
- Lỗi gửi được worker xử lý riêng, không thêm lời gọi provider trực tiếp
  vào transaction nghiệp vụ cứu hộ.

## Bằng chứng kiểm thử local

Kết quả terminal chạy:

| Bộ test                             | Kết quả |
| ----------------------------------- | ------- |
| Notification failure policy         | 19 PASS |
| Notification transport              | 7 PASS  |
| Delivery Emulator regression        | 13 PASS |
| Retry worker Emulator regression    | 13 PASS |
| Delivery failure Emulator           | 6 PASS  |
| Delivery log validation             | 11 PASS |
| Delivery log Emulator               | 10 PASS |
| Admin notification log API Emulator | 14 PASS |

Bộ transport hiện in dòng tổng kết “All 6” dù có 7 case PASS.

Các kiểm tra cú pháp đã chạy không báo lỗi.
git diff --check không báo lỗi whitespace.

Một số test Emulator có MetadataLookupWarning nhưng các assertion
và dòng kết thúc test đều PASS. Chưa xác định nguyên nhân warning.

## Giới hạn

- Provider được giả lập trong kiểm thử; chưa xác minh push trên thiết bị.
- Task này không bổ sung scheduler chạy delivery worker hoặc tích hợp
  provider production.
- Test xác minh chính sách retry và trạng thái Firestore, không bảo đảm
  exactly-once delivery từ dịch vụ push bên ngoài.
