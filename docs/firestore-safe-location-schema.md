# Firestore Safe Location Schema — catalogue v2

Xem [contract API và quy tắc tương thích dữ liệu cũ](safe-location-catalog-api.md).

Collection `safe_locations/{id}`:

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| name | string | Tên bắt buộc |
| address | string | Địa chỉ bắt buộc |
| location | object | latitude/longitude số hợp lệ |
| type | string | shelter/school/hospital/community_center/other |
| description | string/null | Mô tả tùy chọn |
| schemaVersion | number | 2 cho bản mới |
| isDeleted | boolean | false khi thêm; true khi xóa mềm |
| createdAt, updatedAt | Timestamp | Thời gian máy chủ |
| deletedAt | Timestamp | Chỉ tạo khi xóa |
| deletedBy | string | ID Admin từ JWT, chỉ tạo khi xóa |

Không có trạng thái kích hoạt cho bản mới. Không nhận metadata từ body client.
Không ghi GPS người xem hoặc distanceKm vào document; khoảng cách được tính theo request.

Giữ nguyên document cũ và collection `safe_location_services`; không tiếp tục đưa capacity/services/contactPhone/status vào contract HTTP v2. Legacy inactive/unknown không tự xuất bản; cần Phú rà soát trước khi chuyển dữ liệu. Không chạy migration tự động.
