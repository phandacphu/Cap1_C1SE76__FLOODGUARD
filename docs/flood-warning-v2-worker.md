# Warning V2 — xử lý sự kiện và chống gửi trùng (PHASE4)

Ngày22/11/2026. Nền đã merge: PR149, commit29185aeefeebfb04b0cd8c3b5f59c523631a97ab, tree98d06c538131f7d748c0059564909e72d547b072.

Phạm vi: chuẩn bị hàng đợi và hủy công việc không còn phù hợp. **Không gửi FCM, không đánh dấu điện thoại đã nhận, không thay contract HTTP/UI đã bàn giao.** Mã giai đoạn này chưa commit/push/merge/deploy khi đóng gói.

## 1. Sổ chống trùng và công việc gửi

- Khóa sổ: hash([residentId, alertId]); giữ ba cờ general/near/inside. Khóa job: hash([residentId, alertId, kind]). Không theo thiết bị hoặc vùng.
- Receipt và job được ghi atomically trong một Firestore transaction, kiểm tra lại bản tin/tài khoản/binding/mẫu GPS ở lần retry.
- Tối đa một general, một near, một inside cho mỗi Người dân+bản tin. Inside đã ghi nhận chặn near về sau và hủy near còn pending.
- Không reset cờ vì sửa nội dung, rời/quay lại vùng, refresh, logout/rebind hoặc đổi dữ liệu vùng. Job bị hủy vẫn giữ cờ đã dùng; không bù cho đủ ba thông báo. Bản tin mới có sổ riêng.
- Payload và metadata nguồn lúc tạo job bất biến. General dùng payload/revision gốc của sự kiện tạo, kể cả Admin đã sửa trước lúc fan-out. Mở chi tiết luôn đọc API hiện hành.

Collection nội bộ mới:

| Collection | Nội dung |
|---|---|
| warning_v2_recipient_alerts | Sổ general/near/inside theo Người dân+bản tin |
| warning_v2_deliveries | Job pending/canceled; payload, nguồn đánh giá, binding lúc phát sinh; chưa có trạng thái gửi thành công trong gói này |
| warning_v2_worker_cursors | Cursor bền vững của từng lượt quét và từng binding |

Job không chép GPS thô/FCM token/installation secret. Context giữ dấu nguồn, tối đa20 bản ghi vùng liên quan và tổng/hash toàn bộ tập khớp. Danh sách vùng đầy đủ tiếp tục xem qua API, không cắt dữ liệu giao diện.

## 2. Fan-out chung và vị trí

Sự kiện general có sẵn trong flood_warning_v2_events được quét từng trang users theo document ID. Chỉ tạo job cho tài khoản hiện còn active và role resident. Không yêu cầu GPS, thiết bị, quyền thông báo hoặc token để ghi nhận general.

Mỗi trang mặc định20 tài khoản. Cursor chỉ tiến sau khi mọi mục của trang được xử lý an toàn. Lỗi ở giữa giữ cursor; các job đã ghi được chống trùng khi retry. Khi hết trang cuối, quay đầu lượt mới trong lúc bản tin còn active để bắt kịp tài khoản mới/được kích hoạt nằm trước cursor cũ. Tài khoản đã có receipt không nhận job trùng.

GPS event trong warning_v2_location_events là tín hiệu đánh thức. Event cũ so với binding/sequence hiện tại được đánh dấu superseded. Event mới xử lý một trang cảnh báo của binding rồi marked processed; **processed không có nghĩa đã gửi push**.

Lượt quét thiết bị độc lập tiếp tục các trang cảnh báo, đánh giá lại dữ liệu vùng và bắt kịp bản tin mới dù không có GPS upload mới. Cursor riêng theo binding giữ tiến độ khi GPS cập nhật liên tục; binding mới có tiến độ riêng. Chỉ vị trí available, đúng owner/binding, tuổi≤60s và accuracy≤100m mới được xét. Trong transaction vẫn kiểm tra lại thời gian và mẫu mới nhất.

Lõi đối chiếu giữ nguyên inside/boundary, near≤500m và ba nhóm vùng. Có match hợp lệ khi coverage partial vẫn tạo cảnh báo phù hợp; unknown/far không tiêu thụ near/inside. Nội dung lịch sử/vùng trũng không diễn đạt thành ngập hiện tại.

## 3. Hủy công việc và điều kiện trước gửi

