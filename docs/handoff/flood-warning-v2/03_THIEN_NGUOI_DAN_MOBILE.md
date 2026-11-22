# Thiên — Người dân Mobile

## Phạm vi

Tab Người dân trong HTML: Tổng quan có count active, bản mới nhất, xem tất cả; list/filter; detail đúng ID; map/bộ vùng và khối vị trí hiện tại. Bản tin chung đọc được dù không GPS hoặc không cho thông báo. near/inside đỏ theo evaluation Backend; far/unknown không ghi “an toàn”. Không có bản tin active thì bỏ khối đỏ.

## API

GET /api/flood-alerts, /active, /:alertId, /zones. GET /api/flood-alerts/location-evaluation và PUT /api/flood-alerts/location chỉ role resident. PUT/GET/DELETE /api/notification-devices/:installationId theo tài liệu `../../flood-warning-v2-device-gps.md`.

Đọc đầy đủ hướng dẫn thiết bị trước code: installationId+secret cho lần cài; registrationId cho phiên; GET reconcile rồi PUT expectedBindingId/expectedRevision; token refresh giữ binding; sequence tăng; retry giữ nguyên mẫu; generation loại callback cũ. Không cho client chọn residentId hoặc kết luận vị trí.

## FCM Android chung — Thiên sở hữu, phối hợp Phú

Một FirebaseMessagingService và một bộ session/binding/token dùng chung. Role resident mới đăng ký push; Rescue không đăng ký thiết bị nhận cảnh báo GPS. Không đè GPS SOS hoặc dùng vị trí SOS làm origin cảnh báo. Không tạo service/uploader thứ hai tranh tài nguyên.

Data-only có schemaVersion/eventId/alertId/kind/title/body/createdAt/installationId/bindingId. Đọc `05_QUY_UOC_CHUNG.md` trước hiện notification. Deep-link tới đúng alertId, đọc trạng thái mới; không tạo thông báo thứ tư khi kind deactivated. Dedupe bền vững; token/quyền thay đổi gọi update tuần tự; logout hủy đúng binding trước mất JWT khi có mạng, luôn dừng local ngay.

Không lấy GPS làm mới timestamp từ mẫu cache. unavailable phải gửi sequence mới với reason chuẩn và null dữ liệu. Mất mạng không phát lại backlog vị trí. Đọc validUntil và tự hết trạng thái hiện hành khi quá hạn dù chưa có response mới. Tần suất uploader/background cần đo trên thiết bị, không tự coi nhịp Backend15s là yêu cầu upload15s. Giữ quyền, pin và hạn chế Android; không tự thêm thư viện thiếu thống nhất.

## Source cần rà

`ui/screens/warning/*`, domain Warning model, DTO/API/repository, navigation từ Tổng quan, receiver/token/session. Các consumer V1 severity/areaId/startAt/endAt cần đổi cùng adapter; không làm một màn mới bỏ consumer cũ lỗi. Shared AppNavGraph/ApiClient do Thiên+Phú thống nhất trước sửa.

## Bàn giao lại

PR/SHA/APK variant/applicationId/baseURL; unit/build; ảnh mọi trạng thái. Thiết bị thật: cho/từ chối/thu hồi quyền, GPS off/no fix/stale/accuracy;499/500/501m bằng dữ liệu TEST hợp lệ; nhiều vùng/nhiều active; edit/tắt; FCM foreground/background/Doze/force-stop/token refresh/offline; deep-link404/inactive; logout A→B có push/response A đến muộn; SOS/map/Điểm tránh trú hồi quy. Ghi expected/actual, log an toàn và mọi ca chưa chạy. Không gửi token/secret/key trong báo cáo.
