Rescue Web: /rescue/safe-locations theo catalogue v2 public, GPS người cứu hộ,
danh sách/bản đồ/chi tiết theo ID và mở Google Maps. Không CRUD, sức chứa hay ETA.

Sửa review tại 6bd7d80:
- Queue ID chi tiết khi refresh đang chạy; refresh lỗi vẫn GET đúng ID, có retry.
- Timestamp gate dùng chung cho watchPosition/getCurrentPosition; mẫu cũ không
  đổi GPS, giờ ghi nhận hay gọi danh mục theo tọa độ cũ.
- Bản đồ trực quan: vùng đệm/radar OFF mặc định, chỉ tải khi bật.

Phạm vi riêng: popup metadata HIST có sẵn trong nhánh kết hợp, không thuộc luồng
Điểm tránh trú. Giữ ID join/escape và geometry; đánh giá riêng khi review.

Lint/build/diff PASS. 74 test Web PASS, 2 optional captures SKIP; catalogue 24 PASS.
Race/GPS/xóa/404 dùng API/GPS giả lập. Render list không GPS, list GPS kiểm thử và
chi tiết cùng ID: HTTP 200, parser PASS, chỉ đọc. Chưa có kiểm thử trình duyệt,
GPS thiết bị hoặc Admin CRUD TEST live. Không khẳng định ảnh/video hay Network UI
đã đạt. Log và phân loại ca: docs/rescue-safe-locations/review-138/README.md.
Chưa merge/deploy; chờ Phú review SHA mới và nghiệm thu trình duyệt.
