# Flood Warning V2 — tin nhắn giao việc

**Bộ giao việc thay thế ngày22/11/2026:** `handoff/flood-warning-v2/00_DOC_TRUOC.md` và bốn file theo Huy/Khoa/Thiên/Phú. API đã merge tới PR150/be9d99c, sender PHASE5 đang local chưa deploy. Các tin nhắn bên dưới giữ làm lịch sử, không dùng trạng thái “API chưa có” để kết luận source hiện tại. UI gốc đã duyệt có trong thư mục bàn giao mới.

Tài liệu: docs/flood-warning-v2-api.md. Fixture: docs/examples/flood-warning-v2.json.
Nền 0314e88. Đây là contract mới chưa có API live. Chỉ gắn link GitHub sau khi Phú đã push đúng nhánh/commit và xác minh link tồn tại.

Cập nhật gói PHASE3: code local đã có lifecycle, zones, liên kết thiết bị và GPS riêng Resident; chưa push/merge/deploy các thay đổi code này. FCM/worker vẫn chờ. Thiên đọc thêm `docs/flood-warning-v2-device-gps.md`: PUT device bắt buộc expectedBindingId/expectedRevision, có GET installation để reconcile; không dùng callback đăng nhập cũ tự cập nhật phiên bản rồi rebind. Các tin nhắn dưới mô tả giao việc ban đầu; trạng thái triển khai hiện tại xem `backend/docs/flood-warning-v2-phase3-validation.md`.

## Gửi Huy — Admin Web

Huy cập nhật Cảnh báo lũ theo contract V2, dựa HTML mẫu nhóm đã duyệt. Form chỉ có tiêu đề và nội dung/hướng dẫn. Bỏ mức độ, chọn vùng, lịch bắt đầu/kết thúc. Tạo thành công active, Backend tự ghi giờ; có thể nhiều bản tin active. Danh sách/summary có Tất cả/Đang bật/Đã tắt; thời gian GMT+7. Chi tiết sửa title/content khi active, giữ ID/startAt; tắt có xác nhận và giữ lịch sử. Inactive chỉ xem, không bật lại/xóa. Giữ idempotency key khi timeout tạo, dùng expectedRevision khi sửa và đọc lại khi409/timeout. Có loading/empty/error/retry, lỗi refresh giữ dữ liệu có nhãn chưa cập nhật. Làm UI bằng fixture trước, chưa gọi Render theo body mới; API mới chưa triển khai. Nối các endpoint Admin đúng tài liệu khi Phú thông báo môi trường sẵn sàng. Không sửa Backend hoặc consumer SOS ngoài phần được giao.

## Gửi Thiên — Resident Mobile và FCM Android chung

Thiên cập nhật Cảnh báo lũ V2 theo HTML/contract. Mọi Resident xem bản tin chung dù ở xa/không GPS. Tổng quan có số bản tin active, bản mới nhất và Xem tất cả; list đủ bản tin, filter all/active/inactive, detail đúng ID và map. Khối đỏ theo evaluation Backend khi inside/near; ba nhóm current/history/low, low gồm radar lẫn vùng Admin low_lying. GPS chỉ dùng khi age<=60s và accuracy<=100m; hiển thị timestamp, stale/permission disabled/poor accuracy là unknown. Nhiều vùng xem đủ, inside trước near; không tính theo tâm/đường bộ và không tự đổi null thành0. Mất mạng giữ dữ liệu có nhãn chưa cập nhật. Thiên sở hữu MessagingService/token/notification permission/installation binding dùng chung, phối hợp Phú để không xung đột SOS uploader/navigation. Push mở đúng ID và kiểm tra trạng thái mới; logout/switch account loại phản hồi cũ, cancel local khi inactive. Dedupe theo user+alert+kind, không reset khi mở app. Bắt đầu với fixture; API/FCM V2 chưa live, chưa coi push mẫu là nghiệm thu.

## Gửi Khoa — Rescue Web

Khoa làm Cảnh báo lũ V2 cho Rescue Web: list, Tất cả/Đang bật/Đã tắt, detail, xem vùng trên map, lỗi/empty/retry. Rescue chỉ đọc. Bỏ severity, vùng đơn và tự kết thúc theo endAt ở banner/map/dashboard; active có endAt=null. Đọc cùng ID và scope all_published_zones. Map dùng bộ zones chuẩn hóa, ba nhóm và nguồn rõ; radar+Admin low_lying đều Vùng trũng. Chỉ bật/tắt layer hiển thị, không thay phạm vi bản tin. Danh sách/newest và thời gian GMT+7; inactive vẫn xem lịch sử, không nút quản lý. Có nhiều alert active thì không âm thầm chỉ lấy một và bỏ các bản còn lại. Bắt đầu UI/adapter bằng fixture V2, chờ Phú báo API mới sẵn sàng. Kiểm tra hồi quy Rescue SOS/map vì hiện banner và sosMapData còn dùng severity/areaId/endAt cũ. Không thay lịch sử thành thông tin ngập thực tế hiện tại.

## Phú — Backend và Rescue Mobile

Backend làm theo contract V2 cùng geometry normalized cho mọi client, transaction/idempotency/revision/dedup và quyền tài khoản hiện tại; không tự chuyển V1 thành active vô hạn. General broadcast bỏ subscription vùng; FCM cần triển khai provider/token/binding/worker thực và kiểm thử TEST. Chuẩn hóa radar+Admin low_lying; HIST thiếu polygon báo partial. Rescue Mobile có entry Tổng quan->Cảnh báo lũ->List->Detail->Map, filter status, GMT+7, loading/empty/error/stale, không quản lý. Phối hợp Thiên file Android chung, không tạo uploader/SOS flow song song. Chỉ nghiệm thu khi có log đúng SHA, test cả app thật; push/PR/merge/deploy do Phú quyết định.

## Gửi Tú — kiểm thử

Tú đọc contract V2 và checklist docs/flood-warning-v2-implementation-plan.md. Tách Backend, Admin Web, Resident Mobile, Rescue Web, Rescue Mobile; mỗi ca ghi build/source SHA, baseURL, role, dữ liệu, thao tác, expected/actual và log. Ưu tiên lifecycle, quyền, retry tạo, nhiều active, 499/500/501m, age60s và accuracy100m, radar+Admin low_lying, HIST thiếu polygon, dedup/multi-region, disable/late-push, GPS nền/offline/switch account; regression SOS/map/Safe Locations. Fixture không chứng minh FCM thật/địa lý thật. Chưa test broadcast trên production khi chưa có TEST allowlist hoặc môi trường tách biệt Phú duyệt. Không dùng mật khẩu/token trong report, không xóa dữ liệu thật. API V2 chưa live; có thể chuẩn bị ca và kiểm tra UI mock trước.
