# Flood Warning V2 — giai đoạn 2A: vùng chuẩn hóa và lõi đối chiếu GPS

Ngày thực hiện: 22/11/2026, giờ Việt Nam.
HEAD nền của Phú vẫn `43f0bda536951ef42c34d397ed4d56a3ae6c8c85`, cộng gói phase1 chưa commit đã kiểm tra đạt trên Windows. Gói này là patch bổ sung lên trạng thái phase1 đó, không áp trực tiếp lên checkout43f0bda sạch.
Đối chiếu chính xác bằng manifest của gói: hash file đầu vào phase1 và hash file đầu ra phase2. Không dùng SHA nền để thay thế fingerprint của code chưa commit.

## Bằng chứng trước khi bổ sung

Phú đã gửi log Windows: phase1 suite32/32 đạt và Emulator1/1 đạt (0 skip, exit0). Log Emulator có lock timeout trong bài thử đồng thời nhưng các assertion cuối đều đạt; không coi từng warning là một ca test thất bại, cũng không suy ra đã nghiệm thu Firebase thật.

## Đã triển khai

- GET /api/flood-alerts/zones: JWT và live role resident/rescue/admin; trả bộ vùng, dấu phiên bản, coverage và chẩn đoán.
- Admin flood_areas areaType=flood ->current_flood; areaType=low_lying ->low_lying.
- Radar ->low_lying; ID ổn định theo hình học, không sinh UUID mỗi GET; geometry trùng có một đại diện.
- HIST áp dụng override và xóa mềm, giữ nguồn historical_flood; thiếu polygon báo missing, không lấy Point/buffer làm ranh giới.
- Không phụ thuộc viewport/zoom/công tắc lớp. Query giảm phạm vi bị từ chối400.
- JSTS kiểm tra topology Polygon/MultiPolygon/holes; hình học sai được giữ tên/nguồn và geometry=null để UI biết không đối chiếu được.
- Coverage complete/partial/unavailable, dấu nguồn lỗi riêng; không báo far khi chưa kiểm tra đủ và chưa có match nào.
- Cache validation giới hạn512 geometry; revision ổn định qua GET, đổi theo dữ liệu nguồn đã chuẩn hóa; không lấy generatedAt giả làm recordedAt.
- gpsBody chuẩn hóa/kiểm tra GPS và evaluatePosition là bộ tính nội bộ: age<=60s, accuracy<=100m, inside trước near<=500m; khoảng cách tới đoạn ranh giới bằng Turf geodesic, bao gồm ranh giới lỗ khi phù hợp.
- Trên cạnh/đỉnh/bờ hole là inside; trong lòng hole được kiểm tra như phần ngoài. MultiPolygon kiểm tra tất cả thành phần.
- Giữ đầy đủ nhiều match, inside trước near, near theo khoảng cách chưa làm tròn. Partial vẫn cảnh báo nếu có match ở vùng hợp lệ và kèm thông tin các vùng chưa kiểm tra được.
- Không có active alert/no GPS/quyền bị từ chối/GPS cũ/accuracy kém/không có vùng ->unknown với lý do cụ thể.

## Giới hạn còn lại

**Đây chưa phải API gửi GPS hoàn chỉnh.** PUT /api/flood-alerts/location và GET /api/flood-alerts/location-evaluation vẫn trả503 WARNING_V2_FEATURE_NOT_READY. Chưa lưu GPS người dùng, xử lý binding/sequence đồng thời, hoặc gửi thông báo vị trí.
Phải hoàn thành liên kết installation/tài khoản trước khi mở các endpoint cá nhân. Không tạo endpoint evaluate tạm bỏ qua binding để frontend tự gọi.
Chưa có worker phát chung/near/inside, FCM/device token, GPS nền, deep link hoặc hủy push cục bộ. Không deploy toàn chức năng hoặc thông báo nhóm đã có push.
Hình học vượt đường đổi ngày chưa tách hoặc trên100.000 đỉnh/vùng bị báo invalid; không tự sửa. Khoảng cách là ước tính theo Turf, không phải ORS hoặc độ dài đường bộ. Dung sai tại mốc500 chỉ1e-7m cho sai số dấu phẩy động.

## Thư viện

- @turf/boolean-point-in-polygon7.4.0: inside/boundary/holes.
- @turf/point-to-line-distance7.4.0: khoảng cách geodesic tới từng ring.
- jsts2.12.1: kiểm tra topology; import ESM từ CommonJS, đã chạy trên Node24 ở môi trường thực thi. Windows Phú cần chạy npm.cmd ci với lockfile mới.
- Tài liệu primary: https://turfjs.org/docs/api/booleanPointInPolygon ; https://turfjs.org/docs/api/pointToLineDistance ; https://github.com/bjornharrtell/jsts .

## Kiểm thử

Lệnh trong backend:

```text
node scripts/test-flood-warning-v2-phase2.js
```

Kết quả cuối trên môi trường thực thi Linux/Node24: **64/64 entry đạt, 0 lỗi, 0 skip**. Suite gồm lifecycle/HTTP V2, geometry, zones, GPS engine và hồi quy chọn lọc auth/RBAC/notifications/audit/SOS/Safe Locations/map controller. HTTP dùng production app và fake DB; lõi GPS được gọi trực tiếp, chưa có HTTP upload. Không quy đổi số entry thành số ca API thật.

Emulator (sau khi Java/firebase CLI sẵn sàng; project phải demo-floodguard-warning-v2):

```text
firebase.cmd emulators:exec --only firestore --project demo-floodguard-warning-v2 --config tests/fixtures/warning-v2-emulator/firebase.json "node --test --test-concurrency=1 tests/flood-warning-v2.firestore-emulator.test.js tests/flood-warning-v2.zones.firestore-emulator.test.js"
```

Ca mới kiểm tra vùng Admin, phân loại radar/low_lying, HIST thiếu polygon, sửa override cùng ID, hình học bị sửa sai, xóa vùng và tài khoản bị khóa trên Firestore Emulator. Không dùng key hoặc Firebase thật. Ca lifecycle giai đoạn1 chạy lại cùng lệnh.
Kết quả cuối: **2/2 ca Emulator đạt, 0 lỗi, 0 skip**, khoảng13 giây. Log Linux được đóng cùng gói. Chưa có kết quả Windows phase2 cho đến khi Phú chạy và gửi output.

## Quan sát dữ liệu tĩnh (không phải Firebase thật)

Với source hiện có và DB thay thế rỗng:157 feature radar đều hợp lệ, group low_lying;27 HIST chỉ Point không có override polygon nên coverage partial (184 bản ghi tổng,157 đối chiếu được). Các con số này không phải thống kê Firestore đang dùng của nhóm.
Thử tại đỉnh một polygon radar: engine trả inside, group low_lying và vẫn giữ cảnh báo coverage partial. Không tạo bản tin thật hoặc phát push để thử.

## Bàn giao Windows

- Giữ nguyên các thay đổi phase1 chưa commit. Không chạy lại patch phase1 và không reset/clean.
- Importer của gói phase2 kiểm đúng branch/HEAD, đủ18 đường dẫn phase1 và hash nội dung chuẩn hóa LF; khác thì dừng, không ghi đè.
- Kiểm hash ZIP, giải nén tạm, chạy importer có --apply. Chỉ git apply patch incremental, không commit/push.
- npm.cmd ci ->suitephase2 ->gửi output; tiếp đó kiểm Emulator trên Windows.
- Các log Linux đạt được đóng cùng ZIP. Chưa ghi Windows phase2 PASS khi chưa nhận output.
