# Hợp đồng bổ sung SOS SMS v1

## Danh tính: không lấy residentId từ số gửi/tên tự khai

Để giữ quyền sở hữu và lịch sử SOS hiện tại, app người dân đã đăng nhập lấy mã
SMS giới hạn mục đích, lưu theo tài khoản trước khi offline. Mã ký HMAC-SHA256,
hạn 7 ngày, chỉ cho luồng tạo SOS qua cổng tin cậy. Không dùng JWT đăng nhập trong
SMS. Có mã không chứng minh nội dung cầu cứu hoặc số gửi là thật; nội dung vẫn là
khai báo của người dùng. Chưa hỗ trợ người chưa từng đăng nhập/tin nhắn tùy ý tự
tạo SOS. Tin thiếu mã/hết hạn vào diện kiểm tra, không mất tin, không tự ghép user.
Mã là thông tin nhạy cảm: không ghi log/chụp màn hình, xóa cache khi logout/đổi user.
Mã có thể dùng lại tới hết hạn; xoay signing key thu hồi tất cả mã cũ. Không có
thu hồi riêng từng thiết bị trong v1.

## POST /api/sos-sms/credential

Authorization Bearer JWT, tài khoản resident đang active. Body {}.
200: `{success:true,data:{credential,expiresAt,recipientPhone,format:"FGSOS1"}}`.
Lưu trước khi offline; refresh khi online trước hết hạn. UI phải báo chưa sẵn sàng
nếu chưa có mã/số nhận, không âm thầm cho rằng SMS sẽ tự tạo SOS.
401 JWT sai; 403 không phải resident active; 503 feature tắt/chưa cấu hình.

## Mã tham chiếu chung

POST /api/rescue-requests hiện có nhận thêm **clientRequestId** không bắt buộc,
UUID v4 chữ thường. Payload cũ vẫn hợp lệ. Khi tạo SOS mới sinh UUID một lần,
lưu cùng toàn bộ body đã chuẩn hóa; gửi online và SMS cùng sự cố dùng đúng UUID
và cùng nội dung. Không sửa body rồi retry cùng mã. Người dùng chủ động tạo yêu
cầu mới sau hoàn tất phải sinh UUID mới; không tự tạo lại khi reconnect.

Cùng tài khoản + UUID + body trả cùng ID ngay cả đã cứu (HTTP201 của create giữ
tương thích; client phải đọc state, không hiểu 201 luôn là SOS mới active).
Cùng mã nhưng body khác:409 SOS_SUBMISSION_CONFLICT. Khác mã khi có SOS active:
409 DUPLICATE_SOS_REQUEST, xử lý activeRequestId theo contract cũ.
Không thay đổi hoặc ghi đè vị trí mới khi nhận SMS cũ/trùng.
Điều này chỉ đảm bảo nối online/SMS khi client truyền đúng mã chung. Client cũ
không gửi mã không có cam kết nối lại sau SOS hoàn tất.

## Nội dung SMS — giữ nguyên, không thêm chữ / xuống dòng

`FGSOS1|<credential>|<uuid>|<latitude>,<longitude>|<capturedAt>|<situations>|<people>|<waterLevel>|<note64>`

- ASCII, phân cách dấu |, chính xác 9 phần. Tọa độ thập phân dấu chấm.
- capturedAt: ISO với timezone, hoặc `-` nếu không biết. Cho phép vị trí cũ,
  không dùng thời điểm gửi/nhận làm giả thời điểm GPS. Tương lai >2 phút: kiểm tra.
- situations: enum hiện tại phân cách dấu phẩy, không tự đoán mức độ.
- people: số nguyên dương, waterLevel: enum hiện tại. Giữ dữ liệu form SOS.
- note64: UTF-8 note đã trim, <=200 UTF-16 units, base64url không padding;
  note rỗng thì phần cuối rỗng (vẫn có dấu | cuối).
