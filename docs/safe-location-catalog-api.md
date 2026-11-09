# Điểm tránh trú — API v2 đã chốt ngày 09/11/2026

Baseline: `develop` commit `03d9eb2fdbef1663f416e36f95b070c30712b95a`.
Nhánh bàn giao: `feature/safe-location-catalog-v2`. Chưa push, merge hoặc deploy.
Tài liệu này thay thế contract sức chứa/kích hoạt/bán kính cũ.

## 1. Luồng và phân công

Admin thêm → Resident/Rescue đọc được ngay. Admin sửa giữ nguyên ID.
Admin xóa mềm → sau lần tải thành công tiếp theo, điểm rời danh sách và bản đồ;
chi tiết của điểm đã xóa trả 404, thông báo "Địa điểm không còn được cung cấp".
Không có activate/deactivate, đặt chỗ, sức chứa, tiện ích hoặc liên hệ.

Phú: Backend và Rescue Mobile; Thiên: Resident; Khoa: Rescue Web; Huy: Admin.
Mỗi người làm nhánh riêng, mock riêng có nhãn rõ, không fallback mock khi API lỗi.
Chỉ Phú quyết định push/merge/deploy. Client cũ cần cập nhật trước khi triển khai chung.

## 2. Endpoint và xác thực

Đường dẫn bên dưới đã gồm `/api`. Nếu base URL kết thúc `/api/`, không lặp `api/`.
URL Render hiện có chỉ chạy v2 này sau khi Phú chủ động triển khai bản bàn giao.

| Method | Path | Quyền / kết quả |
|---|---|---|
| GET | `/api/safe-locations` | Public; tất cả điểm được cung cấp, GPS tùy chọn |
| GET | `/api/safe-locations/:id` | Public; chi tiết một điểm, GPS tùy chọn |
| GET | `/api/safe-locations/nearby` | Alias danh sách gần→xa, bắt buộc GPS, **không giới hạn bán kính** |
| GET | `/api/admin/safe-locations` | Admin; danh sách chưa xóa |
| GET | `/api/admin/safe-locations/:id` | Admin; chi tiết chưa xóa |
| POST | `/api/admin/safe-locations` | Admin; tạo |
| PATCH | `/api/admin/safe-locations/:id` | Admin; sửa một phần |
| DELETE | `/api/admin/safe-locations/:id` | Admin; xóa mềm |

API đọc public giữ quyền như hệ thống cũ; ứng dụng có thể vẫn đăng nhập theo luồng chung.
Admin dùng JWT từ `POST /api/auth/login` (identifier/password), gửi
`Authorization: Bearer <token>`. Role phải là admin và isActive=true trong users.
Quyền được đọc lại trong transaction ghi; không chỉ tin role trong JWT.
Token local và Render có thể khác secret; đăng nhập trên đúng Backend.
Frontend không cần Firebase key và không truy cập Firestore trực tiếp.

## 3. Tạo địa điểm

POST JSON, Content-Type: application/json:

```json
{
  "name": "TEST ONLY - Diem tranh tru A",
  "address": "Dia chi minh hoa - khong phai diem so tan da xac minh",
  "location": { "latitude": 16.0544, "longitude": 108.2022 },
  "type": "shelter",
  "description": "Du lieu TEST"
}
```

- name: bắt buộc, trim, 1–200 đơn vị UTF-16.
- address: bắt buộc, trim, 1–500 đơn vị UTF-16.
- location: chỉ latitude/longitude; số hữu hạn, latitude [-90,90], longitude [-180,180].
  Không ép chuỗi thành số. Tọa độ 0 hợp lệ, không dùng 0 làm placeholder khi thiếu dữ liệu.
- type: shelter, school, hospital, community_center, other.
- description: không bắt buộc/null/blank→null; trim; tối đa 2000 đơn vị UTF-16.
- Không gửi capacity, capacityNote, services, contactPhone, status, id, schemaVersion,
  isDeleted, deletedAt, deletedBy, actor hoặc timestamps. Trường ngoài contract trả 400.

HTTP 201, đọc `data.safeLocation`. Admin nhận id, name, address, location, type,
description, createdAt, updatedAt (ISO UTC hoặc null nếu thiếu ở dữ liệu cũ).
Không có bước kích hoạt. POST không có cơ chế idempotency-key/chống trùng địa điểm;
khóa nút và không tự resend sau timeout. Đọc lại danh sách để đối chiếu trước khi tạo lại.

