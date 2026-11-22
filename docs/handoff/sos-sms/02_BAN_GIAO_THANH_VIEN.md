# Phân công và UI tích hợp

## Thiên — Người dân Mobile

Đọc API_VA_MAU_SMS.md + backend/docs/sos-direct-rescue-api.md. Chỉ sửa nhánh riêng.
Sau đăng nhập online chuẩn bị credential/số nhận, cache theo account. Cùng một
lần cầu cứu sinh UUID và cố định payload online/SMS. Bổ sung clientRequestId vào
POST online. Kiểm tra Internet thật, không chỉ WiFi. Tắt Internet -> nút Soạn
SMS SOS. Hiển thị số nhận, tuổi vị trí, tin có thể gồm nhiều SMS; không hiển thị
credential ra UI. ACTION_SENDTO + smsto + sms_body, không xin SEND_SMS.
Mở composer không được báo đã gửi/đã tiếp nhận. Nếu người dùng quay lại, trạng
thái chưa xác nhận; online lại đọc SOS để đối chiếu, không tạo lại tự động. Sau
POST timeout kiểm tra active SOS khi được, fallback phải giữ UUID/body. Nếu
credential hết hạn/chưa có/tọa độ thiếu thì nói rõ tự tiếp nhận chưa sẵn sàng,
không gán tọa độ giả. Không áp dụng tuổi GPS 60s của cảnh báo lũ cho SOS.
Tọa độ cũ vẫn dùng được khi ghi đúng capture time. Chưa có tọa độ: hướng dẫn
liên hệ số trực, tin đến vẫn được giữ kiểm tra nhưng không hứa tự lên bản đồ.
Logout đổi tài khoản xóa cache mã/tác vụ; không gán SMS cũ cho user mới.

## Khoa — Cứu hộ Web; Phú — Cứu hộ Mobile ở chat khác

Dùng nguyên luồng list/detail/map/status hiện tại, không xây lại form nhập SMS
làm luồng chính. Thêm nhãn Nguồn SMS khi source=sms; không suy đoán legacy.
Chi tiết hiển thị smsSenderPhone (Số gửi SMS), thời điểm nhận SMS, thời điểm GPS
hoặc Không rõ, cảnh báo vị trí cũ. Nút Gọi mở dialer để người dùng quyết định.
Mã clientRequestId có thể thu gọn hiển thị đối chiếu, không coi là chứng thực.
Địa chỉ/tên không có thì hiển thị chưa cung cấp, không ghép profile theo số gửi.
Không nhầm Internet của cứu hộ với Internet của người dân. Cứu hộ vẫn cần mạng
để đọc SOS từ Backend. SOS mới chỉ xuất hiện khi list refresh; không hứa realtime
nếu chưa có cơ chế tự tải lại. Nếu thêm polling thì quản lý lifecycle, không lặp
request khi background/logout. Giữ Đã cứu và đọc lại detail sau409/timeout.
Không tự hiển thị xác minh thành công hay tạo workflow phân công.

## Tú — kiểm thử

Ghi model/API Samsung, serial đã kiểm tra, SIM nhận/số gửi dạng che, SHA, backend
và APK package. Không in token/khóa/nội dung credential vào bằng chứng.
1. Test baseline online không lỗi, payload cũ vẫn được.
2. Thiên đăng nhập online chuẩn bị mã, tắt WiFi + data nhưng giữ sóng SIM.
3. Gửi SMS thật: Gateway received -> created; Web/Mobile cùng ID và tọa độ.
4. GPS cũ hiển thị đúng tuổi, không nhầm thời gian nhận thành GPS.
5. Gửi cùng tin2lần/Backend timeout/chuyển lại -> cùng ID, một initial history.
6. Online commit nhưng client timeout rồi SMS -> không trùng/không ghi đè GPS.
7. Đã cứu rồi SMS cũ đến -> không tạo lại; thông báo/lịch sử không lặp.
8. Gateway mất Internet -> lưu queue qua đóng app/reboot; reconnect retry.
9. SMS nhiều phần/tiếng Việt/dấu | trong ghi chú ghép và giải mã đúng.
10. Sai format/mã hết hạn/khóa user/GPS sai -> needs_review; không mất tin.
11. Khóa Gateway sai -> blocked, sửa cấu hình và chủ động thử lại.
12. Deny quyền, màn hình tắt, tiết kiệm pin, force-stop, máy khởi động chưa mở
    khóa: ghi rõ giới hạn thiết bị; không hứa nhận tự động trong mọi trạng thái.
13. SOS danh sách/map/detail/Đã cứu/Admin/Resident đồng nhất sau refresh.
14. Hồi quy GPS/navigation/SOS/Safe Locations nếu phần dùng chung bị thay đổi.
