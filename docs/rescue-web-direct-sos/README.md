# Rescue Web — SOS direct rescue v2

Ngày bàn giao: 2026-11-12. Nhánh: feature/rescue-web-direct-sos.
Base: develop 6ad4a28, đã có backend SOS PR #124 (merge 4119c61).
Nguồn contract: backend/docs/sos-direct-rescue-api.md trên develop.

## Phạm vi

Thay đổi Rescue Web (service, parser/type mới, hook, Tổng quan, danh sách, chi tiết và header/layout dành riêng Rescue).
Không sửa Backend, Resident, Admin, route hoặc dữ liệu Firestore.
Type Rescue cũ được giữ cho các caller Admin/legacy đang dùng; các màn Rescue mới dùng rescueDirect.ts.
Các component SOS cũ không còn được import bởi ba entrypoint Rescue mới.

## Lời gọi API

Base VITE_API_URL mặc định https://floodguard-backend-demo.onrender.com/api/; bỏ slash cuối trước khi nối endpoint.
Auth đọc floodguard_token đã có từ đăng nhập, gửi Bearer. Không yêu cầu Firebase key.
- GET rescue-requests?state=active&sort=newest; nhóm Đã cứu dùng state=rescued.
- Nhóm lịch sử khác dùng state=legacy_other. Không tự đổi cancelled thành đã cứu.
- Chỉ gửi state, sort, from/to; from/to đổi biên ngày giờ Việt Nam sang UTC có milliseconds. Tìm kiếm chỉ cục bộ trên tập đã tải.
- GET rescue-requests/:id; GET rescue-requests/:id/history.
- PATCH rescue-requests/:id/status với status=assisted và note trim/null, tối đa 200 UTF-16.
- Không gọi accept, DELETE, sửa GPS hoặc tự gửi completedBy/completedAt.
- Giữ status/code lỗi HTTP. Payload/response sai cấu trúc không biến thành danh sách rỗng.

## Giao diện

- Yêu cầu SOS mặc định Chờ cứu hộ; Đã cứu và dữ liệu lịch sử khác nằm trong cùng trang.
- Tổng quan đọc SOS hoạt động; bỏ KPI phân công, urgency và thời gian phản hồi suy diễn. Giữ banner cảnh báo lũ độc lập.
- Chi tiết hiển thị các trường tình huống/mức nước theo nhãn, GPS ban đầu/mới nhất và các timestamp backend thực sự trả, thông tin hoàn tất và sự kiện thật từ history.
- Thiếu dữ liệu cũ hiện Chưa có thông tin. Không tạo hồ sơ liên hệ giả hoặc gán thông tin tài khoản Rescue cho Resident.
- Marker lấy location, không dùng initialLocation thay thế. Chỉ đường tới location; không có ETA/khoảng cách/tuyến an toàn tự tính.
- Xác nhận có hộp hỏi; khóa nút bằng state/ref khi đang gửi. Chỉ HTTP thành công mới báo máy chủ xác nhận.
- Timeout/500 hoặc 409 STATUS_TRANSITION_CONFLICT: đọc lại chi tiết, không lặp PATCH. Kết quả đọc lại có thông điệp trung tính và hiển thị completedBy/completedAt thật.
- Nếu chưa đọc lại được, yêu cầu làm mới chi tiết trước khi xác nhận lại.
- MapTiler dùng VITE_MAPTILER_KEY có giới hạn domain. Không kèm key trong commit hoặc bundle.

## Đồng bộ và dữ liệu cũ

Poll 15 giây sau khi request trước kết thúc; một request mỗi resource, refresh lúc đang tải được xếp hàng.
Tab ẩn dừng lịch; tab hiện tải lại. Rời màn hủy request và bỏ callback cũ.
Lỗi mạng giữ dữ liệu/ghim, gắn nhãn dữ liệu cũ. 401/403/404 bỏ dữ liệu protected và dừng polling tự động; có thao tác thử lại/đăng nhập.
Response mới thay toàn bộ tập active; ca hoàn tất ở nơi khác biến mất ở lần đọc kế tiếp.
GPS cập nhật chỉ di chuyển ghim. Camera giữ vị trí người dùng, có nút đưa về SOS.
History tải riêng: lỗi mạng giữ history đã tải với nhãn lỗi, lỗi quyền ẩn thông tin.
Hiển thị thời điểm Backend nhận vị trí để người cứu hộ đánh giá độ cũ.

