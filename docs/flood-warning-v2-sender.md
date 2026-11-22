# Warning V2 — sender FCM và vận hành (PHASE5)

Ngày22/11/2026. Nền PR150/develop be9d99c. Đây là code local chưa commit/push/deploy, không phải xác nhận Render/điện thoại đã nhận. API HTTP giữ nguyên. Báo cáo kết quả: backend/docs/flood-warning-v2-phase5-validation.md. Giao việc: handoff/flood-warning-v2/00_DOC_TRUOC.md.

## 1. Thiết kế gửi

`warning-v2-push-sender.service.js` đọc job PHASE4, tạo target theo hash(jobId,installationId,bindingId). General gửi các installation Resident hiện đủ quyền/token, không cần GPS. Một pass discovery theo document ID, cursor bền vững; chưa có thiết bị đủ điều kiện thì general còn pending để bắt kịp đăng ký sau. Khi đã discovery xong có target, parent chuyển dispatched: **chỉ là đã tạo target, không phải provider đã nhận**. Không tự mở lại parent để phát cho installation đăng ký sau đó. List bản tin vẫn đọc được.

Near/inside chỉ tới installation sinh GPS của job. Không lấy GPS máy A cảnh báo máy B đang nơi khác. Targets không lưu raw token/GPS/secret; lúc gửi đọc token hiện tại, kiểm tra claim/owner/binding/role/permission và đánh giá lại GPS/vùng liên quan. Đổi sequence nhưng vẫn điều kiện/tập nguồn phù hợp thì giữ event; hết60s/accuracy>100m/unknown/far hoặc nguồn liên quan đổi thì hủy.

Sổ chống trùng PHASE4 không reset. Gửi tới nhiều thiết bị với cùng eventId không tạo nhiều kind logic. Không hứa exactly-once: FCM/SDK có thể giao trễ/trùng; Android phải dedupe và reconcile theo hướng dẫn giao diện.

## 2. Tranh chấp, retry và unknown

Target pending/retry → leased (30s, UUID lease) → transaction preflight → sending → accepted/retry/failed/unknown/canceled. Chỉ lease owner được chuyển trạng thái. Nhiều process được bảo vệ bằng transaction; scheduler từng process không chồng tick.

Leased hết hạn khi chưa sending: reclaim an toàn. Sending hết lease: unknown terminal, không gửi lại. Provider accepted nhưng ghi DB thất bại cũng để sending rồi unknown, tránh resend mù. Timeout10s hoặc lỗi mạng/SDK chưa chứng minh bị từ chối: unknown terminal. Callback provider muộn không ghi đè trạng thái.

FCM mã quota/rate-limit/server-unavailable biết bị từ chối → retry60/120/240/480s, tối đa5 lần gọi provider. Mọi retry preflight lại. Lỗi payload/cấu hình/quyền provider → failed. Invalid token → failed và xóa đúng token còn hiện hành, tăng device revision; không xóa token mới/binding mới nếu response cũ về muộn. Không lưu raw error/provider response/token/message ID.

Lỗi DB/tải vùng trước sending: không gọi provider, retry preflight sau60s, attempts không tăng. Queue scan thất bại giữ cursor, log chỉ tên scan/nhãn cố định. Các scan khác vẫn chạy. Có thể có head-of-line delay trong một trang lỗi dai dẳng; phải giám sát failedScans và sửa dữ liệu/index/kết nối, không reset hàng loạt cursor/receipt.

Unknown cần đối chiếu log/FCM và trạng thái app bằng eventId; không có API reset/retry unknown tự động trong gói này. Lệnh read-only `node scripts/inspect-warning-v2-push.js <targetId64hex>` chỉ xem trạng thái an toàn, không resend. Không coi thao tác “đối chiếu” là được phép đặt pending lại.

## 3. Payload Android

Firebase Admin SDK messaging.send, data-only, không có notification block và không dùng topic do client tự đăng ký. Fields strings schemaVersion,eventId,alertId,kind,title,body,createdAt + installationId,bindingId. Đây là hai field bổ sung để app bỏ push khác phiên. title≤600byte, body≤2000byte, tổng JSON data≤3500byte, Unicode không cắt giữa mã; bản tin đầy đủ ở GET detail. Không sửa content4000 ký tự của API chỉ để vừa FCM.

General/control TTL1giờ; near/inside TTL0 để không xếp cảnh báo vị trí cũ lâu trong FCM. Priority high là yêu cầu gửi, không cam kết OS đánh thức/hiện. Data-only cho app quyền kiểm tra session/active/evaluation trước tạo local notification; cần thử background, Doze, force-stop và quyền Android thật.

App nhận control deactivated chỉ cancel local theo alertId và đồng bộ, không phát thông báo thứ tư. Ngoài control, mọi push/open/resume/reconnect phải đọc trạng thái mới. Không thể thu hồi lời gọi provider đã bắt đầu khi Admin tắt; app phải chặn late push.

Tài liệu SDK đối chiếu:
- https://firebase.google.com/docs/reference/admin/node/firebase-admin.messaging.androidconfig
- https://firebase.google.com/docs/cloud-messaging/error-codes
- https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type