## 4. Danh sách, GPS và khoảng cách

Không GPS:

```text
GET /api/safe-locations
```

Có GPS:

```text
GET /api/safe-locations?latitude=16.0544&longitude=108.2022
```

Cả latitude và longitude phải cùng có hoặc cùng bỏ. Query là số hữu hạn trong giới hạn;
không nhận tham số lặp, mảng, chuỗi rỗng, hex hoặc giá trị Infinity.
`/nearby` bắt buộc có đủ hai tọa độ và trả cùng tập dữ liệu, không cắt theo bán kính.
Chỉ hỗ trợ hai query này; radiusKm, type, status, search, page, limit... trả 400.
Tìm kiếm tên/địa chỉ nếu có ở UI thực hiện trên tập đã tải, không phải API tìm kiếm.

HTTP 200:

```json
{
  "success": true,
  "message": "Safe locations retrieved successfully",
  "data": {
    "safeLocations": [
      {
        "id": "EXAMPLE_ID",
        "name": "TEST ONLY - Diem tranh tru A",
        "address": "Dia chi minh hoa",
        "location": { "latitude": 16.0544, "longitude": 108.2022 },
        "type": "shelter",
        "description": null,
        "distanceKm": 0
      }
    ]
  }
}
```

Có GPS: trả **tất cả** điểm hợp lệ chưa xóa, sắp distanceKm tăng dần, ID phân xử khi bằng nhau.
Không GPS: distanceKm=null, sắp tên tiếng Việt rồi ID để ổn định; không bịa khoảng cách.
Không có điểm: HTTP 200 và safeLocations=[]. Lỗi DB: HTTP 500, không đổi thành mảng rỗng.
Khoảng cách Haversine (bán kính Trái Đất 6371 km) không làm tròn trong API.
UI làm tròn sau khi sắp, ví dụ "Cách bạn khoảng 0,35 km"; không phải km đường đi/ETA.
Backend không gọi Maps API và không lưu GPS người xem khi họ đọc danh sách.
GPS mới/last-known/permission là trách nhiệm client. Khi mất GPS có thể gửi vị trí cuối
đã lấy được; chưa có vị trí thì bỏ cả hai query. Mất mạng giữ dữ liệu đã tải và báo chưa cập nhật.

GET detail dùng `data.safeLocation` (số ít), cùng trường và khoảng cách như list.
Có thể gửi cùng cặp GPS để list/detail thống nhất. Không cần tải toàn bộ list để mở chi tiết.
Các response catalogue đặt Cache-Control: no-store để tránh cache HTTP trả lại điểm đã xóa.
Client vẫn được giữ bản đã tải trong bộ nhớ khi offline, nhưng phải ghi chưa cập nhật.

## 5. Sửa

```text
PATCH /api/admin/safe-locations/:id
```

```json
{ "name": "TEST ONLY - Ten moi", "location": { "latitude": 16.055, "longitude": 108.203 } }
```

Body object không rỗng; chỉ gửi trường cần đổi. Location phải đủ cả hai tọa độ.
Giữ ID, createdAt, dịch vụ/dữ liệu cũ không liên quan trong storage; không trả chúng ra contract mới.
Nếu giá trị sau trim không đổi: HTTP 200, không đổi updatedAt và không thêm audit.
Không có PATCH status/activate hoặc restore. Điểm không tồn tại/đã xóa trả 404, không tạo mới.

## 6. Xóa mềm

```text
DELETE /api/admin/safe-locations/:id
```

Không gửi body hoặc query. UI phải xác nhận trước khi gọi.
Backend tự đặt isDeleted=true, deletedBy từ JWT và deletedAt/updatedAt từ máy chủ;
không xóa document hay safe_location_services liên quan.

HTTP 200:

```json
{
  "success": true,
  "message": "Safe location deleted successfully",
  "data": { "id": "EXAMPLE_ID", "deleted": true, "deletedAt": "2026-11-09T00:00:00.000Z" }
}
```

DELETE lặp cùng ID đã xóa trả lại kết quả, không đổi người/thời gian xóa và không thêm audit.
ID chưa từng tồn tại trả 404. PATCH vào điểm đã xóa trả 404; không thể làm sống lại qua sửa.
Hai Admin xóa cùng lúc chỉ có một thay đổi và một audit xóa.
Sau thành công client tải lại; thẻ/ghim biến mất. Detail đã mở gặp 404 thì hiển thị thông báo,
không fallback sang object cũ như thể vẫn còn được cung cấp.

