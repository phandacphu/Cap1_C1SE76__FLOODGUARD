# FloodGuard: API phân loại vùng trên bản đồ

Bản sửa dựa trên develop `c022dcd` (PR #111). Đây là hợp đồng API mới cần
Backend, Web Admin, bản đồ Web và Mobile cập nhật đồng bộ trước khi phát hành.

## 1. Phạm vi

- API points/buffers/radar giữ nguyên nguồn và endpoint.
- Theo phân loại nhóm đã chốt, lớp radar có sẵn hiển thị là Vùng trũng,
  cùng màu đỏ nhạt với vùng Admin tạo có areaType = low_lying.
- Radar được lấy từ API hiện có; không bắt buộc nhập các bản ghi radar
  vào collection flood_areas để hiển thị chung.
## 2. Các endpoint

| Endpoint | Quyền | Dữ liệu |
| --- | --- | --- |
| `GET /api/flood-areas` | Public | `data.floodAreas[]`; thêm `areaType`, bỏ `status`, `severity` |
| `GET /api/admin/flood-areas` | Admin | `data.floodAreas[]`; ID và timestamps giữ nguyên |
| `GET /api/admin/flood-areas/:areaId` | Admin | `data.floodArea` |
| `POST /api/admin/flood-areas` | Admin | Tạo vùng, trả HTTP 201 và `data.floodArea` |
| `PATCH /api/admin/flood-areas/:areaId` | Admin | Sửa một phần, trả `data.floodArea` |
| `DELETE /api/admin/flood-areas/:areaId` | Admin | Xóa vùng không còn cảnh báo liên kết |
| `GET /api/admin/flood-areas/summary` | Admin | Tổng số và thống kê `byAreaType` |

Admin phải đăng nhập bằng Bearer token, có role admin và tài khoản còn hoạt động.
Không thay đổi ID vùng hoặc cách cảnh báo liên kết qua `areaId`.

## 3. Tạo/sửa vùng

Ví dụ body POST (tên và tọa độ chỉ minh họa hợp đồng, không dùng làm dữ liệu thật):

```json
{
  "name": "Vùng minh họa hợp đồng API",
  "description": "Mô tả từ nguồn đã xác minh",
  "areaType": "flood",
  "geometry": {
    "type": "polygon",
    "points": [
      {"latitude": 16.05, "longitude": 108.20},
      {"latitude": 16.06, "longitude": 108.21},
      {"latitude": 16.04, "longitude": 108.22}
    ]
  },
  "source": "Nguồn dữ liệu của vùng"
}
```

- Đổi `areaType` thành `low_lying` để tạo vùng trũng.
- `name`, `areaType`, `geometry`, `source` bắt buộc; `description` có thể bỏ
  qua hoặc là null. Tọa độ là số hữu hạn, latitude trong [-90,90], longitude
  trong [-180,180]; polygon tối thiểu 3 điểm theo hợp đồng hiện có.
- ID, createdAt, updatedAt do server quản lý; không đưa vào body ghi.
- PATCH chỉ gửi các trường thay đổi. Server kiểm tra bản ghi hoàn chỉnh sau
  khi gộp PATCH, bảo toàn createdAt và các trường nội bộ không liên quan.
- Ví dụ PATCH chuyển loại: `{"areaType":"low_lying"}`.
- Tạo/sửa/xóa tiếp tục có audit; `areaType` được chấp nhận trong changedFields.

## 4. Dữ liệu cũ: cần Admin phân loại, không tự suy diễn

- Bản ghi thiếu hoặc có areaType không hợp lệ vẫn được đọc để kiểm tra, nhưng
  API trả `areaType: null`. Các trường status/severity cũ không được trả ra.
- `null` là trạng thái dữ liệu **chưa phân loại**, không phải loại vùng thứ ba
  trên bản đồ. Client cần cho Admin nhận biết; không mặc định thành `flood`
  hoặc `low_lying`, không vẽ với màu giả định.
- Một PATCH lên bản ghi chưa phân loại phải cung cấp `areaType` hợp lệ. PATCH
  chỉ tên/mô tả khi loại vẫn thiếu sẽ bị từ chối, không thay đổi dữ liệu.
- Sau khi Admin PATCH hợp lệ, transaction gỡ các trường status/severity cũ,
  giữ ID, createdAt và thông tin nội bộ; thay đổi có audit.
- Không chạy chuyển đổi hàng loạt, không tự sửa Firestore khi server khởi động.
  Người quản lý dữ liệu cần sao lưu/đối chiếu nguồn trước khi phân loại bản ghi.

## 5. Xóa vùng và cảnh báo liên kết

Vẫn trả HTTP 409 nếu có bất kỳ cảnh báo liên kết. Cần xử lý/liên kết lại các
cảnh báo phù hợp trước khi xóa; không còn hướng dẫn chuyển vùng sang inactive.
Web hiện có thông báo 409 theo logic cũ nên member phải cập nhật nội dung này.
Không xóa dây chuyền cảnh báo hoặc bỏ guard toàn vẹn dữ liệu.

## 6. Thống kê mới

```json
{
  "success": true,
  "data": {
    "total": 5,
    "byAreaType": {"flood": 2, "low_lying": 2, "unclassified": 1}
  }
}
```

Đây là ví dụ cấu trúc, không phải số liệu thực tế. Không còn byStatus/bySeverity.
`unclassified` giúp Admin rà dữ liệu cũ. `total` tính cả dữ liệu chưa phân loại.
Query hỗ trợ `from`, `to` (ISO datetime có múi giờ, lọc createdAt như trước) và
`areaType=flood|low_lying|unclassified`. Query status/severity bị từ chối HTTP 400.

## 7. Phần client cần cập nhật trước khi ghép bản Backend

- Web Admin: chọn loại vùng, bỏ status/severity trong form, validation, payload,
  bảng chi tiết và thống kê; xử lý các record areaType null.
- Web/Mobile: đọc areaType và ánh xạ màu cố định; giữ API lịch sử riêng.
- Mobile Rescue hiện đã merge vẫn đọc severity/status: phải sửa DTO/mapping,
  bảng thông tin và màu trước khi dùng API mới. Bản Backend này không tự sửa UI.
- Xử lý cảnh báo tải lỗi/phản hồi sai cấu trúc; có thao tác lấy dữ liệu mới sau
  khi Admin lưu/xóa. Bật/tắt lớp không gọi lại API.
- Đây là thay đổi hợp đồng không tương thích với client cũ. Hoàn tất kiểm thử
  ghép Web/Mobile trước khi merge/deploy Backend mới vào môi trường nhóm đang dùng.

## 8. Kiểm thử local an toàn

Trong backend, sau khi cài dependencies theo package-lock hiện có:

```powershell
node scripts/test-flood-map-area-types.js
```

Script chỉ chạy 10 tệp đã dùng mock Firestore hoặc mock service. Kiểm thử gồm:
phân loại và validation; public GET; CRUD; quyền Admin; lỗi transaction/audit;
không suy diễn dữ liệu cũ; PATCH phân loại và dọn trường cũ; thống kê; cảnh báo
và audit hồi quy. Không chạy `node --test` toàn thư mục vì repo vẫn có các bài
test cũ của chức năng khác có thể yêu cầu Firebase thật/emulator.

Kết quả tại môi trường chuẩn bị bản sửa: 10 tệp chạy thành công, Node reporter
ghi 17 tests, 0 fail. Không kết luận đã test Firestore thật hoặc toàn bộ Web/Mobile.