## Kiểm tra đã chạy

- npm run lint: PASS.
- npm run build: PASS; cảnh báo chunk JS >500 kB.
- node --test tests/rescue-direct.test.cjs: 11 PASS, 0 FAIL.
- Hồi quy bản đồ/trạng thái tải/Admin SOS được chạy cùng test mới: tổng 39 PASS, 1 SKIP, 0 FAIL. Test skip là capture API lưu sẵn chưa cung cấp; xem tests.txt.
- git diff --check: PASS.
- GET Render /api/rescue-requests?state=active&sort=newest không token: HTTP 401,
  {"success":false,"message":"Authentication token is required"}.
  Đây chỉ là kiểm tra auth, không phải kiểm thử dữ liệu Rescue đã đăng nhập.

Test mới chạy fixture TEST trong memory, không gửi dữ liệu giả lên Render. Các ca gồm contract/query/Bearer;
rỗng/sai response; null legacy/GPS; note UTF-16; PATCH 200; 409 và đọc lại người hoàn tất;
timeout/500; quyền; serialization/visibility/abort; giữ ghim khi offline; bỏ active sau khi completed ở nơi khác.

## Ca còn chờ trên Render

Chưa có tài khoản test/phiên Rescue và Resident hay bộ SOS TEST do Phú cấp trong môi trường này.
Vite đã chạy local ở 127.0.0.1:5174, nhưng cloud browser trả ERR_CONNECTION_REFUSED.
Chưa có ảnh/video UI API thật hoặc xác minh thao tác ghi Render. Không coi fixture test là E2E Render.

| Ca | Trạng thái |
| --- | --- |
| Resident tạo SOS TEST → Web xem đúng thông tin | Chưa kiểm thử Render |
| Resident đổi GPS → marker/thời gian đổi, camera giữ nguyên | Chưa kiểm thử Render |
| Rescue xác nhận trực tiếp → khỏi active, còn history | Chưa kiểm thử Render |
| Hai Rescue cùng xác nhận một SOS TEST | Chưa kiểm thử Render; nhánh xử lý 409 có unit test |
| Rescue Mobile hoàn tất → Web poll bỏ ghim | Chưa kiểm thử Render; thay tập active có unit test |
| Offline/timeout không báo thành công giả | Unit test PASS; trình duyệt thật chưa kiểm thử |
| Dữ liệu cũ/null không hỏng UI | Parser/nhãn có unit test; trình duyệt thật chưa kiểm thử |
| Wrong-role/inactive không xác nhận được | Client xử lý 403 có unit test; phân quyền thật do backend kiểm tra, chưa E2E |
| Popup, tile, modal, responsive, link điều hướng | Chưa kiểm thử trình duyệt |

Cần Phú cấp qua kênh riêng: tài khoản Rescue test hoạt động, Resident test và SOS TEST có thể hoàn tất,
thêm tài khoản Rescue thứ hai cho concurrent case; phối hợp Rescue Mobile cho cross-client case.
Chỉ thao tác ghi trên bản ghi TEST. Không merge/deploy trong lần bàn giao này.

## Chạy trên Mac

Từ web:
npm ci
npm run lint
npm run build
node --test tests/rescue-direct.test.cjs
npm run dev

Cấu hình VITE_API_URL hiện có và VITE_MAPTILER_KEY trong web/.env.local.
Đăng nhập Rescue và vào /rescue/sos, /rescue/dashboard, /rescue/sos/:id.
Sau nghiệm thu thật, cập nhật bảng với thời gian, Chrome/macOS, SHA, mã TEST, HTTP và ảnh/video đã che token/key.