Quét job pending để hủy khi bản tin inactive/không hợp lệ, tài khoản mất quyền/không active, binding đổi/hủy, GPS không còn mới/chính xác hoặc kết luận vị trí không còn phù hợp. Near bị hủy nếu inside đã được ghi nhận.

GPS có sequence mới nhưng vẫn khớp cùng điều kiện và cùng tập vùng/nguồn liên quan thì giữ job. Thay đổi ở vùng không liên quan không làm hủy job chỉ vì zonesRevision toàn bộ đổi. Job origin.sequence là dấu mẫu lúc tạo sự kiện, không được coi đó là sequence hiện tại để gửi.

Nếu tập vùng/loại/quan hệ/nguồn/thời điểm liên quan thay đổi thì hủy job mang nội dung cũ. Hash tập khớp không phụ thuộc thứ tự khoảng cách, tránh hủy do hai vùng gần đổi thứ tự.

Sự kiện deactivated hủy job pending theo trang. Khi hoàn tất ghi cancellationComplete=true và status=prepared, giữ sự kiện cho sender control của giai đoạn sau. **prepared không phải FCM đã gửi**. Hủy khi inactive không phụ thuộc tải vùng thành công. Jobs đã qua tay provider trong tương lai không thể được coi là thu hồi bằng transaction này.

Nguồn vùng được tải một lần khi cần cho một tick; snapshot có revision, không phải khóa toàn bộ dữ liệu vùng. **Sender FCM sau này vẫn phải kiểm tra lại active, recipient, binding/token/quyền và GPS/điều kiện mới nhất ngay trước gọi provider**; không dựa duy nhất vào lần rà PHASE4.

## 4. Scheduler và cấu hình

- server.js đã nối scheduler mới vào khởi động/shutdown. FLOOD_WARNING_V2_EVENT_WORKER_ENABLED mặc định false; chỉ chuỗi true bật worker.
- Khi bật: chạy lượt đầu, đợi lượt xong rồi mới lên lịch tiếp sau15giây; không chồng tick trong một process. Nhiều process được bảo vệ bằng transaction/receipt/cursor CAS, vẫn có thể đọc lặp.
- Mỗi lượt quét tối đa20 mục mỗi queue; general/device có trang con tối đa20. Giới hạn trang1..50. Cursor và trạng thái được lưu, không dùng offset hoặc tải toàn bộ users vào một transaction.
- Quét queue pending/thiết bị active để không duyệt toàn bộ GPS event đã processed. Lỗi scan trả tên queue lỗi, không log raw exception hoặc dữ liệu riêng. Những scan độc lập khác vẫn được thử.
- Nhịp15giây là nhịp worker nội bộ, không phải nhịp uploader GPS Android hay cam kết thông báo tức thời. Cần đo tải/chi phí/độ trễ thực tế, điều chỉnh batch/hạ tầng sau khi có dữ liệu.
- Không dùng FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED của worker V1 để bật V2. Không tự bật/tắt cấu hình Render trong gói này.

## 5. Kiểm thử và việc còn lại

Lệnh chọn lọc: node scripts/test-flood-warning-v2-phase4.js. Các bài SDK thực chạy qua Firestore Emulator demo-floodguard-warning-v2, loopback8087; thêm tests/flood-warning-v2.worker.firestore-emulator.test.js vào ba file Emulator PHASE3, chạy tuần tự --test-concurrency=1.

Xem backend/docs/flood-warning-v2-phase4-validation.md. Test không dùng key production hoặc ghi Firebase thật. Không sửa code giao diện đang được thành viên tích hợp.

Giai đoạn sau: lease gửi, chọn binding/token hiện hành, provider FCM thật, giới hạn payload byte, retry/backoff, trạng thái chưa rõ kết quả provider, control tắt, tích hợp Android và kiểm thử điện thoại. Chưa có bảo đảm exactly-once ở mạng/provider hoặc bằng chứng điện thoại đã nhận. Không bật sender chỉ vì queue đã có dữ liệu.

Trước môi trường dùng chung cần kiểm tra Security Rules chặn client truy cập trực tiếp collection nội bộ, indexes cho query thực, retention/chi phí và cấu hình worker. Emulator không chứng minh index/giới hạn/Rules production. Chỉ Phú quyết định commit/push/merge/deploy/bật worker.
