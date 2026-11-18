# Admin Web – Quản lý điểm an toàn, API catalogue v2

## Nguồn và phạm vi
- Source contract: `docs/safe-location-catalog-api.md` trên `develop` (PR Backend #127); Admin: Huy.
- Chỉ thay đổi Web Admin; không sửa Backend, Firebase, Rescue Web hoặc Mobile.
- Tuyến `/admin/safe-locations` sử dụng `safeLocationApi` thật. `safeLocationDemo.ts` chỉ còn là fixture riêng cho unit test, không bao giờ là fallback của API.
- Tiêu đề UI theo tên chức năng nhóm: **Quản lý điểm an toàn**; loại `shelter` hiển thị **Điểm tránh trú**.
- Đặt `VITE_API_URL=https://floodguard-backend-demo.onrender.com/api` trong `web/.env.local` nếu đang dùng một URL khác. Không commit `.env.local`, token hoặc mật khẩu.

## Backend contract
- `POST /api/auth/login`: lấy `data.token` và `data.user` qua luồng login chung.
- `GET /api/admin/safe-locations`: `data.safeLocations`; `GET /api/admin/safe-locations/:id`: `data.safeLocation`.
- `POST`: chỉ gửi name, address, location (latitude/longitude), type, description; HTTP 201 đọc `data.safeLocation`.
- `PATCH /:id`: gửi **chỉ các trường khác** (cặp location luôn đủ hai thành phần), HTTP 200; nếu không thay đổi thì chỉ GET detail, không gửi PATCH rỗng. Bảo toàn ID, createdAt phía Backend.
- `DELETE /:id`: không body, HTTP 200, cần `data.id` khớp và `data.deleted === true`. Backend thực hiện soft delete; client không gửi các trường cờ xóa.
- Không gửi query lọc, search, status, capacity hoặc phân trang. UI chỉ tìm kiếm cục bộ tên và địa chỉ.
- Dữ liệu legacy thiếu vị trí hoặc loại vẫn xem/sửa được; không tự xuất bản các bản ghi inactive và không tự migration.

## Trạng thái và kiểm tra
- Không fallback sang demo. Lỗi danh sách (HTTP 0/500) giữ hàng đã tải, hiện **Chưa thể cập nhật**; lỗi 401/403 không hiển thị dữ liệu quản trị cũ.
- GET detail theo ID khi chọn dòng/ghim, 404 hiện **Địa điểm không còn được cung cấp**, tải lại list để bỏ ghim.
- Chỉ báo tạo/sửa/xóa thành công khi HTTP API xác nhận; sau thao tác, tự tải lại danh sách.
- Form giữ nội dung khi lỗi, khóa khi đang ghi. POST timeout không retry. PATCH timeout GET detail đối chiếu; DELETE timeout GET detail rồi tải lại danh sách, không tự lặp DELETE.
- Dashboard: **Điểm an toàn được cung cấp** lấy số lượng từ `GET /admin/safe-locations` thành công; lỗi hiện `—`, không biến thành 0 hoặc tính bằng status/capacity.

## Chạy thử trên máy
```powershell
cd web
npm.cmd run lint
npm.cmd run build
node --test tests/safeLocationUi.test.mjs tests/safeLocationApiV2.test.mjs
node --test tests/dashboard-map-load-states.test.mjs tests/floodAreaService.test.cjs
```

## Render – kiểm thử có kiểm soát
1. Đăng nhập bằng Admin hợp lệ trên đúng Backend Render, không dùng token local, không hardcode token.
2. Mở `/admin/dashboard`, `/admin/safe-locations`; kiểm tra GET list, GET detail, KPI, dữ liệu rỗng/lỗi, 401/403.
3. Chỉ khi được phép ghi dữ liệu test: tạo **một** bản ghi `TEST ONLY - ...` với địa chỉ/mô tả minh họa, chụp HTTP 201 và ghi lại **ID**, PATCH chính ID đó, chụp HTTP 200, DELETE chính ID đó có xác nhận, chụp HTTP 200, GET detail sau xóa phải 404. Không sửa/xóa địa điểm của người khác.
4. Chụp UI bảng, ghim xanh lá, form validation, cảnh báo lỗi, hộp xác nhận, Dashboard. Che token/cookie/mật khẩu khi chụp Network.
5. Nếu không thể test Render có quyền hoặc chưa được phép ghi, ghi rõ `NOT RUN`, không dùng fixture để tuyên bố test Render PASS.
6. Không tự merge/deploy. Bàn giao SHA, PR, lint/build/test thực tế và hạn chế cho Phú.

## Bộ thử tự động
- `safeLocationUi.test.mjs`: form/validation/fixture cùng yêu cầu màn quản trị.
- `safeLocationApiV2.test.mjs`: hợp đồng HTTP theo fixture (không gọi Render), PATCH delta, ID, 404, lỗi 401/403/500, timeout, Dashboard.
- Hình ảnh kiểm thử trình duyệt thật cần được chụp sau khi chạy trên máy, không được suy ra từ Node test.
