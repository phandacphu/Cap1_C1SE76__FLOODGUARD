# Khoa — Cứu hộ Web

## Phạm vi

Tab Cứu hộ Web trong HTML: list/card đủ các bản tin; Tất cả/Đang bật/Đã tắt; q; detail theo đúng ID; xem bộ vùng trên map; lịch sử inactive; loading/empty/error/retry/stale. Chỉ đọc, không nút tạo/sửa/tắt, không đăng ký push GPS bằng role rescue.

Dashboard/banner: số active, bản mới nhất và xem đủ bản tin; bỏ chọn “mức độ cao nhất” và không tự hết hiệu lực theo giờ client. endAt=null active; Admin tắt mới inactive. Không có cảnh báo không đồng nghĩa khu vực an toàn.

## API cần nối (sau /api)

- GET /flood-alerts (status/q tùy chọn); data.schemaVersion2 + floodAlerts[].
- GET /flood-alerts/active (q tùy chọn) cho dashboard; đếm đủ, không lấy phần tử đầu làm toàn bộ.
- GET /flood-alerts/:alertId; data.floodAlert,404 rõ.
- GET /flood-alerts/zones; scope tất cả vùng, group current_flood/historical_flood/low_lying.

Không gọi Admin API/GPS/device registration. Layer chỉ điều khiển hiển thị; không giới hạn phạm vi cảnh báo. Coverage partial và nguồn lỗi cần hiển thị đúng; HIST thiếu outline không dựng đa giác từ Point. Inactive mở bản đồ hiện tại có nhãn không phải snapshot lịch sử.

## Điểm cần sửa trong source hiện tại

`web/src/pages/rescue/RescueDashboard.tsx`, `components/FloodAlertBanner.tsx`, `sosMapData.ts`, adapter/type dùng chung. Banner hiện có TONE theo severity và format endAt bắt buộc, phải chuyển V2. Phối hợp Huy ở `types/admin.ts` và helpers stats; không fake severity để giữ code cũ chạy.

Không tự đổi SOS background/map/directions/Điểm tránh trú. Nếu shared parser ảnh hưởng SOS, thêm hồi quy tương ứng và nêu rõ trong PR.

## Bàn giao lại

PR/base/head SHA; lint/build; ảnh list/detail/map/filter/error/history; tests nhiều active, null endAt,404,401/403, admin tắt→refresh, response muộn và stale. Chạy hồi quy SOS/map/banner/dashboard. Ghi baseURL/deploy SHA đã test và ca chưa chạy.
