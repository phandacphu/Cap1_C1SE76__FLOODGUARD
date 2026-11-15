Rescue Web trước đây chưa có màn danh mục điểm tránh trú. Bổ sung
`/rescue/safe-locations` với danh sách bên trái, bản đồ/chi tiết bên phải,
đọc API public catalogue v2; giữ phân quyền Rescue hiện có.

- GPS thật/last-known/no-GPS; khoảng cách Backend gần → xa, giữ 0 km và điểm xa.
- Tìm tên/địa chỉ và lọc loại trên dữ liệu đã tải; thẻ/ghim/chi tiết cùng ID.
- Refresh nhận sửa/xóa, 404 bỏ điểm, lỗi giữ bản cũ; epoch/abort chống phản hồi muộn.
- Chỉ xem và mở Google Maps. Không CRUD, sức chứa, tiện ích, ETA hay nhãn tuyến an toàn.
- Shared files: App.tsx/navConfig.ts thêm route/menu; RescueHeader.tsx và
  RescueLayout.tsx thêm tùy chọn nhãn đồng bộ thủ công cho màn này, mặc định cũ giữ nguyên.
- Không sửa Admin, Mobile, Backend, đăng nhập, bản đồ ngập hoặc luồng SOS.

Kiểm tra: lint/build PASS; 60 test Web PASS, 2 optional capture test cũ SKIP.
17 test catalogue PASS, có replay phản hồi GET public Render (list/no-GPS,
list/0-km, detail cùng ID). Không có ghi dữ liệu thật.

Còn chờ: ảnh/video trình duyệt, GPS/quyền thật, kiểm tra thẻ/ghim/Maps/responsive
và Admin CRUD TEST → Rescue reload. Cloud browser không kết nối localhost
(ERR_CONNECTION_REFUSED); không coi test store/helper là nghiệm thu UI.
Chi tiết/log ở docs/rescue-safe-locations/README.md. Chờ Phú review, chưa merge/deploy.
