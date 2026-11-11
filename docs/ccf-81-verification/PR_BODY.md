## Bản đồ vùng ngập Web

Leaflet + MapTiler hiển thị Polygon từ GET /api/flood-areas theo areaType=flood/low_lying/null. Vùng ngập vàng, vùng trũng đỏ, lịch sử dùng ghim đỏ và vùng đỏ trong suốt. Cảnh báo lấy riêng từ /api/flood-alerts/active, ghép areaId; hiển thị đang tải, lỗi, dữ liệu cũ; popup escape HTML.

Cấu hình web/.env.local: VITE_API_URL và VITE_MAPTILER_KEY giới hạn origin. /map cho Admin/Rescue, /admin/map chỉ Admin. Các lớp lịch sử lấy từ /api/flood-history/points, /buffers, /radar.

## Phạm vi sau review

Đồng bộ develop e3a2783, giải quyết conflict App.tsx và giữ đủ route quản lý cảnh báo, điểm tránh trú, SOS và các màn Admin/Rescue.
Tách bản đồ tác chiến SOS khỏi PR theo lựa chọn leader cho phép: RescueDashboard khớp develop, bỏ RescueOperationsMap. Contract SOS cũ của dashboard develop cần xử lý riêng.

## Kiểm tra và chờ nghiệm thu

Lint/build PASS; 25 test PASS, 1 SKIP (capture live chưa cung cấp). Build còn cảnh báo chunk >500 kB. Diff whitespace sạch.

Chưa hoàn thành nghiệm thu trình duyệt sau merge: cloud browser trả ERR_CONNECTION_REFUSED đến Vite local, chưa có phiên Admin/Rescue và key MapTiler trong môi trường kiểm tra. Chờ kiểm tra đăng nhập, tile, filter/popup, offline/retry/recovery, lịch sử và điều hướng. Không có minh chứng ảnh/video thành công cho commit mới.

Chi tiết và log: docs/ccf-81-verification/README.md. Chưa merge, chờ leader review.