## 7. Lỗi

Business error: `{success:false,message,code}`. Auth middleware có thể chỉ trả success/message.

| HTTP | Mã / xử lý |
|---|---|
| 400 | INVALID_SAFE_LOCATION_DATA, INVALID_SAFE_LOCATION_ID, INVALID_SAFE_LOCATION_QUERY; kiểm tra input |
| 401 | Thiếu/hết hạn token, tài khoản không tồn tại; đăng nhập lại đúng Backend |
| 403 | Sai vai trò hoặc tài khoản inactive; không cho sửa/xóa bằng quyền Resident/Rescue |
| 404 | SAFE_LOCATION_NOT_FOUND hoặc ADMIN_SAFE_LOCATION_NOT_FOUND; điểm không còn được cung cấp |
| 500 | Lỗi hệ thống; giữ dữ liệu đã tải, hiển thị lỗi, không thông báo thành công giả |

JSON sai cú pháp có thể do Express từ chối với HTTP 400 trước controller.
Đừng giả định mọi lỗi đều có code hoặc luôn có JSON.

## 8. Dữ liệu cũ và tương thích

Không có bulk migration hoặc script tự ghi vào Firebase trong gói này.
Bản ghi schemaVersion=2 dùng cờ xóa mềm, không dùng status để điều khiển hoạt động.
Bản ghi cũ status=active hoặc không có status được đọc nếu dữ liệu tối giản hợp lệ.
Bản ghi cũ inactive/trạng thái không nhận diện giữ nguyên nhưng không tự được xuất bản.
Bản ghi đã có isDeleted=true hoặc deletedAt bị ẩn ở mọi read endpoint.
Tọa độ/trường bắt buộc không hợp lệ không tạo public pin. Admin vẫn có thể xem/sửa
bản ghi còn hiển thị để sửa dữ liệu; legacy inactive cần Phú rà soát riêng trước khi chuyển.

Chạy **read-only** tại backend với cấu hình Firebase của Phú nếu muốn rà dữ liệu:

```powershell
node .\scripts\inspect-safe-location-catalog.js
```

Script chỉ in project ID, số lượng và ID/tên/lý do cần rà; không sửa/xóa dữ liệu.
Không tự chuyển tất cả inactive sang được cung cấp. Không bỏ qua kiểm tra dữ liệu cũ trước deploy.
Các tài liệu/fixture cũ có sức chứa/status không còn là payload HTTP hợp lệ.
Mobile phải bỏ DTO bắt buộc capacity/status/services và query radiusKm trong lời gọi gần đây.
Không sửa UI trong nhánh Backend này. Bản cũ đang chạy Render chưa tự thay đổi khi nhận gói.

## 9. Audit và giới hạn

Audit: safe_location.create, safe_location.update, safe_location.delete; actor lấy từ JWT.
Chỉ log tên trường thay đổi, không ghi nội dung mô tả/liên hệ. Audit dùng wrapper best-effort
hiện có sau transaction, không phải giao dịch nguyên tử cùng catalogue. Audit failure không
hoàn tác nghiệp vụ đã commit. No-op và DELETE lặp không ghi audit mới.
Đọc catalogue hiện đọc cả collection, tính/sắp khoảng cách trong Backend: phù hợp tập demo nhỏ;
không tuyên bố đã có truy vấn địa lý/phân trang cho dữ liệu lớn.
Tên "điểm an toàn"/thêm bởi Admin không phải bằng chứng nơi đó hay tuyến Google Maps an toàn thực tế.
Dữ liệu mẫu phải ghi rõ TEST. Ghim điểm xanh lá; người dùng xanh dương; giữ màu điểm lịch sử đỏ.

## 10. Kiểm thử

```powershell
npm.cmd ci
node .\scripts\test-safe-location-catalog.js
node .\scripts\test-sos-direct-rescue.js
node .\scripts\test-flood-map-area-types.js
```

Các suite này thay Firebase bằng in-memory substitute trước khi import; không cần .env/key,
không ghi Firestore thật. Có test HTTP/JWT, quyền DB, GPS không giới hạn bán kính, tọa độ 0,
no-op, role revocation khi retry, commit failure, edit/delete race và audit best-effort.
Emulator opt-in: tests/safe-location-catalog.firestore-emulator.test.js, chỉ chạy khi
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 và GCLOUD_PROJECT=demo-floodguard-safe-locations.
Không coi kết quả mock/emulator là nghiệm thu Firestore thật, UI hoặc Render.
