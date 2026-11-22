# SOS SMS Gateway — bản triển khai đầu tiên, 22/11/2026

Nền: develop 29557d50f115a8f079e802cd5ea43aeba0885faa. Chưa commit/push/PR/merge/deploy.
Đã có Backend + source module Android riêng `mobile/sms-gateway`. Chưa nối UI
Người dân/Cứu hộ. Chưa có APK, chưa test SMS thật. Không coi bộ test Backend là
bằng chứng nhận SMS trên Samsung. Máy Samsung đã có SIM, chưa xác định model/API.

## Nghiệp vụ

Người dân đăng nhập trước khi mất mạng, chuẩn bị mã SMS còn hạn. Có Internet:
POST SOS hiện tại. Mất Internet: soạn SMS, người dân bấm Gửi. Gateway nhận và lưu
SQLite trước, chuyển HTTPS lên Backend, chờ xác nhận rồi mới đánh dấu đồng bộ.
Backend tạo cùng loại SOS schemaVersion=2, submitted/active. Cứu hộ xử lý như cũ,
PATCH status=assisted. Không thêm tiếp nhận/phân công/trạng thái in_progress.

Gateway là APK riêng/applicationId riêng `com.example.floodguard.gateway`, không
cài đè app người dân/cứu hộ. Không dùng điện thoại cá nhân có tin nhạy cảm cho demo.
Không tự đọc toàn bộ hộp thư, không READ_SMS, không SEND_SMS; chỉ nhận broadcast
SMS mới có tiền tố FGSOS1 sau khi cấp RECEIVE_SMS. Tin khác không lưu/chuyển.
Tin đã đến trước khi cấp quyền/bị force-stop không được hứa tự nhập lại.

## Khởi chạy kiểm thử

1. Áp dụng gói vào worktree riêng bằng APPLY_SMS_GATEWAY.ps1. Không chép đè repo
   đang làm dở các tính năng khác. Script không commit/push/deploy.
2. Trong backend: `npm.cmd ci`, `node --test tests/sos-sms.test.js`,
   `node scripts/test-sos-direct-rescue.js`.
3. Trong mobile: `.\gradlew.bat :sms-gateway:assembleDebug --no-configuration-cache --console=plain`.
4. APK dự kiến: `mobile/sms-gateway/build/outputs/apk/debug/sms-gateway-debug.apk`.
5. Kiểm tra `adb devices -l`, model và Android trước khi chọn thiết bị. Cài bằng
   `adb -s <SERIAL_DA_KIEM_TRA> install -r <APK>`. Không uninstall/xóa dữ liệu.
6. Mở Gateway, cấp quyền nhận SMS, nhập host HTTPS không /api và khóa riêng.
   Khóa không được nhúng vào app người dân, Git, ảnh hoặc nội dung SMS.
7. Giữ SIM có sóng, máy được mở khóa sau reboot, có điện và Internet. Lịch Android
   có thể trì hoãn đồng bộ; demo nên mở Gateway để quan sát và thử màn hình tắt.

## Biến Backend — chỉ cấu hình ở môi trường test trước

SOS_SMS_ENABLED=false (mặc định). Chỉ bật true ở môi trường kiểm thử đã chuẩn bị.
SOS_SMS_RECIPIENT: số SIM gateway, 8–15 chữ số, có thể có +.
SOS_SMS_GATEWAY_KEY: khóa ngẫu nhiên riêng >=32 ký tự, không khoảng trắng.
SOS_SMS_SIGNING_KEY: khóa ngẫu nhiên khác >=32 ký tự, chỉ Backend biết.
Giữ JWT_SECRET/Firebase/ORS và các cờ cảnh báo lũ như hiện tại.
Không dùng cùng một khóa cho JWT, Gateway và ký mã SMS.

## Điều kiện nghiệm thu trước khi merge/deploy

- Build APK đạt và cài đúng Samsung, xác nhận model/API/permission.
- Thiên hoàn tất mã SMS + UUID chung online/offline; Khoa/Phú hiển thị trường mới.
- Client Firestore không được truy cập sos_sms_inbox/sos_submissions; rà broad allow.
- Test SMS thật, nhiều phần, tiếng Việt, mất Internet ở cả hai phía, reboot,
  màn hình tắt, deny quyền, tin sai mẫu, khóa sai, timeout Backend, gửi trùng,
  online timeout rồi SMS, đã cứu rồi tin cũ đến lại.
- Tắt SMS khi kết thúc demo nếu chưa vận hành tiếp; chỉ Phú quyết định merge/deploy.

## Kết quả hiện có

11/11 test mới đạt (route thật + dịch vụ, Firestore thay thế trong bộ nhớ).
51/51 bộ hồi quy SOS đạt. Không dùng Firebase thật, không test modem/SIM.
Build Android bị chặn trước biên dịch: Gradle 9.6.0 không tải được (Network is
unreachable), môi trường không có Android SDK. Chưa có xác nhận Java/Manifest build.

## Cap nhat kiem thu 23/11/2026

Phan trang thai ban dau o tren la snapshot khi dong goi source.
- Windows: 11/11 test SMS va 51/51 hoi quy SOS dat.
- Gateway assembleDebug BUILD SUCCESSFUL, bao gom ban Chan doan 01.
- Cai va mo tren Samsung SM-A566B, Android 16/API 36 thanh cong.
- Quyen RECEIVE_SMS da cap; SMS that dung tien to da duoc luu va hien Cho chuyen.
- Da bo qua thu muc build cua module Gateway bang .gitignore.
- Chua kiem thu SMS hop le -> Backend -> SOS Web/Mobile.
- Chua trien khai UI Resident/Rescue theo ban giao.
- Chua merge/deploy Backend SMS. Tinh nang mac dinh tat.
