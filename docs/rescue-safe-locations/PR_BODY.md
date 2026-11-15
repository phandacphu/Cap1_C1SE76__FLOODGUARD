Rescue Web: bổ sung Điểm tránh trú theo API catalogue v2 và giữ lại bản đồ HIST đã
làm trước đó trên cùng nhánh sử dụng.

- /rescue/safe-locations: danh sách, bản đồ, chi tiết theo ID, GPS/last-known,
  khoảng cách Backend, lọc cục bộ, Maps và xử lý refresh/lỗi/xóa/response muộn.
- /map: gộp bản HIST b11a6f9 để giữ vùng tròn bật sẵn, điểm đỏ, đa giác Admin và
  popup metadata; radar vẫn tắt/lazy. Không tự đổi hình học hay GPS.
- Shared files: App.tsx/navConfig.ts route/menu; RescueHeader.tsx/RescueLayout.tsx
  nhãn đồng bộ thủ công cho catalogue, mặc định các màn khác giữ nguyên.
- Không sửa Admin/Mobile/Backend/đăng nhập/luồng SOS. Không CRUD Rescue hoặc ETA giả.

Lint/build PASS; bản kết hợp 67 test PASS, 2 optional capture test cũ SKIP.
Capture API public catalogue và HIST đã được replay bằng parser thật. Chưa có
nghiệm thu trình duyệt, GPS thiết bị, ảnh/video hoặc Admin CRUD TEST -> Web reload;
cloud browser không kết nối localhost. Xem docs/rescue-safe-locations/README.md.
Chờ Phú review phạm vi kết hợp; chưa merge develop/deploy.