- Tổng body <=3000 ký tự, số phần SMS có thể >1 và tốn cước tương ứng. App gửi
  toàn chuỗi qua ACTION_SENDTO/smsto với sms_body; người dùng tự bấm gửi.
- Lấy GPS mới nếu được, nếu không dùng cache có capture time. Không có tọa độ
  vẫn giữ tin nhận để kiểm tra, không dùng 0,0 thay thiếu vị trí. Luồng tự động
  tạo SOS yêu cầu đủ tọa độ và dữ liệu form hợp lệ.

Không đưa ví dụ có credential thật vào tài liệu. Gateway ghép multipart từ PDUs
trước khi lưu và chuyển. Người dùng sửa cấu trúc -> giữ needs_review.

## POST /api/sos-sms/inbound — chỉ Gateway

Authorization Bearer SOS_SMS_GATEWAY_KEY (không dùng JWT user).
Body `{messageId,senderPhone,receivedAt,body}`. messageId UUID v4 do Gateway sinh
một lần khi lưu SMS; retry giữ nguyên cả envelope. receivedAt là thời điểm máy
Gateway nhận, không phải thời điểm GPS. senderPhone lấy từ thông tin SMS, không
từ nội dung tự khai. Body đầy đủ được lưu server-only để kiểm tra.

200 `{success:true,data:{inboxId,state,requestId,code}}`:
- created: đã lưu SOS / đã tìm lại cùng SOS, requestId có giá trị.
- needs_review: tin được lưu để kiểm tra, CHƯA tạo SOS; code giải thích.
  Gồm thiếu tọa độ, mã lỗi/hết hạn, tài khoản khóa/xóa, đang có SOS khác.
401 khóa Gateway sai; 400 envelope sai; 409 cùng messageId nhưng khác envelope.
503 feature tắt/chưa cấu hình; 5xx/timeout giữ queue và retry cùng messageId.
Không theo redirect HTTP. Gateway chỉ đánh dấu created khi success và ID hợp lệ.

## Trường đọc bổ sung (list/detail/admin chung)

source: "sms" | "api" | null (legacy không suy đoán).
clientRequestId: string|null.
smsSenderPhone: string|null, lấy từ Gateway, không phải số tài khoản xác minh.
smsReceivedAt: ISO|null.
locationCapturedAt có thể cũ/null, locationReceivedAt là thời điểm Backend lưu.
Không trả body/mã SMS/khóa Gateway từ API đọc SOS. SOS đã tạo có residentId hợp lệ,
thuộc đúng account từ mã ký; history/GPS/completion/notification theo SOS v2 cũ.
Nếu online đã tạo trước thì source vẫn api, giữ bằng chứng SMS ở inbox riêng.

## Tin cần kiểm tra

Gateway hiển thị trạng thái và code, không in credential. Backend có script chỉ
đọc `node scripts/inspect-sos-sms.js`, in metadata của pending/needs_review.
V1 chưa có UI sửa/phê duyệt inbox hay tự gửi SMS phản hồi. Trong demo, người trực
xem SMS gốc trên điện thoại và liên hệ người gửi khi tin lỗi. Không tuyên bố mọi
SMS tự do đều được chuyển thành SOS.

## Sua loi review PR152: do chinh xac thoi gian Android

Gateway tren Samsung thuc te luu Instant voi 6/9 chu so thap phan.
Backend SMS chap nhan ISO8601 co timezone va 1..9 chu so thap phan cho
receivedAt/capturedAt, chuan hoa ve milliseconds khi ghi metadata SOS.
Van kiem tra ngay hop le, timezone bat buoc va gio tuong lai >2 phut.
Envelope/body goc trong inbox va fingerprint retry giu nguyen; khong sua queue
tren dien thoai, khong doi messageId, khong can build/cai lai APK cho ban sua nay.
Tin dang blocked HTTP400 co the thu chuyen lai sau khi Backend da cap nhat.
Cac contract ngay gio cua API khac khong doi. Test SMS sau sua: 14/14 dat.
