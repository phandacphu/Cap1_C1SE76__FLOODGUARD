# Flood Warning V2 — nền triển khai, phân việc và kiểm thử

**Mốc mới PHASE5 (22/11/2026):** nền đã merge tới PR150/be9d99c. Gói sender local và bộ bàn giao bốn giao diện ở `flood-warning-v2-sender.md`, `handoff/flood-warning-v2/00_DOC_TRUOC.md`; kết quả `../backend/docs/flood-warning-v2-phase5-validation.md`. Các mốc phía dưới là lịch sử triển khai. Chưa có nghiệm thu FCM/Render/bốn client chỉ từ các báo cáo local này.

Ngày 22/11/2026. Nền đã đọc: `0314e88af283ecb580b20bb99fc559d77eb49ea0`.
Đây là kế hoạch, không phải báo cáo các ca test đã PASS.

Cập nhật giai đoạn2B (gói PHASE3): đã thêm liên kết thiết bị với proof, CAS revision, token claim; PUT vị trí và GET đánh giá riêng Resident. Đây là code chưa commit/push/deploy. Worker fan-out/chống lặp thông báo, đánh giá vùng đổi nền và FCM chờ giai đoạn tiếp. Xem `docs/flood-warning-v2-device-gps.md` và `backend/docs/flood-warning-v2-phase3-validation.md`. Kết quả Backend chưa chứng minh uploader Android hoặc push thật.

Cập nhật giai đoạn2A: đã bổ sung GET bộ vùng chuẩn hóa và lõi đối chiếu GPS. Upload/đọc GPS cá nhân theo binding và worker/FCM vẫn chưa có. Xem `backend/docs/flood-warning-v2-phase2-validation.md`; không lấy test lõi GPS làm bằng chứng nhận push hoặc cập nhật GPS nền trên điện thoại.

Cập nhật giai đoạn 1: code lifecycle bản tin đã có trong gói sửa trên nền commit tài liệu `43f0bda536951ef42c34d397ed4d56a3ae6c8c85`; chưa commit/push/merge/deploy code trong lượt này. Xem `backend/docs/flood-warning-v2-phase1-validation.md` để biết đúng phạm vi test. Các mốc Windows trong bảng bên dưới là lịch sử trước khi nhập gói sửa.

## 1. Điểm dừng trên Windows được Phú cung cấp

| Mục | Có bằng chứng |
|---|---|
| Repo chính | E:\2026\Ki_1__cuoi\capstone\Cap1_C1SE76__FLOODGUARD |
| Repo chính lúc kiểm tra | develop, 30b2d8a23e2fc8811e2cca876e66a0dd3a240735, sạch |
| Fetch | origin/develop tới 0314e88af283ecb580b20bb99fc559d77eb49ea0 |
| Worktree mới đã tạo | E:\2026\Ki_1__cuoi\capstone\FLOODGUARD-flood-warning-v2-backend |
| Nhánh mới | feature/flood-warning-v2-backend |
| HEAD worktree mới | 0314e88af283ecb580b20bb99fc559d77eb49ea0, sạch |
| Push/PR của nhánh mới | Chưa có bằng chứng; lượt này không thực hiện |
| Backend/FCM/Render V2 | Chưa triển khai hoặc nghiệm thu trong lượt soạn contract |

Các worktree cũ có nhãn prunable được giữ nguyên. Không dọn worktree/reset/clean hoặc chạm key Firebase.

## 2. Code đã đọc và thay đổi cần làm

