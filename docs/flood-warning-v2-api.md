# FLOODGUARD — Flood Warning V2 API contract

Ngày soạn: 22/11/2026, giờ Việt Nam. Nghiệp vụ đã được Phú duyệt trong chat.
Nền source đã đọc: `0314e88af283ecb580b20bb99fc559d77eb49ea0` (develop, PR #148).

**Trạng thái cập nhật PHASE5: API lifecycle/bộ vùng/thiết bị/GPS và worker PHASE4 đã merge tới PR150, commit be9d99c. Gói sender FCM PHASE5 đã có code local, chưa commit/push/merge/deploy. Chưa xác minh Render/FCM/điện thoại thật. Xem docs/flood-warning-v2-sender.md và backend/docs/flood-warning-v2-phase5-validation.md.**
Kết quả và giới hạn giai đoạn 1: `backend/docs/flood-warning-v2-phase1-validation.md`. Chưa coi toàn bộ contract đã hoạt động; nhóm tiếp tục dùng fixture cho các phần chưa có.
Kết quả giai đoạn2A: `backend/docs/flood-warning-v2-phase2-validation.md`. Trạng thái503 chưa triển khai của API binding/GPS trong báo cáo đó đã được thay thế bởi giai đoạn2B; xem `backend/docs/flood-warning-v2-phase3-validation.md` và hướng dẫn `docs/flood-warning-v2-device-gps.md`. Báo cáo trước vẫn là bằng chứng của đúng bản trước.
Tên endpoint, field và các giới hạn kỹ thuật dưới đây là đặc tả triển khai ở bước 2, không phải mô tả API V1 đang live.
UI dùng fixture trong `docs/examples/flood-warning-v2.json` trước khi nối API thật.

## 1. Quyết định nghiệp vụ

- Admin nhập `title`, `content`; tạo thủ công và bật ngay. Nhiều bản tin active được phép.
- Backend ghi `startAt`, `createdAt`, `updatedAt`; `endAt=null` khi active.
- Chỉ sửa title/content khi active; giữ ID/startAt; sửa không phát lại push hoặc reset chống lặp.
- Admin tắt: inactive, ghi endAt một lần. Không bật lại, sửa hoặc xóa bản tin đã tắt.
- Đợt mới tạo ID mới; bản tin inactive vẫn có trong lịch sử.
- Phát bản tin chung cho toàn bộ Resident, độc lập GPS/đăng ký vùng. Gửi push chỉ tới thiết bị đủ điều kiện.
- Scope luôn là tất cả vùng đang công bố, không phụ thuộc viewport, zoom, công tắc lớp.
- GPS: tuổi 0..60 giây và accuracy 0..100 m (bao gồm các biên); tọa độ/thời gian/accuracy phải hợp lệ.
- Trong hoặc trên ranh giới -> inside; ngoài và cách ranh giới <=500 m -> near; ngoài >500 m -> far.
- Chống lặp theo (residentId, alertId): một general, tối đa một near, tối đa một inside. Inside đã được ghi nhận thì chặn near về sau.
- Giao diện luôn đánh giá lại trạng thái hiện tại; chống lặp chỉ giới hạn sự kiện thông báo.

## 2. Quy ước HTTP và dữ liệu

- Prefix: `/api`. Ví dụ local: `http://127.0.0.1:5003/api` (cổng đề xuất cho lượt triển khai mới, chưa xác nhận server đang chạy).
- Render đã dùng của dự án: `https://floodguard-backend-demo.onrender.com/api`. **Chưa được dùng để kiểm thử V2 chỉ vì health trả 200.**
- JWT hiện có từ `POST /api/auth/login` với `{identifier,password}`; `Authorization: Bearer <token>`.
- Toàn bộ endpoint V2 dưới đây yêu cầu tài khoản còn tồn tại/active và role hiện tại trong DB, không chỉ role nằm trong JWT cũ.
- JSON có success boolean, message string; thành công có data; lỗi có code. Message không dùng để phân nhánh logic.
- UTC ISO 8601 dạng `2026-11-22T01:00:00.000Z`; giao diện hiển thị `Asia/Ho_Chi_Minh` (GMT+7).
- Tọa độ object: `{latitude,longitude}`; GeoJSON: `[longitude,latitude]`.
- Khoảng cách `distanceToBoundaryM` đơn vị mét, chưa làm tròn. Đây không phải khoảng cách đến tâm, ORS hoặc quãng đường di chuyển.
- Không tự đổi null thành 0, chuỗi rỗng hoặc thời gian hiện tại. Không có trường khoảng cách theo đường bộ trong contract này.
- `schemaVersion=2` bắt buộc ở object bản tin. Response V1 không được coi là danh sách V2 rỗng.
- ID không mang ý nghĩa thời gian; chỉ lấy ID Backend trả về. Danh sách mới nhất trước theo startAt, bằng nhau theo ID tăng dần.
- Các giới hạn kỹ thuật của bản contract: title trim dài 1..180 ký tự; content trim dài 1..4000 ký tự; q tối đa 180 ký tự.

## 3. Danh sách endpoint mục tiêu

| Method | Path sau /api | Role | Công dụng |
|---|---|---|---|
| GET | /flood-alerts | resident, rescue, admin | Danh sách V2, cả lịch sử |
| GET | /flood-alerts/active | resident, rescue, admin | Alias danh sách status=active |
| GET | /flood-alerts/zones | resident, rescue, admin | Bộ vùng chuẩn hóa cho bản đồ và đối chiếu |
| GET | /flood-alerts/location-evaluation | resident | Đọc đánh giá của chính thiết bị đang liên kết; không tạo push mới chỉ vì GET |
| PUT | /flood-alerts/location | resident | Gửi GPS mới hoặc trạng thái không dùng được vị trí |
| GET | /flood-alerts/:alertId | resident, rescue, admin | Chi tiết V2 |
| GET | /admin/flood-alerts | admin | Danh sách quản lý, cùng DTO V2 |
| GET | /admin/flood-alerts/summary | admin | Tổng/all, active, inactive của V2 |
| GET | /admin/flood-alerts/creation-requests/:requestId | admin | Đối chiếu kết quả tạo bằng khóa của chính Admin |
| GET | /admin/flood-alerts/:alertId | admin | Chi tiết quản lý |
| POST | /admin/flood-alerts | admin | Tạo active và ghi sự kiện phát chung |
| PATCH | /admin/flood-alerts/:alertId | admin | Sửa title/content khi còn active |
| POST | /admin/flood-alerts/:alertId/deactivate | admin | Tắt, lặp an toàn |
| PUT | /notification-devices/:installationId | resident | Liên kết installation với tài khoản và cập nhật FCM/quyền |
| GET | /notification-devices/:installationId | resident + installation secret | Đọc phiên bản liên kết để reconcile; không trả danh tính chủ khác hoặc GPS |
| DELETE | /notification-devices/:installationId | resident | Hủy đúng liên kết hiện tại trước logout |

Route tĩnh active/zones/location/location-evaluation/summary/creation-requests phải được khai báo trước `/:alertId`.
Không có endpoint kích hoạt lại hoặc DELETE bản tin.
Không thêm Web Push trong lượt này. Rescue không nhận push cảnh báo GPS theo nghiệp vụ này.

## 4. Object bản tin

```json
{
  "id": "TEST-WARN-V2-001",
  "schemaVersion": 2,
  "title": "TEST ONLY - Mưa lớn và nguy cơ ngập",
  "content": "Dữ liệu kiểm thử, không phải bản tin thực tế.",
  "status": "active",
  "scope": "all_published_zones",
  "startAt": "2026-11-22T01:00:00.000Z",
  "endAt": null,
  "createdAt": "2026-11-22T01:00:00.000Z",
  "updatedAt": "2026-11-22T01:00:00.000Z",
  "revision": 1
}
```

Mọi field trên đều có trong response. Chỉ endAt được null; status chỉ active/inactive, scope cố định.
Inactive có endAt khác null, endAt>=startAt. revision là số nguyên dương để chống ghi đè nội dung đồng thời.
Không trả severity, areaId, upcoming/expired hoặc thời gian do Admin tự nhập trong DTO V2.

### GET danh sách / chi tiết / summary

- Query danh sách: status tùy chọn active/inactive; bỏ status là tất cả. q tùy chọn, tìm không phân biệt hoa thường trong title/content. Query không hỗ trợ ->400.
- Response danh sách: `{success:true,message:"...",data:{schemaVersion:2,floodAlerts:[],serverTime:"..."}}`.
- Contract lượt này trả toàn bộ bản tin phù hợp, chưa phân trang; không âm thầm giới hạn kết quả. Nếu cần phân trang về sau phải sửa contract/client cùng nhau.
- Chi tiết: `data:{floodAlert:<object>,serverTime:"..."}`. Không tồn tại hoặc không phải V2 ->404.
- Summary: `data:{schemaVersion:2,total:3,active:2,inactive:1,serverTime:"..."}`; đếm toàn bộ V2, không phụ thuộc q/bộ lọc đang chọn.
- Inactive chỉ trả dữ liệu bản tin; bản đồ nếu mở sử dụng bộ vùng hiện tại và phải ghi rõ đây không phải ảnh chụp vùng tại thời điểm tắt.

## 5. Tạo, sửa, tắt và timeout

### POST /admin/flood-alerts

- Header bắt buộc `Idempotency-Key`: UUID v4 do client tạo một lần cho một thao tác tạo; giữ qua retry/timeout.
- Body chính xác `{title,content}`. Field khác (severity,areaId,status,startAt,endAt,scope,revision...) ->400.
- Transaction lưu V2 active, server timestamps, bản ghi idempotency và sự kiện phát chung bền vững. Không gọi FCM trong transaction.
- Lần đầu 201, `data:{floodAlert,idempotency:{requestId,replayed:false},broadcast:{status:"queued"}}`.
- Cùng Admin+key+cùng body đã chuẩn hóa ->200, cùng ID, replayed=true; không tạo sự kiện phát thứ hai.
- Cùng key+body khác ->409 IDEMPOTENCY_CONFLICT. Không tự chuyển sang key mới khi chưa rõ kết quả.
- Broadcast queued chỉ có nghĩa đã ghi công việc phát, không đồng nghĩa tất cả điện thoại đã nhận.
- Replay trả trạng thái hiện tại của cùng bản tin; nếu đã tắt thì trả inactive và broadcast.status=canceled, không bật/gửi lại.
- Phải xác thực và kiểm tra quyền hiện tại cả khi replay. Các khóa idempotency phải giữ xuyên vòng đời bản tin ở lượt này.
- GET creation-requests/:requestId: `data:{requestId,floodAlert}` nếu đã ghi nhận. 404 CREATION_REQUEST_NOT_FOUND không chứng minh request đang bay sẽ không commit; vẫn giữ key và chỉ retry cùng body/key.
- Khi sửa nội dung form sau timeout: đối chiếu thao tác cũ xong rồi mới quyết định tạo thao tác mới.

### PATCH /admin/flood-alerts/:alertId

- Body `{expectedRevision:1,title?:"...",content?:"..."}`; ít nhất một field nội dung; null/chuỗi trắng không hợp lệ.
- Backend xác thực Admin, đọc bản tin và kiểm tra active+revision trong cùng transaction.
- Khác revision ->409 ALERT_REVISION_CONFLICT; inactive ->409 ALERT_ALREADY_INACTIVE.
- Giữ ID/startAt/createdAt, tăng revision khi có thay đổi thực; cập nhật updatedAt. Patch không đổi nội dung là no-op, không phát thông báo.
- 200: `data:{floodAlert}`. Timeout ->GET lại chi tiết và đối chiếu revision/nội dung; không ghi đè mù.

### POST /admin/flood-alerts/:alertId/deactivate

- Body `{}` hoặc không có body. Không nhận thời gian từ client.
- Transaction active->inactive, ghi endAt/updatedAt và tăng revision đúng một lần. Inactive->200 no-op giữ nguyên thời gian/revision.
- 200: `data:{floodAlert,changed:true|false}`. Không tồn tại ->404.
- Sửa đồng thời tắt: nếu tắt thắng, sửa bị từ chối; nếu sửa thắng trước, tắt kết thúc bản tin với nội dung mới. Không hồi sinh bản tin.
- Dừng/hủy công việc còn chờ và kiểm tra lại active trước từng lần gọi provider. Request đã bắt đầu gửi/provider đã nhận có thể đến trễ; không cam kết thu hồi được push đang bay.
- Timeout ->GET bản tin; nếu vẫn active có thể gọi tắt lại. Không tạo ID mới.

## 6. Bộ vùng chuẩn hóa (GET /flood-alerts/zones)

- Không nhận bbox, bán kính hoặc bộ lọc layer để giảm phạm vi đối chiếu.
- `data:{zonesRevision,generatedAt,coverage,geojson}`; geojson là FeatureCollection.
- Mỗi Feature có geometry Polygon/MultiPolygon hợp lệ hoặc null nếu dữ liệu có bản ghi nhưng chưa đủ hình học.
- properties gồm zoneId, group, name, sourceKind, sourceId, source, recordedAt, dataUpdatedAt, datasetVersion, geometryStatus.
- group enum: current_flood / historical_flood / low_lying.
- Trường hợp dữ liệu Admin chưa phân loại: group=null, geometry=null, geometryStatus=invalid và diagnostic unclassified_area; không được tự coi là ngập hiện tại. name/source/thời điểm có thể null khi nguồn chưa cung cấp; UI dùng nhãn loại/nguồn thay tên trống, không bịa địa danh.
- geometryStatus enum: valid / missing / invalid. Các thời điểm/nguồn chưa có ->null; generatedAt không được giả làm thời điểm ghi nhận ngập.
- `coverage:{status:"complete"|"partial"|"unavailable",totalZones,evaluableZones,unassessableZones}`. Nguồn tải thất bại không được coi là nguồn rỗng; ghi chẩn đoán reason,sourceKind,zoneId (zoneId được null khi lỗi cả nguồn).
- zonesRevision là dấu vân tay ổn định của dữ liệu chuẩn hóa, đổi khi thêm/sửa/xóa dữ liệu; không đổi chỉ vì GET lại.

| Nguồn ở nền 0314e88 | Nhóm V2 | Quy tắc |
|---|---|---|
| flood_areas, areaType=flood | current_flood | Chuẩn hóa geometry.points sang GeoJSON |
| flood_areas, areaType=low_lying | low_lying | Vùng trũng do Admin quản lý |
| historical_flood_area_overrides + các HIST gốc đang công bố | historical_flood | Giữ nhận diện lịch sử theo nguồn; áp dụng sửa/xóa mềm hiện hành |
| FLOODGUARD_FLOODMAP_RADAR.geojson | low_lying | Radar thuộc nhóm Vùng trũng, giữ dấu nguồn radar |

- ID vùng có namespace (ví dụ admin:<id>, history:HIST-01, radar:<stable-feature-hash>) để không trùng giữa nguồn. Radar cần cấp ID ổn định, không sinh UUID mới mỗi GET.
- HIST chỉ có Point và chưa có polygon ->geometry=null, đưa vào unassessableZones. Không tự dựng vùng từ một điểm.
- Buffer lịch sử là hình học tham khảo, không tự dùng thay ranh giới của HIST hoặc coi là nhóm cảnh báo thứ tư.
- Vùng chưa phân loại không được tự mặc định thành current_flood; ghi nhận không đối chiếu được để Admin rà soát.
- Polygon phải đóng ring, đủ diện tích và không tự cắt; hỗ trợ MultiPolygon và holes. Điểm trên ranh giới tính inside; lòng hole không phải phần bên trong polygon.
- GeoJSON được kiểm tra topology bằng JSTS; không sửa polygon sai hoặc dựng buffer. Hình học cắt qua đường đổi ngày chưa tách, hoặc trên100.000 đỉnh/vùng, được báo invalid thay vì tính theo outline sai. Dữ liệu khu vực hiện có không chạm giới hạn này.
- Kiểm tra trong vùng trước; ngoài thì tính khoảng cách địa lý tới đoạn ranh giới gần nhất (bao gồm holes khi thích hợp). Không dùng tâm/đỉnh gần nhất hoặc buffer thay thế.
- Khoảng cách dùng Turf geodesic, đơn vị mét, là ước tính theo mô hình địa lý của thư viện. Chỉ có dung sai số học1e-7m tại mốc500m để xử lý sai số dấu phẩy động; giá trị đó được chuẩn về500m, không mở rộng bán kính nghiệp vụ.
- Bản đồ và đánh giá dùng cùng bộ chuẩn hóa/revision. Tắt layer ở client chỉ đổi hiển thị.
- HTTP200 vẫn trả các bản ghi có geometry=null và coverage unavailable nếu đã đọc được bản ghi nhưng không có outline dùng được. HTTP503 khi không tải được bản ghi vùng nào và có lỗi nguồn; không biến lỗi thành danh sách rỗng thành công.

## 7. Thiết bị và liên kết tài khoản

PUT /notification-devices/:installationId:

```json
{"platform":"android","fcmToken":null,"notificationPermission":"denied","registrationId":"50000000-0000-4000-8000-000000000001","expectedBindingId":null,"expectedRevision":0}
```

- installationId/registrationId là UUID v4; installationId cố định cho lần cài, registrationId tạo cho mỗi phiên đăng nhập/liên kết mới, giữ nguyên khi retry cùng lần đăng ký.
- fcmToken là chuỗi opaque ASCII in được, không chứa khoảng trắng, dài1..4096 ký tự hoặc null; không phân tích cấu trúc token hoặc trả token trong response/log.
- notificationPermission: granted/denied/unknown. permission denied không ngăn xem bản tin hoặc gửi GPS.
- 200: `data:{device:{installationId,bindingId,revision,platform:"android",notificationPermission,pushEligible,updatedAt}}`. pushEligible chỉ cho biết đủ token/quyền/liên kết, không xác nhận FCM hợp lệ hoặc push đã gửi.
- Bổ sung kỹ thuật2B chống request phiên cũ: body PUT đúng6 keys như ví dụ; expectedBindingId và expectedRevision bắt buộc. Lần đầu null/0; lần sau dùng phiên bản vừa đọc, kể cả sau unbind. Mỗi thay đổi thực tế tăng revision. Retry đúng body gần nhất giữ revision/binding, không ghi lặp. Không sửa expectedRevision của một callback cũ rồi gửi lại.
- GET /notification-devices/:installationId với JWT Resident + X-Installation-Secret trả `data:{installation:{installationId,bindingId,revision,active,boundToCurrentAccount}}`. Installation chưa tồn tại trả null/0/false/false. Có secret đúng mới được đọc installation đã có; không trả ownerId, registrationId, FCM token hoặc GPS. Chỉ reconcile cho phiên đăng nhập hiện tại, không dùng để làm sống lại thao tác phiên cũ.
- Binding theo chủ tài khoản hiện tại, thay khi đổi account/registrationId; retry cùng registrationId không xoay binding. Token refresh cập nhật cùng liên kết.
- Backend phải bảo vệ việc nhận chủ thiết bị, không cho chiếm liên kết chỉ bằng đoán installationId; chi tiết xác thực installation được kiểm chứng khi cài đặt FCM, không tin recipientId/role do client tự gửi.
- Cơ chế mục tiêu: app sinh installation secret ngẫu nhiên tối thiểu 256 bit cho lần cài, lưu an toàn; header `X-Installation-Secret` gửi qua HTTPS ở đăng ký/cập nhật/vị trí/hủy binding. Backend chỉ giữ hash, kiểm tra secret khi installation đã tồn tại. Không chỉ dựa vào UUID. Mất secret thì tạo installation mới, không tự chiếm installation cũ; xử lý token trùng phải được kiểm thử khi triển khai. Không trả/ghi log secret, token hoặc binding credential thô.
- Các endpoint vị trí/đọc đánh giá/hủy thiết bị gửi headers `X-Installation-Id` và `X-Device-Binding-Id`; JWT phải là owner binding hiện tại. Không khớp ->409 DEVICE_BINDING_CHANGED.
- DELETE /notification-devices/:installationId hủy đúng binding; lặp cùng binding đã hủy ->200, binding cũ không được hủy binding của account mới. Dừng vị trí gắn binding, giữ sổ chống lặp theo Resident.
- DELETE không có body hoặc body rỗng; installationId URL khớp header. Trả `data:{installationId,bindingId,unbound:true}`. Token xóa khỏi device, mẫu GPS hiện tại xóa nội dung; receipt đăng ký giữ để chặn request cũ. GET installation để đọc revision mới trước đăng ký mới. Sau logout dùng registrationId mới, không hồi sinh ID phiên đã thay thế/hủy.
- Token trùng installation khác trả409 DEVICE_TOKEN_CONFLICT, không tự chuyển quyền. Unbind hợp lệ mới giải phóng claim. Mất secret thì dùng installation/secret mới; token cũ bị claim cần chủ cũ hủy hoặc xử lý quản trị có kiểm chứng, chưa có API hỗ trợ tự động giai đoạn2B.
- Logout: hủy binding khi có mạng, dừng uploader và xóa dữ liệu vị trí/cache tài khoản cũ. Offline: ngừng cục bộ ngay; không gửi dữ liệu người mới bằng token cũ. Đăng nhập lại phải reconcile binding trước đăng ký/gửi GPS mới.
- Lượt này push Android dành Resident. Các phần dùng chung phải phối hợp để không xóa thiết bị/SOS notification thuộc module khác một cách mù.

## 8. Gửi và đọc đánh giá vị trí

PUT /flood-alerts/location (Resident; headers binding như mục 7):

```json
{
  "sequence": 1,
  "availability": "available",
  "reason": null,
  "location": {"latitude":16.0544,"longitude":108.2022},
  "capturedAt":"2026-11-22T01:00:20.000Z",
  "accuracyM":20
}
```

- sequence số nguyên dương tăng trong một binding; lưu qua khởi động lại, không reset khi retry.
- availability available/unavailable. available bắt buộc location/capturedAt và có key accuracyM (number hoặc null khi thiết bị chưa báo accuracy); reason=null. Không nhận residentId, zoneId, alertId hoặc kết luận do client gửi.
- unavailable: reason thuộc permission_denied/location_disabled/no_fix; location/capturedAt/accuracyM đều null; vẫn gửi sequence mới để vô hiệu mẫu trước.
- Số phải hữu hạn; latitude [-90,90], longitude [-180,180], accuracyM nếu là number phải >=0. Timestamp UTC hợp lệ, không ở tương lai so với server. Body malformed ->400, không thay thế mẫu hợp lệ trước.
- Mẫu đúng cấu trúc nhưng quá 60 giây hoặc accuracy>100/null vẫn trả200 với đánh giá unknown: stale_location/poor_accuracy. Không biến nó thành far hoặc tạo cảnh báo trong/gần.
- Backend ghi receivedAt/evaluatedAt bằng giờ server, không lấy client để giả thời điểm nhận.
- Sequence cũ ->409 LOCATION_SEQUENCE_CONFLICT. Cùng sequence+cùng body replay an toàn, không tạo push lần hai; cùng sequence+body khác ->409.
- Gửi mới phải vô hiệu kết quả request cũ; response có binding/sequence, evaluatedAt,zonesRevision để client loại phản hồi đến muộn.
- Không replay hàng loạt GPS đã xếp hàng offline; reconnect ưu tiên lấy mẫu mới. Không dùng uploader riêng gây xung đột GPS/SOS.
- Foreground: đánh giá lại khi có GPS đạt điều kiện mới; refresh/mở màn lấy trạng thái mới. Nhịp lấy/gửi phải đo trên thiết bị trước nghiệm thu, không hứa GPS nền cập nhật liên tục.
- Hết tuổi mẫu tự chuyển unknown cả ở client và Backend; dữ liệu vùng đổi chỉ đánh giá lại bằng mẫu còn đạt điều kiện.
- GET /flood-alerts/location-evaluation dùng binding headers, trả cùng DTO dưới đây, không xếp push mới chỉ vì đọc lại. Backend/worker phản ứng với GPS/dữ liệu vùng mới để tạo sự kiện vị trí.

Response `data:{evaluation}`:

- installationId,bindingId,sequence; sequence/location/capturedAt/receivedAt/accuracyM/validUntil null khi chưa có mẫu.
- evaluatedAt,zonesRevision; status inside/near/far/unknown; reason null hoặc no_location/permission_denied/location_disabled/no_fix/stale_location/poor_accuracy/incomplete_zone_data/no_active_alert/no_zones/zone_data_unavailable/invalid_location_time.
- status unknown nếu không có alert active, không đủ GPS, không có vùng, lỗi nguồn toàn bộ, hoặc không có match nhưng coverage chưa đủ. Không suy unknown thành an toàn.
- coverage partial nhưng có match hợp lệ: vẫn có inside/near + coverage partial, thông báo chưa đối chiếu được các vùng còn lại.
- `matches:[{zoneId,group,name,relation:"inside"|"near",distanceToBoundaryM,source,recordedAt}]`; inside distanceToBoundaryM=null để không nhầm với khoảng cách đo; near 0..500m. Phần tử inside trước near; near theo khoảng cách gốc, tie theo zoneId.
- `activeAlertIds:[]`, `coverage` như bộ vùng; evaluation là của vị trí hiện tại, áp dụng cho mọi bản tin active vì scope giống nhau. UI chỉ gắn khối đỏ vào bản tin đang active, không gắn vào lịch sử inactive.
- Đạt GPS và toàn bộ vùng valid đều ngoài>500 mới far. validUntil=capturedAt+60giây (không phải evaluatedAt+60).
- Thông tin cá nhân chỉ của chính Resident/binding, không trả cho Rescue/Admin qua các endpoint này; không ghi tọa độ/token thô vào log.
- PUT ghi mẫu/receipt sự kiện rồi mới tải vùng để trả đánh giá. Nếu response thất bại sau commit, retry nguyên body/sequence hoặc GET đánh giá; không tự tăng sequence cho mẫu cũ. Response có thể trả sequence mới hơn yêu cầu nếu request khác đã cập nhật: đây là mẫu mới nhất của binding.
- Giai đoạn2B ghi sample và `warning_v2_location_events` atomically cho sequence mới; replay không tạo event. GET chỉ đọc/đánh giá lại, không tạo event/push. Worker xử lý event, phát lại khi vùng đổi và FCM triển khai tiếp, chưa hoạt động nền.

## 9. Sự kiện, FCM, dừng và đồng bộ

Phạm vi PHASE4: `docs/flood-warning-v2-worker.md`. Worker tạo receipt/job pending và hủy khi không còn phù hợp, không gọi provider. PHASE5 bổ sung sender tách riêng, target/lease/retry/unknown và control; xem `docs/flood-warning-v2-sender.md`. GPS event processed, control prepared/control_prepared hoặc parent dispatched chỉ là trạng thái nội bộ. Không trạng thái nào tự chứng minh điện thoại đã nhận. API/DTO HTTP không đổi.

- Dedupe key ổn định theo (residentId,alertId,kind), kind general/near/inside; không theo zone hoặc thiết bị. Không reset bởi sửa/refresh/relogin/đổi nguồn vùng.
- Payload sự kiện lưu bất biến ở lần tạo để retry cùng event không bị xung đột vì nội dung/vùng đã đổi; giữ revision và dấu nguồn tại lần phát. Mở thông báo luôn đọc nội dung/trạng thái mới nhất. Không tạo event mới chỉ để cập nhật nội dung push cũ.
- Ghi sổ sự kiện và outbox atomically; worker không để hai tác vụ tạo near/inside trái quy tắc khi chạy đồng thời. Inside đã ghi nhận (kể cả đang chờ gửi) thì không xếp near về sau.
- Danh sách luôn đọc được từ bản tin; push là kênh bổ sung, không phải nơi duy nhất lưu bản tin.
- Fan-out chung theo batch có tiến độ bền vững; không ghi toàn bộ Resident trong một transaction. Kiểm tra recipient vẫn là Resident active trước phát.
- Không chọn thiết bị bằng topic client tự đăng ký role; Backend lựa chọn theo binding/role đã xác thực.
- Trước gửi general: kiểm tra alert còn active và binding còn đúng owner/đủ quyền/token. Near/inside còn phải kiểm tra GPS mới nhất còn valid và kết luận phù hợp, không gửi vị trí cũ.
- Nếu điều kiện vị trí thay đổi trước gửi: hủy sự kiện không còn phù hợp; giữ khóa chống lặp của kind đã ghi nhận. Không bù spam để đủ ba thông báo.
- Retry chỉ khi biết chắc thất bại và còn đủ điều kiện; timeout provider chưa rõ kết quả phải đối chiếu, không retry mù. Provider accepted không có nghĩa điện thoại đã hiển thị.
- Push Android data fields là strings: schemaVersion,eventId,alertId,kind,title,body,createdAt,installationId,bindingId. Hai field binding được chốt thêm PHASE5 để loại push khác phiên. Data-only, Android kiểm tra phiên/active/evaluation trước hiện local notification. Title/body push rút gọn theo byte, API detail giữ đầy đủ; không nhét GeoJSON/GPS cá nhân vào payload. General/control có thể tới nhiều installation với cùng eventId; near/inside chỉ tới installation tạo GPS của job.
- Control event kind=deactivated dùng đồng bộ/hủy thông báo cục bộ, không tạo thông báo hiển thị thứ tư. Có thể giao trễ; khi mở app/push/resume luôn đọc trạng thái mới.
- App lọc eventId đã xử lý, kiểm tra account binding hiện tại và trạng thái alert trước hiển thị. Không cho push cũ gắn vào tài khoản mới.
- Bất kỳ kết quả đến muộn sau inactive không được bật lại UI cảnh báo. Offline giữ nhãn chưa cập nhật, reconcile khi có mạng.
- FCM background cần kiểm thử riêng lựa chọn notification/data message, quyền Android, service và hạn chế hệ điều hành. Chưa chốt bằng chứng đã chạy chỉ vì có notification.service.

## 10. Mã lỗi và hành vi UI

| HTTP/code | Hành vi |
|---|---|
| 400 INVALID_ALERT_DATA / INVALID_ALERT_QUERY / INVALID_LOCATION_DATA / INVALID_DEVICE_DATA | Đánh dấu dữ liệu nhập/cấu hình sai; không tự gửi lặp |
| 401 AUTH_REQUIRED | Dừng thao tác gắn account, yêu cầu đăng nhập lại; không hiển thị cache cá nhân của account cũ |
| 403 ROLE_FORBIDDEN / ACCOUNT_INACTIVE | Chặn thao tác, thông báo quyền/tài khoản, không retry bằng role giả |
| 404 ALERT_NOT_FOUND | Thông báo không còn bản tin để mở; không tự mở một bản tin khác |
| 404 CREATION_REQUEST_NOT_FOUND | Giữ idempotency key, đối chiếu/retry cùng thao tác |
| 409 IDEMPOTENCY_CONFLICT | Không đổi key tự động để tạo trùng; đối chiếu thao tác |
| 409 ALERT_REVISION_CONFLICT / ALERT_ALREADY_INACTIVE | Đọc chi tiết mới, cập nhật form/trạng thái; không ghi đè |
| 409 LOCATION_SEQUENCE_CONFLICT / DEVICE_BINDING_CHANGED | Bỏ phản hồi cũ, đồng bộ đúng binding/sequence; không tăng sequence để phát lại mẫu cũ |
| 403 INSTALLATION_PROOF_INVALID | Dừng installation cũ; không ghi đè binding chỉ bằng UUID; kiểm tra kho khóa của đúng lần cài |
| 409 DEVICE_TOKEN_CONFLICT | Không gửi lặp hoặc tự chuyển token giữa installation; xử lý liên kết cũ có chứng minh |
| 429 RATE_LIMITED | Tôn trọng Retry-After nếu có, giữ dữ liệu cũ và backoff |
| 503 ZONE_DATA_UNAVAILABLE / PUSH_SERVICE_UNAVAILABLE | Giữ bản tin; báo chưa đối chiếu/gửi được, không đổi thành far/đã nhận |
| 503 WARNING_V2_FEATURE_NOT_READY | Ghi chú của giai đoạn cũ: binding/GPS đã có code từ PR149. Nếu server còn trả mã này, kiểm tra đúng phiên bản triển khai; không tạo kết quả GPS giả |
| 500 INTERNAL_ERROR / mất mạng / timeout | Giữ dữ liệu và nhãn chưa cập nhật; thao tác ghi đối chiếu trước retry |

GET vùng có một phần dùng được trả200 coverage.partial. Lỗi hoàn toàn trả503; đánh giá vẫn trả unknown nếu có thể đọc trạng thái cá nhân an toàn. FCM lỗi sau tạo không xóa bản tin đã lưu; ghi trạng thái công việc thất bại/chưa xác định để đối chiếu.
Định dạng lỗi: `{success:false,message:"...",code:"..."}`; không lộ lỗi provider hoặc secret.

## 11. Dữ liệu cũ, rollout và cấu hình

- Ghi V2 với schemaVersion=2; endpoint V2 chỉ đọc V2. Không sửa/xóa DB thật ở bước soạn contract.
- V1 không tự thành active vô thời hạn hoặc tự có thời điểm tắt. Số liệu/lịch sử V2 không trộn V1.
- Khi deploy phải thay serializer/filter/summary cũ và cập nhật cả bốn client; bỏ cách đọc severity/areaId/endAt bắt buộc. Kiểm kê consumer trước rollout.
- Route subscription cũ không còn là điều kiện của broadcast V2; không xóa code notification/SOS dùng chung thiếu kiểm tra.
- Cấu hình hiện có: JWT_SECRET, JWT_EXPIRES_IN, FIREBASE_SERVICE_ACCOUNT_BASE64 (hoặc serviceAccountKey.json local), PORT, FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED. Không đưa giá trị vào Git/docs/log.
- Cấu hình PHASE5: FLOOD_WARNING_V2_PUSH_ENABLED mặc định false; khi bật bắt buộc FLOOD_WARNING_V2_PUSH_MODE=test|live. Test phải có FLOOD_WARNING_V2_TEST_RECIPIENT_IDS; live phải xóa allowlist. Event worker có cờ riêng. Không bật provider với Emulator. Rollout/rollback theo tài liệu sender; không tự phát backlog TEST khi chuyển live.
- Emulator dùng Firebase project demo và test harness; config Firebase hiện tại vẫn cần rà vì đang luôn nạp service account. Không chạy test dữ liệu mới bằng key Firebase thật trước khi có guard.
- Không đưa ORS/Google Maps Directions hoặc dự báo tự động vào chức năng đối chiếu này. Không sửa SOS/Safe Locations ngoài phụ thuộc được xác định.

## 12. Nghiệm thu và nguồn tham khảo

- Checklist và trách nhiệm: `docs/flood-warning-v2-implementation-plan.md`.
- Tin nhắn giao việc: `docs/flood-warning-v2-team-handoff.md`.
- JSON mẫu: `docs/examples/flood-warning-v2.json`. Tất cả ID/timestamp/số đo trong fixture là giả lập; thời gian cố định, không gửi trực tiếp để test GPS hiện tại.
- Tài liệu V1 để đối chiếu, không dùng làm contract V2: docs/admin-flood-warning-management-api.md, docs/firestore-flood-alert-schema.md, docs/flood-warning-notification-api.md.
- API đã merge PR149; kết quả từng gói nằm trong backend/docs/flood-warning-v2-phase*-validation.md. Không có PASS về FCM/điện thoại/Render hoặc deploy SHA chỉ từ tài liệu này.
