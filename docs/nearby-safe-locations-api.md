# Nearby Safe Locations API — v2

Đọc [contract chính thức](safe-location-catalog-api.md). Quyết định ngày 09/11/2026: hiển thị tất cả điểm chưa xóa, không giới hạn bán kính, gần → xa khi có GPS.

- GET `/api/safe-locations`: không GPS, distanceKm=null; có thể truyền đủ latitude/longitude để sắp khoảng cách.
- GET `/api/safe-locations/nearby`: alias bắt buộc latitude/longitude, trả cùng toàn bộ tập, không giới hạn bán kính.
- Query radiusKm/type/status/search/page/limit cũ không còn hỗ trợ, trả 400.
- Haversine, distanceKm gốc chưa làm tròn; không phải chiều dài đường đi hoặc tuyến tránh ngập.
- API không cần Maps key hay token cho thao tác đọc.
- Điểm đã xóa/legacy inactive và dữ liệu không hợp lệ không được cung cấp; không có workflow kích hoạt mới.