| File/nhóm | Hiện trạng trên nền | Việc tiếp theo |
|---|---|---|
| backend/src/services/flood-alert.service.js | severity, areaId, khoảng startAt/endAt; endAt bắt buộc | V2 DTO, lifecycle thủ công, endAt null |
| backend/src/services/admin-flood-alert.service.js | CRUD và event dựa vùng/thời gian cũ | Idempotency, revision, deactivate, schemaVersion |
| backend/src/controllers/flood-alert.controller.js | Chuyển endAt sang ISO trực tiếp | Serializer null-safe, role và chi tiết V2 |
| backend/src/services/admin-warning-statistics.service.js | Thống kê contract cũ | Chỉ đếm V2, active/inactive |
| backend/src/services/flood-warning-notification*.js | Kiểm tra vùng, severity, subscription, time window | Broadcast all Resident, GPS events và hủy khi tắt |
| backend/src/services/notification-{trigger,delivery,transport,retry-worker}.service.js | Có nền event/delivery/idempotency, provider mặc định chưa cấu hình | Tận dụng có kiểm tra; thêm FCM/binding/cancel guard, không phá SOS |
| backend/src/services/flood-area.service.js | areaType flood/low_lying, geometry.points | Chuẩn hóa current/low, không sửa format bản đồ cũ tùy tiện |
| backend/src/services/historical-flood-area.service.js | HIST có override và xóa mềm, nhiều bản ghi chưa polygon | Chuẩn hóa history, thiếu polygon báo partial |
| backend/data/flood-history/FLOODGUARD_FLOODMAP_RADAR.geojson | Polygon/MultiPolygon, thiếu feature ID nghiệp vụ | Nhóm low_lying, ID ổn định và dấu nguồn |
| web/src/pages/admin/flood-warning/* | Form mức độ/vùng/thời gian | UI V2 và adapter mới |
| web/src/pages/rescue/RescueDashboard.tsx, components/FloodAlertBanner.tsx, sosMapData.ts | Còn severity/areaId/endAt để chọn banner | Nối V2, regression SOS/map |
| mobile/.../domain/model/Warning*.kt, ui/screens/warning/* | Enum/thời gian/filter V1 | DTO/logic UI mới, kiểm tra consumer dùng chung |
| backend/src/config/firebase.js | Luôn nạp service account | Guard Emulator demo và test harness trước test ghi |

Số feature tĩnh quan sát trong source: 27 Point lịch sử, 2 MultiPolygon buffer tham khảo, 157 feature radar. Đây không phải thống kê Firestore thật hiện tại hoặc số vùng đủ điều kiện đối chiếu.
Không dựng polygon từ HIST Point. Không dùng buffer thay ranh giới thật. Radar + Admin areaType=low_lying đều thuộc Vùng trũng.

## 3. Phân việc song song

| Người | UI | Nối API/phụ thuộc | Bàn giao |
|---|---|---|---|
| Phú | Rescue Mobile list/detail/filter/map | Backend contract, CRUD, geospatial, FCM Backend; phối hợp Android chung | Source, docs, tests, log đúng SHA |
| Thiên | Resident list/detail/home/GPS/map/error states | API V2, Android FCM dùng chung, thiết bị/tài khoản, GPS foreground/background | APK SHA/config và test thiết bị |
| Huy | Admin list/summary/create/edit/deactivate/history | Admin API/idempotency/revision/error handling | Web build, API mode và log |
| Khoa | Rescue Web list/detail/filter/map/banner | Read API, bỏ severity/area đơn/thời hạn cũ ở consumer | Web build và regression SOS/map |
| Tú | Soạn ca theo bốn giao diện | Dữ liệu/test account, Emulator và integration | Báo cáo môi trường/SHA/expected/actual |

Mỗi giao diện có thể dùng hai task UI và nối API. Không tự sửa Jira trong lượt bàn giao.
Thiên sở hữu bộ nhận FCM Android chung; Phú phối hợp role/navigation/GPS, không viết hai MessagingService tranh nhau. Xác nhận phạm vi file dùng chung trước khi sửa.

## 4. Các bước

1. Nhập bộ tài liệu vào worktree sạch; đọc contract/fixtures; ghi nhận đây là API thiết kế, chưa live.
2. Gửi hướng dẫn cho nhóm để làm UI/mock song song. Không đoán endpoint còn thiếu.
3. Backend lifecycle + list/detail/summary + unit/HTTP fixture; kế tiếp Firestore Emulator với demo project.
4. Chuẩn hóa vùng + đánh giá địa lý + sequence/expiry/binding/dedup; dùng geometry tổng hợp kiểm tra biên.
5. FCM adapter/device enrollment + worker + test allowlist, chưa broadcast người dùng thật.
6. UI nối Backend test; kiểm thử liên giao diện, điện thoại thật, hồi quy; Phú quyết định GitHub/merge/deploy.

## 5. Checklist nghiệm thu (chưa chạy)

| Ca | Đầu vào/thao tác | Kết quả mong đợi |
|---|---|---|
| A01 | Admin tạo title/content hợp lệ | 201, active, revision1, server startAt, endAt null |
| A02 | Body severity/areaId/startAt/endAt/status | 400, không tạo bản tin |
| A03 | Tạo hai bản tin khác key | Hai ID active độc lập, UI xem đủ |
| A04 | Hai request cùng Admin/key/body đồng thời | Một ID, một broadcast event; replay200 |
| A05 | Cùng key khác body | 409, không tạo thêm |
| A06 | Timeout sau tạo, đối chiếu/retry cùng key | Cùng ID, không phát lại; 404 đối chiếu chưa khẳng định thao tác không commit |
| A07 | Sửa active đúng revision | Giữ ID/startAt/createdAt, tăng revision, không reset push |
| A08 | Hai sửa cùng revision | Một thắng, một409; UI reload |
| A09 | Tắt hai lần | Cùng endAt, lần hai changed=false |
| A10 | Sửa song song tắt | Không hồi sinh alert; edit sau inactive409 |
| A11 | Resident/Rescue gọi quản lý; Admin bị khóa/đổi role | 403; không ghi DB |
| A12 | Không JWT/expired/account không tồn tại | 401; không lộ dữ liệu cá nhân |
| A13 | V1 tồn tại cùng V2 | List/summary V2 không trộn V1; không tự migrate hoặc phát V1 |
| G01 | GPS age60s/accuracy100m | Được đối chiếu |
| G02 | Age>60s, accuracy>100m/thiếu, mất quyền/tắt vị trí | Unknown đúng lý do, không đỏ dựa dữ liệu cũ |
| G03 | GPS trong polygon, trên cạnh, trên đỉnh | Inside |
| G04 | GPS ngoài cách ranh giới 499/500/501m | Near/near/far; dữ liệu test dựng bằng phép địa lý độc lập |
| G05 | Polygon nhiều phần/lỗ, điểm trong hole | Đúng inside/near/outside theo geometry, không theo bounding box |
| G06 | Radar và vùng Admin low_lying | Đều group low_lying, đúng lời Vùng trũng |
| G07 | HIST có polygon và HIST Point không có polygon | History đúng nguồn; Point báo partial, không bịa ranh giới |
| G08 | Một nguồn lỗi/một polygon invalid | Partial/unavailable; không trả false far |
| G09 | Sửa/xóa vùng trong lúc alert active | zonesRevision đổi, đánh giá lại bằng GPS còn mới |
| G10 | Sequence cũ/trùng payload/đổi binding; request trả ngược thứ tự | Không ghi đè mẫu mới, không thêm push |
| G11 | User tắt layer/zoom/pan | Chỉ đổi hiển thị, kết quả đối chiếu không bị giảm phạm vi |
| N01 | Xa hoặc không GPS/notification denied | Có bản tin chung trong app; push theo điều kiện thiết bị |
| N02 | Far->near->inside->far->near->inside liên tục | Một general, tối đa một near, một inside cho user+alert |
| N03 | Lần đầu inside rồi near | Không tạo near sau inside |
| N04 | Nhiều vùng overlap, nhiều thiết bị/worker | Dedupe theo user+alert+kind, không theo zone/device |
| N05 | Restart/refresh/relogin/edit | Không reset dedup |
| N06 | Bản tin B mới trong khi A đã dùng dedup | B có bộ sự kiện độc lập |
| N07 | Tắt khi đang fan-out/retry/provider đang bay | Ngừng công việc chưa gửi, không reset alert; late push đọc inactive |
| N08 | FCM accepted/timeout/token lỗi | Không coi accepted là đã xem; retry theo phân loại, unknown không retry mù |
| N09 | Đổi account A->B, response/logout/token update A đến muộn | Không hủy binding B hoặc hiển thị GPS/push A cho B |
| U01 | Empty200 và load500/offline | Empty đúng; lỗi giữ dữ liệu và nhãn chưa cập nhật |
| U02 | Mở push ID không tồn tại/đã inactive | 404 rõ ràng/inactive đúng; không tự mở ID khác |
| U03 | Admin tắt, hai Rescue và Resident refresh | Cùng trạng thái; thống kê/list/detail nhất quán |
| U04 | App foreground/background/permission revoke/reconnect | Đúng quyền, độ mới GPS, deep-link và không spam |
| R01 | Đăng nhập, SOS GPS/completion/history, bản đồ, Safe Locations | Không phá flow hoặc DTO dùng chung |

Test tối thiểu có đủ Radar và Admin low_lying độc lập; ba nguồn match đồng thời; nhiều alert active; hai role giả JWT/quyền DB đổi; mất nguồn dữ liệu; dữ liệu V1.

## 6. Môi trường và bằng chứng

- Fixture JSON kiểm tra shape/luồng giao diện; chưa chứng minh geospatial hoặc HTTP server thật.
- Unit/HTTP fake DB kiểm tra logic; chưa chứng minh transaction/index trên Firestore.
- Emulator demo kiểm tra transaction/dedupe/concurrency; chưa chứng minh Firebase thật hoặc FCM thật.
- FCM chỉ nghiệm thu bằng thiết bị TEST thật, đúng Android/build SHA và test account; Emulator Firestore không mô phỏng việc điện thoại nhận FCM.
- Render: ghi deploy SHA, cấu hình worker/test allowlist và baseURL thực tế từng client trước test. Health200 không chứng minh V2.
- Mỗi báo cáo có lệnh, SHA, môi trường, kết quả, log, ca chưa chạy. Không ghi PASS cho phiên bản mới bằng log cũ.

## 7. Dữ liệu TEST và dọn

- Chỉ tài khoản TEST active đúng role; tên bản tin `TEST ONLY - WARN V2 - <UUID>` và nội dung rõ không phải cảnh báo thực tế.
- Geometry tổng hợp trên Emulator, không sửa vùng thực để thử biên499/500/501.
- Toàn bộ timestamp fixture là cố định, phải dùng clock test; API thật phải tạo capturedAt mới.
- Test push trên môi trường tách biệt hoặc allowlist được Phú duyệt; không tạo bản tin V2 trên production để thử broadcast chung khi chưa có giới hạn nhận TEST.
- Kết thúc bằng deactivate đúng ID TEST, giữ lịch sử theo nghiệp vụ. Không DELETE hàng loạt alert/vùng/user/notification.
- Không chạy script seed/cleanup với service account thật mặc định. Không đưa token, mật khẩu, key hoặc installation secret vào report/ZIP.
