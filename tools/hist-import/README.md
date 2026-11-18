# FLOODGUARD — nhập mô tả 27 điểm HIST an toàn

Phạm vi: chỉ thay đổi `description`, và `source` chỉ nếu nguồn hiện tại rỗng. Không chỉnh `id`, `name`, `referencePoint`, `areaType`, `geometry`, `sourceUrl`. File dữ liệu xuất phát từ bản mô tả ngắn đã soạn; nội dung vẫn cần được Phú duyệt trước khi ghi live.

## Trước khi chạy

1. Áp dụng patch trên nhánh mới từ `develop`, chạy kiểm thử Backend, tạo PR và chờ merge/deploy Backend mới. **Nếu Render còn Backend cũ, đừng chạy `--apply`**.
2. Đăng nhập Web bằng Admin trên đúng Backend đích. Sao chép JWT từ Local Storage **chỉ trên máy cá nhân**; không gửi token vào chat/PR/log.
3. Khai báo biến môi trường `FLOODGUARD_ADMIN_TOKEN` trong PowerShell bằng cách nhập kín (xem hướng dẫn ChatGPT). Backend local hoặc Render đều có thể dùng với `--api-url`, nhưng phải là đúng phiên bản đã cập nhật.

## Chỉ xem trước — không gửi PATCH

```powershell
node .\\tools\\hist-import\\import-hist.mjs --api-url http://localhost:5000/api
```

## Ghi sau khi duyệt nội dung và Backend mới đã deploy

```powershell
node .\\tools\\hist-import\\import-hist.mjs --api-url https://floodguard-backend-demo.onrender.com/api --apply
```

Script yêu cầu gõ `NHAP 27 HIST` trước khi gửi PATCH. Tập tin backup và report lưu trong `~/Downloads/FLOODGUARD-HIST-reports`.  Nếu PATCH/GET thất bại, công cụ dừng, không thử gửi lại lệnh ghi. Những điểm đã có mô tả được bỏ qua. Khi chạy lại sau lỗi, hãy xem kết quả GET và report trước, không chạy lại ngay.

**Quan trọng:** Đây là công cụ Admin nội bộ, không phải API công khai; yêu cầu JWT Admin. Không chạy trên dữ liệu chung khi chưa được phép ghi. Các điểm có tọa độ ước lượng và ngày/độ sâu ngập chưa xác minh đầy đủ không được trình bày như dữ liệu đo tại ghim.