## 4. Control tắt

PHASE4 cancellationComplete/status prepared → sender quét receipt của alert theo trang → tạo control job theo resident+alert+deactivated → status control_prepared. Chuẩn bị job control cho mọi Resident có receipt còn đủ quyền; allowlist chỉ chặn discovery/gửi, không làm mất control ngoài TEST. Collection riêng tránh PHASE4 coi control inactive là job phải hủy.

Control gửi tới thiết bị hiện đủ điều kiện, không dùng token lưu cũ. Không có thiết bị thì chờ; app offline phải sync ở lần mở tiếp. Người dân chưa có receipt có thể vẫn đọc list; app tự reconcile lịch sử, không dựa hoàn toàn vào control.

## 5. Cấu hình (giá trị không phải secret)

| Biến | Mặc định/mục đích |
|---|---|
| FLOOD_WARNING_V2_EVENT_WORKER_ENABLED | false; PHASE4 chuẩn bị/hủy |
| FLOOD_WARNING_V2_PUSH_ENABLED | false; bật sender riêng |
| FLOOD_WARNING_V2_PUSH_MODE | test hoặc live, bắt buộc khi bật sender |
| FLOOD_WARNING_V2_TEST_RECIPIENT_IDS | CSV user ID tài khoản TEST; test bắt buộc nonempty; live bắt buộc trống |

Không set cờ để bật provider khi FIRESTORE_EMULATOR_HOST có giá trị; startup từ chối. Tests inject provider giả, không gọi FCM thật. Worker V1 FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED độc lập, không tự bật/tắt hay dùng thay V2.

ProductionSender dùng Firebase app/config hiện có. Không thêm key vào Git hoặc frontend. Firebase project service account và Android google-services phải khớp, bật API/quyền gửi tương ứng và kiểm tra app package trên thiết bị TEST. Token lấy từ app thật, không dùng placeholder trong fixture.

## 6. Dữ liệu, Rules, indexes và lưu giữ

Collections PHASE5: warning_v2_push_targets, warning_v2_control_jobs, warning_v2_push_cursors. Cùng các collection PHASE3/4 phải chặn client đọc/ghi trực tiếp; chỉ Backend Admin SDK truy cập. Mẫu rules `backend/config/warning-v2-private.rules.example` là gợi ý audit, **không thay rules toàn project**. Firestore allow nhiều match là OR: một deny riêng không chặn được wildcard allow đang tồn tại. Chưa xác nhận Rules production.

`backend/config/warning-v2-required-indexes.json` liệt kê composites đang dùng; phải merge với indexes project hiện có, không xóa/ghi đè cấu hình các tính năng khác. Single-field indexes mặc định cho equality/documentId cần còn bật. Emulator không chứng minh indexes production; test query thật trong môi trường TEST trước bật worker.

Không TTL/xóa receipt chống trùng, registration receipt, job/target unknown hoặc alert inactive trong gói này. Giữ xuyên vòng đời bản tin để không reset dedupe. Chưa có cron dọn dữ liệu; phải theo dõi quota/retention với Phú. Token hiện tại giữ ở device; unbind xóa token/GPS theo PHASE3. Không tự truncate queue để giảm quota.

## 7. Rollout và rollback

1. Nhập gói vào nhánh mới từ develop be9d99c, chạy suite/Emulator trên Windows, review đúng diff. Phú tự quyết định commit/push/PR/merge.
2. Sau merge: deploy Backend với cả hai cờ V2 false. Xác nhận deploy SHA, baseURL và API bằng tài khoản TEST; health200 chưa đủ.
3. Audit Rules/indexes/IAM; nhóm nối UI vào đúng build. TEST trên Firebase/project tách biệt được ưu tiên. Allowlist chỉ giới hạn push, không giấu bản tin TEST khỏi list những user khác trên cùng DB.
4. Với môi trường TEST Phú duyệt, event worker true; sender true, mode test, danh sách TEST ID. Tạo duy nhất bản tin có tên TEST ONLY, thử nhận, near/inside, edit/tắt, token/permission/account/background. Không chạy Runner bulk hoặc phát thử người dân thật.
5. Chỉ sau nghiệm thu mới cân nhắc mode live và bỏ allowlist. Trước chuyển: tắt/deactivate mọi bản tin TEST đúng ID, rà pending/unknown/targets; không phát backlog TEST ra toàn bộ người dùng. Bật live cần Phú quyết định riêng.
6. Rollback nhanh: PUSH_ENABLED=false và EVENT_WORKER_ENABLED=false, redeploy/restart có kiểm soát. Không reset/delete ledger/receipt/queue. API list/detail vẫn phục vụ; không quay serializer V1 vào UI V2. Lời gọi FCM đã bay không thể thu hồi.

Mỗi tick mặc định15s sau tick trước kết thúc, batch20/scan và discovery20/parent. Provider timeout10s/target, nhiều target có thể làm tick dài hơn15s; không có cam kết latency. Đo tải/chi phí và TTL60s với số thiết bị thực; chưa load-test production. Shutdown server giới hạn15s; nếu bị kết thúc giữa sending thì recovery unknown giữ an toàn chống resend.
