# Safe Location Catalogue v2 — kết quả kiểm tra 09/11/2026

Baseline develop: 03d9eb2fdbef1663f416e36f95b070c30712b95a.
Nhánh local: feature/safe-location-catalog-v2. Không push/merge/deploy.

## Đã chạy và đạt

| Lệnh / môi trường | Kết quả | Phạm vi |
|---|---|---|
| npm ci --ignore-scripts | Thành công | Cài lockfile hiện có, không đổi dependencies |
| node scripts/test-safe-location-catalog.js | 26/26, không fail/skip | HTTP thật trên loopback, JWT, services thật, Firestore thay bằng bộ nhớ có retry/rollback |
| node scripts/test-sos-direct-rescue.js | 51/51, không fail/skip | Hồi quy SOS, auth, audit và notification liên quan |
| node scripts/test-flood-map-area-types.js | 17/17, không fail/skip | Hồi quy bản đồ, cảnh báo và audit |
| Firestore Emulator | 1/1, không fail/skip | HTTP tạo/đọc/sửa, điểm xa hơn 1000 km vẫn có, hai Admin xóa đồng thời chỉ một audit, document giữ lại, detail 404 |

Emulator: demo-floodguard-safe-locations, 127.0.0.1:8080, Firebase CLI 14.14.0, Firestore Emulator 1.19.8, Java 17. Test dùng SDK Firebase thật nhưng không dùng service account hoặc Firestore thật. Tự dọn đúng các document của lượt test. Emulator chạy ngoài repository, không sửa config Firebase của dự án.

Các log lỗi DB/audit trong suite là lỗi được cố ý giả lập để kiểm tra rollback, best-effort và không lộ chi tiết; suite kết thúc PASS.

## Kiểm tra nghiệp vụ

- POST chỉ nhận tên/địa chỉ/tọa độ/loại/mô tả; không status/capacity, thêm là đọc được.
- Có GPS: Haversine, tất cả điểm, không radius/type truncation; sort số gốc rồi ID khi bằng.
- Không GPS: distanceKm=null, thứ tự tên/ID ổn định.
- ID từ document thật, không bị giá trị id cũ trong body storage giả mạo.
- Public detail cùng dữ liệu với list; ID sai 400, điểm xóa/mất 404.
- PATCH giữ ID/createdAt/dữ liệu liên quan; no-op không log hoặc đổi updatedAt.
- DELETE soft, actor từ JWT, thời gian từ máy chủ; DELETE lặp không đổi actor/time/log.
- Thử sai role/JWT/account revoked, commit failure và edit/delete race.
- Không hồi sinh tombstone qua PATCH hoặc helper fixture.
- Public response không lộ trường capacity/status/contact/services.

## Chưa nghiệm thu

- Firebase thật floodguard-1b699 và dữ liệu cũ trên máy Phú.
- Luồng UI đầy đủ của Resident/Rescue/Admin, quyền GPS/lifecycle/Google Maps.
- Render hoặc thay đổi cấu hình triển khai.
- Tải lớn; hiện đọc cả collection và sắp khoảng cách trong bộ nhớ.

Không tuyên bố PASS toàn hệ thống. Trước merge/deploy cần client mới bỏ DTO bắt buộc capacity/status/services và query radiusKm, rà legacy inactive/unknown bằng script read-only.

## Chạy lại trên Windows

Tại backend:

```powershell
npm.cmd ci
node .\scripts\test-safe-location-catalog.js
node .\scripts\test-sos-direct-rescue.js
node .\scripts\test-flood-map-area-types.js
```

Chạy Emulator tùy chọn với Java và firebase.cmd đã cài (cổng 8080 phải trống):

```powershell
$safePreviousProject = $env:GCLOUD_PROJECT
try {
    $env:GCLOUD_PROJECT = "demo-floodguard-safe-locations"
    firebase.cmd emulators:exec `
        --only firestore `
        --project demo-floodguard-safe-locations `
        --config ".\tests\fixtures\safe-location-emulator\firebase.json" `
        "node --test tests/safe-location-catalog.firestore-emulator.test.js"
    if ($LASTEXITCODE -ne 0) { throw "Emulator test chua PASS." }
}
finally {
    $env:GCLOUD_PROJECT = $safePreviousProject
}
```

Cấu hình demo chỉ là test, không deploy firestore.rules lên Firebase thật.
