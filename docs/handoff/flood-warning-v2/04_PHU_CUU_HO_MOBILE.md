# Phú — bàn giao cho chat triển khai Cứu hộ Mobile

## Tin nhắn có thể dán sang chat khác

Tôi là Phú, lead FLOODGUARD. Triển khai UI/API Cảnh báo lũ V2 **chỉ Cứu hộ Mobile** theo bộ bàn giao này và tab Cứu hộ Mobile trong HTML đã duyệt. Backend do chat chính hoàn thiện; không làm lại Backend/sender. Trước sửa hãy kiểm tra branch/HEAD/working tree và đọc source liên quan. Không tự push/PR/merge/deploy. Hướng dẫn tiếng Việt, ghi rõ terminal/thư mục trước mỗi khối lệnh, chờ kết quả khi phụ thuộc máy tôi.

Nền Backend đã merge PR150 là be9d99c; gói sender bàn giao riêng chưa merge/deploy. Chỉ nối baseURL/deploy SHA do tôi xác nhận; không coi Render health200 là V2 sẵn sàng.

## Luồng bắt buộc

Tổng quan → Cảnh báo lũ → List (Tất cả/Đang bật/Đã tắt) → Detail đúng ID → Map vùng. Back detail về đúng list/filter đang xem; back list về Tổng quan. Tổng quan có số active, bản mới nhất, xem tất cả. Nhiều active hỗ trợ đầy đủ. Inactive vẫn xem lịch sử, không thêm nút quản lý.

Rescue chỉ đọc; không có GPS-personal warning/push registration của Resident. Vẫn có thể hiển thị vị trí cứu hộ hiện có trên map như chức năng hỗ trợ nếu dùng chung chuẩn hiện tại, nhưng không gọi PUT location của Resident, không tự tạo khối near/inside cá nhân hoặc tính lại bằng SOS origin.

## API sau /api

GET /flood-alerts?status=active&q=... (bỏ query không dùng), GET /flood-alerts/active, GET /flood-alerts/:alertId, GET /flood-alerts/zones. Bearer JWT rescue, quyền hiện tại Backend kiểm tra. Không gọi /admin/* hoặc /notification-devices bằng role rescue.

DTO V2: schemaVersion2, endAt nullable, status active/inactive, scope all_published_zones; không severity/areaId/thời hạn tự hết. UTC hiển thị GMT+7. Ba nhóm regions và coverage theo quy ước chung. Không vẽ polygon từ HIST Point/buffer.

## Trạng thái và kỹ thuật

Compose, Retrofit→DTO→repository→ViewModel/state theo cấu trúc repo; loading/empty/error/retry/stale tách biệt;401/403 khóa session;404 detail rõ; response muộn không ghi đè selected ID/logout/new request. Không reset camera/zoom vì recomposition, không gọi API lặp khi toggle layer. Scope toàn vùng không phụ thuộc layer/viewport.

Rà `ui/screens/rescue/RescueOverviewScreen.kt`, `ui/navigation/AppNavGraph.kt`, ApiClient, role navigation, `ui/screens/warning/*` và model/repository cảnh báo hiện có. Nếu dùng chung với Resident, phối hợp Thiên trước thay. Không tạo FirebaseMessagingService/uploader thứ hai. Không refactor SOS/Điểm tránh trú; hồi quy khi động shared GPS/nav/map.

## Nghiệm thu và bàn giao

Ghi branch/base/head SHA, file sửa/new, tác động shared, test commands/results, APK/applicationId/baseURL, ảnh/video, lỗi sửa, diff check và ca chưa chạy. Samsung SM-A605G Android9: kiểm tra ADB trước cài, không uninstall/wipe dữ liệu nếu tôi chưa cho phép. Đủ list/detail/map/filter/empty/offline/refresh/404/rotate/background/logout-login và Admin thêm/sửa/tắt→Rescue refresh cùng trạng thái. Không gọi build PASS là device PASS.
