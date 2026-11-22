# Quy ước UI/API dùng chung

## Nghiệp vụ đã chốt

Admin chỉ nhập tiêu đề+nội dung/hướng dẫn. Tạo là bật ngay; Backend ghi giờ UTC. Có thể nhiều bản tin active. Active sửa title/content bằng expectedRevision; tắt là inactive và có endAt một lần. Inactive chỉ xem: không sửa, bật lại hoặc xóa. Đợt mới tạo ID mới. Không có mức độ, chọn một vùng hoặc lịch hết hạn do Admin nhập.

Người dân ở xa/không GPS/từ chối push vẫn đọc bản tin chung. Rescue chỉ đọc, không nhận push GPS và không đăng ký notification-devices bằng role rescue. Bản tin áp dụng toàn bộ vùng đang công bố, không theo viewport/zoom/layer.

| Nhóm zones | Ý nghĩa | Không diễn đạt thành |
|---|---|---|
| current_flood | Vùng ngập hệ thống ghi nhận, Admin areaType=flood | Dự báo chính xác hoặc độ sâu đo được |
| historical_flood | Vùng từng ghi nhận ngập | Ngập hiện tại |
| low_lying | Vùng trũng: radar + Admin areaType=low_lying | Ngập hiện tại |

HIST chỉ có Point hoặc thiếu outline được giữ trong diagnostics; không tự lấy buffer làm ranh giới thật. Vẫn có thể hiển thị điểm trong lớp bản đồ lịch sử hiện có nhưng không tự tính near/inside từ điểm đó. Coverage partial phải báo phần chưa đối chiếu được.

## DTO và trạng thái

- Response đọc ở `data`, không nhầm `data.floodAlerts` với `data.floodAlert`. List có schemaVersion2; mỗi bản tin cũng có schemaVersion2. V1/sai shape là lỗi tương thích, không phải empty.
- endAt=null khi active; thời gian ISO UTC hiển thị GMT+7. Không gọi parse/format null như ngày thật. ID không phải thời gian.
- List mới nhất trước theo startAt, tie ID tăng. Nhiều active không âm thầm lấy một rồi bỏ các bản còn lại. Tổng quan có số active, bản mới nhất và đường dẫn xem đủ.
- q tìm title/content, status chỉ active/inactive; Tất cả thì bỏ status. Không gửi severity/areaId/page/limit/radiusKm.
- Loading đầu → empty200 thật → error đầu + thử lại → refresh lỗi giữ dữ liệu trước + “Chưa thể cập nhật”. Không coi401/403 là offline; chặn dữ liệu tài khoản cũ.
- Chống response muộn bằng generation/account, request ID và selected ID; đóng detail/đổi filter/GPS/logout không bị response cũ ghi đè.
- 404 detail: báo bản tin không còn truy cập được, không mở ID khác. 409 edit: đọc lại bản mới, không ghi đè. Timeout tạo giữ nguyên Idempotency-Key và body; đối chiếu creation-requests, không tự tạo key mới.

## GPS riêng Người dân

Đánh giá lấy từ Backend: inside gồm ranh giới; ngoài tới ranh giới≤500m là near; >500m chỉ far khi đủ dữ liệu. Không dùng tâm/đường bộ hoặc tự cắt danh sách vùng theo màn hình. Giữ raw distanceToBoundaryM cho logic; inside distance=null không đổi thành0.

Tuổi GPS≤60s và accuracy≤100m; quá hạn/quyền mất/no fix/accuracy kém → unknown và bỏ trạng thái đỏ hiện hành. Dùng capturedAt/validUntil; không lấy evaluatedAt kéo dài tuổi mẫu. Unknown/far không có nghĩa an toàn. Không có bản tin active thì không hiển thị khối cảnh báo vị trí gắn lịch sử đã tắt.

Hiển thị đủ matches (inside trước near, raw distance tăng) và nguồn/nhóm. Nhiều active cùng áp dụng bộ vùng hiện tại; chọn đúng alertId khi mở detail. Inactive xem bản đồ hiện tại phải ghi rõ không phải snapshot lúc tắt.

## FCM chỉ dành cho Người dân Android

Data-only, mọi value là string. Fields: schemaVersion,eventId,alertId,kind,title,body,createdAt,installationId,bindingId. kind general/near/inside hiển thị có điều kiện; deactivated chỉ hủy/đồng bộ, không tạo thông báo thứ tư. Payload rút gọn theo byte; nội dung đầy đủ đọc API.

Trước hiện: đối chiếu installation/binding với phiên hiện tại → đọc đúng detail và kiểm tra active → đối với near/inside đọc evaluation hiện tại → chỉ sau đó mới tạo thông báo local. Không suy luận FCM tới là GPS còn đúng. Nếu không xác minh được vì offline, giữ event chờ đối chiếu, không hiện cảnh báo vị trí cũ; đồng bộ ở resume/reconnect. Tắt local theo alertId khi inactive/control. Nếu control tới trước push cũ, push cũ không được bật lại.

Persist dedupe theo account+eventId (không theo màn hình), ghi sau xử lý phù hợp; kiểm tra generation trước từng callback. Đổi tài khoản bỏ pending callback/event người cũ, không chuyển notification/cache sang người mới. Không xóa dedupe rồi hiển thị lại sau relogin; dữ liệu riêng account cũ không được hiển thị cho account mới.

Một event logic/user/kind; general có thể tới nhiều installation đủ điều kiện với cùng eventId. Near/inside chỉ gửi installation đã tạo GPS đó, không gắn vị trí của máy A vào máy B. Backend không tạo lại kind đã dùng dù job bị hủy/FCM thất bại.

Provider accepted không phải điện thoại đã nhận/đã hiện/đã đọc. Backend giữ unknown khi timeout, không retry mù. FCM có thể trễ/trùng; app vẫn phải dedupe. Data-only và TTL vị trí0 có thể bị bỏ khi không giao ngay; list/evaluation trong app là nguồn thông tin khi mở/resume. Phải thử background/Doze/force-stop/quyền trên thiết bị, không cam kết chạy nền vô hạn.

## File dùng chung

Android AppNavGraph, ApiClient, DTO/repository cảnh báo, receiver MessagingService, token/binding và session guard: Thiên và Phú thống nhất owner trước sửa. Không viết thêm MessagingService/uploader/SOS session riêng trong nhánh Rescue. Web shared type admin/FloodAlertBanner/sosMapData: Huy và Khoa phối hợp đổi V1→V2; không giữ severity để làm UI hết lỗi tạm.
