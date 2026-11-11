# CCF-56/57 — bàn giao sau review 70d8cdb

Ngày kiểm tra: 2026-11-11. Base đồng bộ: develop e3a2783.

## Phạm vi và cấu hình

- Leaflet + MapTiler raster cho /map (ADMIN, RESCUE_STAFF) và /admin/map (ADMIN).
- web/.env.local cần VITE_API_URL=https://floodguard-backend-demo.onrender.com/api và VITE_MAPTILER_KEY. Key trình duyệt phải giới hạn origin theo domain sử dụng; không commit giá trị key.
- Polygon đọc từ success=true, data.floodAreas. areaType=flood (vàng), low_lying (đỏ), null/thiếu (chưa phân loại). geometry.type=polygon, points dùng latitude/longitude hữu hạn.
- /flood-alerts/active trả data.floodAlerts, ghép areaId với id vùng. status/severity thuộc cảnh báo, không thuộc vùng. Lúc chờ API hiện Đang tải cảnh báo; lỗi tải lại giữ nhãn chưa xác nhận/dữ liệu cũ.
- Lớp lịch sử Rescue đọc /flood-history/points, /buffers, /radar; ghim đỏ, viền đỏ và nền đỏ trong suốt. Đây là dữ liệu lịch sử tham khảo.
- Giữ escape HTML popup, cache chia sẻ, retry, resize và xử lý tile lỗi.

## Đồng bộ và phần SOS được tách

Đã merge develop e3a2783, giải quyết conflict App.tsx. Giữ /admin/flood-warnings, /admin/safe-locations, /admin/sos, /admin/sos/:id, /admin/users, /admin/flood-areas, /admin/historical-map, các route Rescue và route bản đồ.

Theo phương án leader cho phép, tách thay đổi dashboard/bản đồ tác chiến SOS khỏi PR:
- RescueDashboard.tsx khớp nguyên bản origin/develop e3a2783.
- Loại RescueOperationsMap.tsx và import của nó.
- Không còn bản đồ tác chiến SOS mới dựa vào urgency trong diff PR.
- sort=priority/contract cũ còn trong dashboard của develop là vấn đề riêng, chưa được sửa trong PR này.
- Các sửa nhãn số SOS ở Admin và test trạng thái tải tiếp tục được giữ.

## Kết quả chạy tự động

- npm run lint: PASS.
- npm run build: PASS, còn cảnh báo chunk >500 kB.
- node --test tests/dashboard-map-load-states.test.mjs tests/floodAreaService.test.cjs scripts/test-admin-sos.mjs: 25 PASS, 1 SKIP, 0 FAIL.
- Test skip là response API lưu sẵn, chỉ bật khi cấu hình LIVE_FLOOD_AREAS. Không coi đây là kiểm tra live mới.
- Kiểm tra whitespace cho diff PR và conflict markers: PASS sau chuẩn hóa log.
- Log đầy đủ trong lint.txt, build.txt, service-tests.txt.

## Trình duyệt và phần còn chờ

Vite đã khởi động tại 127.0.0.1:5173. Trình duyệt cloud trả net::ERR_CONNECTION_REFUSED khi truy cập /login. Chưa có phiên đăng nhập tài khoản Admin/Rescue trong môi trường kiểm tra. Không có ảnh/video trình duyệt thành công cho bản sửa này; ảnh review trước không dùng để thay thế.

| Ca nghiệm thu | Kết quả sau merge |
| --- | --- |
| Đăng nhập Admin/Rescue, vào /admin/map và /map | Chưa kiểm thử, bị chặn kết nối/thiếu phiên test |
| Nền MapTiler với key hợp lệ | Chưa kiểm thử |
| Màu, filter, popup trên trình duyệt | Chưa kiểm thử; service và trạng thái tải có test tự động |
| Mất mạng → tải lại → nhãn dữ liệu cũ → phục hồi | Chưa kiểm thử trình duyệt |
| Bật/tắt lịch sử | Chưa kiểm thử trình duyệt |
| Điều hướng route cũ, cảnh báo, điểm tránh trú | Route đã giữ trong code; chưa click kiểm tra |
| Bản đồ SOS contract mới | Đã tách khỏi PR, không thuộc bàn giao |

Leader hoặc Khoa cần chạy trên máy có tài khoản test và key MapTiler. Mọi thao tác tạo/sửa dữ liệu chỉ dùng bản ghi TEST. Không có thao tác ghi API dữ liệu trong lần kiểm tra này. Nhánh để review, chưa merge.
