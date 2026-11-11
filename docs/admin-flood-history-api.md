# API Admin quản lý vùng ngập lịch sử

Các dòng `HIST-xx` trong danh sách Admin lấy từ lớp điểm ngập lịch sử. Mỗi dòng
dùng ID gốc xuyên suốt khi đọc, sửa, xóa và vẽ đa giác. Web có thể dùng lại form
Sửa vùng ngập/Vùng trũng cho các dòng này.

## API

| Phương thức và đường dẫn | Phản hồi thành công |
| --- | --- |
| `GET /api/admin/flood-history` | `data.floodAreas[]` chứa các dòng lịch sử chưa xóa |
| `GET /api/admin/flood-history/:id` | `data.floodArea` chứa chi tiết |
| `PATCH /api/admin/flood-history/:id` | `data.floodArea` chứa chi tiết đã cập nhật |
| `DELETE /api/admin/flood-history/:id` | `data` gồm `id`, `deleted: true` và `deletedAt` |
| `GET /api/flood-history/areas` | `data.geojson` chứa đa giác lịch sử do Admin vẽ |
| `GET /api/flood-history/points` | `data.geojson` chứa các điểm lịch sử chưa xóa |

Các API Admin yêu cầu `Authorization: Bearer <token>` và tài khoản Admin còn
hoạt động. Các API bản đồ là public. Phản hồi thành công có
`{ "success": true, "message": "...", "data": ... }`.

## Sửa một vùng lịch sử

Khi mở form, dùng `GET /api/admin/flood-history/:id` để lấy dữ liệu mới nhất.
Với điểm gốc chưa từng được chỉnh, `geometry` và `areaType` trả `null`.
Dùng `referencePoint` để đưa bản đồ tới vị trí tham chiếu và cho Admin vẽ đa
giác. Nếu bản ghi có `geometry`, nạp các đỉnh đã lưu vào trình vẽ. Trường
`source` ban đầu lấy từ URL nguồn gốc nếu có. `sourceUrl` luôn là URL gốc.

Body sau minh họa yêu cầu `PATCH /api/admin/flood-history/HIST-02`.

```json
{
  "name": "Vùng ngập lịch sử minh họa",
  "description": "Ghi chú của Admin",
  "areaType": "flood",
  "source": "Tài liệu dùng để đối chiếu",
  "geometry": {
    "type": "polygon",
    "points": [
      { "latitude": 16.08, "longitude": 108.13 },
      { "latitude": 16.08, "longitude": 108.14 },
      { "latitude": 16.09, "longitude": 108.13 }
    ]
  }
}
```

- `areaType` dùng `flood` (Vùng ngập) hoặc `low_lying` (Vùng trũng).
- Bản ghi sau khi gộp PATCH phải có tên, nguồn, loại vùng và đa giác hợp lệ.
  Lần lưu đầu cần chọn loại, vẽ đa giác và điền nguồn nếu nguồn đang trống.
  `description` có thể là `null`. Các lần sửa sau có thể gửi riêng trường đã đổi.
- Đa giác cần bao quanh một diện tích, có tối thiểu ba đỉnh khác nhau và tọa độ
  hợp lệ. Form gửi danh sách đỉnh theo thứ tự vẽ. Backend tự đóng vòng khi trả
  GeoJSON ra bản đồ.
- `id`, `referencePoint`, `sourceUrl` và `updatedAt` do server quản lý.
  `updatedAt` là ISO datetime hoặc `null` nếu chưa chỉnh sửa.
- Trạng thái lỗi gồm `400` khi dữ liệu không hợp lệ, `401` khi chưa xác thực,
  `403` khi thiếu quyền và `404` khi ID không tồn tại hoặc đã bị xóa.

## Danh sách và bản đồ

- Trong danh sách gộp, dùng nguồn của dòng để chọn API Admin lịch sử hoặc API
  Admin vùng ngập hiện có. Nhãn loại vùng và nguồn của dòng là hai thông tin riêng.
- Xác nhận trước khi gọi DELETE với body rỗng. Sau thành công, tải lại danh sách
  Admin và lớp điểm/đa giác trên bản đồ. Xóa cùng ID lần nữa trả dấu xóa cũ.
- Lớp `points` tiếp tục trả GeoJSON `Point`. Lớp `areas` trả `Polygon`
  với `properties.id`, `name`, `description`, `areaType` và `source`.
  Bản đồ cần tải thêm lớp `areas` để vẽ ranh giới do Admin chỉnh. Ghép các lớp
  với bản ghi theo ID. Các màn dùng dữ liệu mẫu cần tải từ API khi tích hợp.
- Backend lưu thay đổi và dấu xóa trong collection
  `historical_flood_area_overrides`. GeoJSON gốc, các vùng đệm tổng hợp và lớp
  radar được giữ để đối chiếu. Đa giác Admin vẽ thuộc lớp dữ liệu lịch sử và
  luôn có `current_flood_alert: false`.
