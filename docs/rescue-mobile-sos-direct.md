# SOS Mobile cứu hộ

Bản tích hợp V3 dùng nền `develop` tại `6ad4a28`. Xem [bằng chứng kiểm thử](rescue-mobile-sos-validation.md).

## Luồng và giao diện

Đăng nhập Rescue → Tổng quan hoặc tab SOS → chọn thẻ hoặc ghim → Chi tiết → xác nhận sau khi
đã cứu → Backend xác nhận → rời active/list/map → xem trong bộ lọc Đã cứu cùng
mục SOS. Không nhận xử lý/assign/in_progress; tab Nhiệm vụ giữ nguyên.
Tổng quan lấy số Đang chờ cứu/Đã cứu từ API, không tự suy đoán ưu tiên.

- Danh sách: hai bộ lọc, mã SOS, số người/tình huống, thời gian gửi và Backend nhận GPS.
- Chi tiết: GPS ban đầu/mới nhất, thời gian thiết bị lấy/Backend nhận tách biệt,
  mức nước, ghi chú, người/thời gian hoàn tất và lịch sử theo đúng ID.
- Ghim SOS hoạt động màu cam trên bản đồ của tab SOS. Bấm ghim mở đúng chi tiết.
  Bản đồ ngập chính giữ các lớp ngập, vùng trũng và lịch sử.
- Chi tiết đã cứu có bản đồ riêng với vị trí cuối lưu; không ghim lại lên bản đồ active.
- Mở Google Maps theo tọa độ hợp lệ (kể cả 0); không khẳng định tuyến tránh ngập.
- ID người dùng được ghi rõ là ID. Backend chưa cung cấp tên/điện thoại nên không bịa.

## API và cô lập

Dùng Retrofit với xác thực, SessionManager và AppConfig có sẵn. Mobile lấy
dữ liệu qua Backend. Các endpoint SOS sau tiếp tục dùng hợp đồng hiện có.

- GET /api/rescue-requests?state=active|rescued&sort=newest
- GET /api/rescue-requests/{id}
- GET /api/rescue-requests/{id}/history
- PATCH /api/rescue-requests/{id}/status body {"status":"assisted"}

Không gọi accept/assignment/location; actor/time hoàn tất lấy từ Backend.
Dùng state của Backend, không tự biến cancelled/unknown thành Đã cứu.
Legacy received/in_progress thuộc active và có thể xác nhận đã cứu trực tiếp.

## Quãng đường SOS

Mobile gửi tọa độ GPS cứu hộ dưới dạng `origin: {latitude, longitude}` cùng ID SOS.
Backend đọc đích từ Firestore và gọi openrouteservice với chế độ ô tô. Cấu hình
`ORS_API_KEY` trên Backend.

| Endpoint | Body | Trường trả về trong `data` |
| --- | --- | --- |
| `POST /api/rescue-route-distance` | `{ requestId, origin }` | `requestId`, `destination`, `distanceMeters`, `distanceKm`, `provider`, `travelMode` |
| `POST /api/rescue-route-distance/batch` | `{ requestIds, origin }` với 1–100 ID riêng biệt | `provider`, `travelMode`, `results: [{ requestId, destination, distanceMeters }]` |

Cả hai endpoint yêu cầu Bearer token của tài khoản Rescue đang hoạt động.
`provider` là `openrouteservice` và `travelMode` là `DRIVE`. Batch trả
`distanceMeters: null` cho SOS chưa xác định được quãng đường và
`destination: null` khi thiếu tọa độ hợp lệ. Mobile chỉ dùng quãng đường khi
tọa độ đích trả về khớp với vị trí đang hiển thị. Danh sách có thể sắp theo mét
đường ô tô. Khi GPS hoặc dịch vụ chưa sẵn sàng, cứu hộ vẫn xem được SOS.
Quãng đường dùng để tham khảo và không xác nhận đường đi tránh vùng ngập.

## Lỗi, lifecycle và concurrency

- Danh sách/map/chi tiết active refresh khoảng 30 giây khi foreground, cùng nút
  thủ công. Request chậm không bị hủy chỉ vì đến chu kỳ kế; không hứa realtime.
- Hai bộ lọc cache riêng; network/500 giữ dữ liệu có nhãn chưa cập nhật, không
  đổi thành mảng rỗng/mock. Chỉ 200 hợp lệ rỗng mới hiển thị chưa có SOS.
- GPS cứu hộ lỗi/tắt/từ chối không chặn danh sách/chi tiết/ghim SOS.
- Chỉ gỡ active pin khi Backend xác nhận, không success lạc quan; khóa bấm trùng.
- Request cũ khác ID/phiên hoặc trước khi complete không ghi đè state mới, không
  làm pin/history vừa cứu bị mất hoặc sống lại.
- Timeout/409/lỗi PATCH: không tự PATCH lại. Đọc lại detail/history/lists để đối
  chiếu người/thời gian thật. Nếu đối chiếu lỗi, khóa xác nhận tới khi đọc lại thành công.
- 401/403 ở bất kỳ read/write: xóa cache SOS của session và hướng dẫn đăng nhập lại.
- Logout/đổi session đóng store, hủy request và xóa cache; Resident route không
  được phân loại thành Rescue route. Trạng thái scope theo vùng Rescue đang đăng nhập.
- Dữ liệu legacy thiếu ghi Chưa có thông tin, không tự tạo thời gian/GPS/lịch sử.

## File chính

- data/remote/dto/rescue/sos/RescueSosApi.kt: API/DTO riêng.
- ui/screens/rescue/sos/RescueSosRepository.kt: validate envelope/ID/state/coordinates/errors.
- ui/screens/rescue/sos/RescueSosStore.kt: state/cache/completion/reconcile/races.
- ui/screens/rescue/sos/RescueSosScreens.kt: list/detail/dialog/history/preview.
- AppNavGraph.kt, AppRoutes.kt, RoleNavigation.kt: điều hướng, quyền và session.
- RescueSosMapSection.kt: ghim SOS và tương tác theo ID.
- RescueRouteDistanceSection.kt, RescueSosRoadOrdering.kt: quãng đường và sắp xếp.
- RescueMapScreen.kt, RescueOverviewScreen.kt: liên kết SOS và thống kê.

## Checklist kiểm thử thiết bị

1. Đăng nhập Rescue; đi lại Tổng quan/SOS/bản đồ; Nhiệm vụ không đổi.
2. Resident TEST gửi → list/ghim cùng ID → chi tiết đúng người/vị trí/tình huống.
3. Từ chối/vĩnh viễn từ chối/gần đúng/GPS tắt/timeout vẫn xem SOS được.
4. Resident cập nhật GPS → refresh → pin/detail nhận điểm Backend mới nhất.
5. Mất mạng giữ dữ liệu; 200 rỗng khác lỗi; 401/403 xóa dữ liệu cũ.
6. Dialog Quay lại không ghi; xác nhận → active/map mất, Đã cứu/history còn.
7. Hai cứu hộ xác nhận/timeout → không tự ghi lặp, hiển thị người/thời gian Backend.
8. Logout/đổi user không lộ cache; các SOS TEST đối chiếu thống nhất với Resident/Web.
9. Đổi GPS SOS trong lúc tải khoảng cách. Tải lại để thấy quãng đường khớp
   tọa độ mới.

Chỉ dùng SOS có nhãn TEST được Phú/Tú chuẩn bị; giữ ID đối chiếu, không xác nhận
SOS thật của người khác. Build/unit test không thay cho kiểm thử thiết bị hoặc
Google Maps key thật.
