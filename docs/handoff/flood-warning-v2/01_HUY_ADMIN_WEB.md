# Huy — Admin Web

## Phạm vi

Quản lý cảnh báo lũ V2 theo tab Admin trong HTML. List/table, ba thống kê tổng/đang bật/đã tắt, q và filter, chi tiết, tạo, sửa active, tắt có xác nhận, lịch sử inactive. Giữ sidebar/auth/theme chung; không sửa Backend.

Form tạo đúng hai trường title/content; giới hạn180/4000 ký tự Unicode sau trim. UI không có severity, chọn vùng, đặt giờ hoặc bật lại/xóa. Phạm vi hiển thị tất cả vùng hệ thống. Sau tạo thành công hiện bản tin đã lưu; không toast “mọi người đã nhận thông báo”.

## API cần nối (sau /api)

| Method | Path | Lưu ý |
|---|---|---|
| GET | /admin/flood-alerts?status=active&q=... | Bỏ status/q khi không dùng |
| GET | /admin/flood-alerts/summary | Không gửi filter; đếm toàn bộ V2 |
| GET | /admin/flood-alerts/:alertId | data.floodAlert |
| POST | /admin/flood-alerts | Idempotency-Key UUIDv4; {title,content} |
| GET | /admin/flood-alerts/creation-requests/:requestId | Đối chiếu sau timeout tạo |
| PATCH | /admin/flood-alerts/:alertId | {expectedRevision,title?,content?}; ít nhất một field sửa |
| POST | /admin/flood-alerts/:alertId/deactivate | Body{}; không nhập endAt |
| GET | /flood-alerts/zones | Nếu màn chi tiết có bản đồ; dùng cùng bộ vùng chuẩn hóa |

401/403 khóa truy cập;409 revision/inactive tải detail mới; timeout PATCH đọc lại trước quyết định retry. Tắt nhiều lần giữ cùng endAt. Khi tạo timeout giữ draft/body/key qua đóng/mở form hoặc reload được kiểm soát; không biến kết quả chưa rõ thành tạo mới. Nếu GET đối chiếu404, request cũ vẫn có thể đang commit: retry cùng key/body.

## Điểm cần sửa trong source hiện tại

Rà `web/src/pages/admin/flood-warning/`, type `web/src/types/admin.ts`, summary/dashboard và các selector vẫn dùng severity/areaId/endAt bắt buộc. Các controller/service Backend V1 còn trong repo để tương thích module khác không phải contract API V2 đang mount. Đọc contract/router V2, không suy shape từ tên file cũ.

Huy sở hữu thay đổi type/service Admin; báo Khoa trước khi đổi type dùng chung. Không sửa luồng SOS/Điểm tránh trú hoặc module Notification dùng chung ngoài phụ thuộc đã nêu trong PR.

## Bàn giao lại

PR + head/base SHA; file list/shared; lint/build; ảnh list/create/detail/edit/deactivate/history/loading/empty/error; tests tạo retry cùng key,409 edit,401/403, hai active, refresh lỗi; test liên thông Admin→Resident/Rescue sau refresh. Ghi rõ môi trường/baseURL, không lấy fixture làm API PASS.
