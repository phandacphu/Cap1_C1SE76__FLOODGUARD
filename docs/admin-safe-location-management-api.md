# Admin Safe Location Management API — superseded by v2

Contract cũ (CCF-115) có capacity/status và activate/deactivate đã được thay theo quyết định ngày 09/11/2026.

Đọc [API catalogue v2](safe-location-catalog-api.md): POST/PATCH chỉ name, address, location, type, description; DELETE xóa mềm. Không có activate/deactivate.

GET/POST/PATCH/DELETE `/api/admin/safe-locations` (ID cho detail/PATCH/DELETE) yêu cầu Admin đang hoạt động và JWT. Dữ liệu đọc qua data.safeLocations hoặc data.safeLocation.

Bản mới cần nhập, kiểm thử và được Phú quyết định merge/deploy; trạng thái deploy của bản cũ không chứng minh bản này đã được triển khai.
