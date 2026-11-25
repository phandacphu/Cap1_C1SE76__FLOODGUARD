# Bàn giao Resident Flood Warning V2 — 26/11/2026

## Kiểm tra đã thực hiện
- Unit test và assembleDebug đã thành công trên máy Thiên.
- GPS: bổ sung khoảng chờ để mẫu đạt tuổi tối thiểu 2 giây bằng đồng hồ đơn điệu; giữ nguyên timestamp đo và validation Backend.
- Kiểm tra thực tế sau sửa: gửi liên tục, tắt/bật GPS, mất/kết nối lại mạng, thu hồi/cấp lại quyền vị trí; không thấy HTTP 400 trong các lượt kiểm tra đó.
- Khoảng chờ chỉ hỗ trợ độ lệch nhỏ đã kiểm tra, không bảo đảm cho đồng hồ lệch lớn.

## Push general — PASS
- Thời điểm gửi: 20:51:03 ngày 25/11/2026, GMT+7.
- EventId: fa9d9fad-9504-462a-8d33-a52990a383ec.
- Log app: WORK_ENQUEUED lúc 20:51:07.183; LOCAL_POST_ACCEPTED lúc 20:51:08.841.
- PASS dựa trên xác nhận thao tác thực tế của Thiên và ghi nhận của Phú: nhận thông báo, bấm mở đúng chi tiết bản tin active.
- Thông báo đã xóa. Ảnh chi tiết chưa đính kèm.
- Lượt log 20:52 chưa được ghép eventId; không dùng để kết luận chống trùng.

## Đối chiếu UNKNOWN — mẫu 318
- evaluatedAt: 2026-11-25T18:16:54.678Z.
- zonesRevision: a46e2e15c22fb2a6e332db2eb6a9c6981d3aa2439794d3aac319e1023ecc1c5d.
- UNKNOWN / incomplete_zone_data; matches=0.
- Phú xác nhận replay cùng mẫu và zonesRevision cho kết quả giống Mobile.
- Theo xác nhận Backend: coverage partial do hai record Admin chưa có areaType; 189 vùng, 187 đánh giá được.
- Chưa xác định lỗi Mobile ở ca này; không sửa Mobile hoặc dữ liệu Backend để đổi kết quả.
- Lần NEAR cũ thiếu tọa độ, zonesRevision và ID ba vùng khớp: chưa đủ bằng chứng so sánh.

## Chưa nghiệm thu
- Push near/inside, chống trùng thực tế, Doze, push đến muộn sau khi bản tin tắt và các tình huống còn lại.
- Không suy rộng general PASS thành toàn bộ push V2 PASS.
- Không đưa token, JWT, installation secret hoặc tọa độ cá nhân vào tài liệu công khai.

## Cấu hình Firebase khi build
- google-services.json được cung cấp ngoài Git.
- Thành viên có quyền vào Firebase project floodguard-1b699, chọn Android app com.example.floodguard và tải google-services.json.
- Đặt file tại mobile/app/google-services.json trước khi Gradle Sync hoặc build.
- Không dùng serviceAccountKey.json thay cho cấu hình Android.
- Google Services plugin hiện bắt buộc file cấu hình phù hợp để build.
- Nếu bổ sung CI, cần cấp file cấu hình cho job trước bước Gradle; gói này chưa bổ sung workflow CI.
- Kiểm tra: từ thư mục mobile, chạy gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain.


## Review P2 — 26/11/2026
- P2.1: vô hiệu hóa phiên local trước khi hủy thông báo và gọi DELETE Backend.
- Regression logout/worker cùng nhóm receipt store đã qua; race thực tế trên Xiaomi: NOT TESTED.
- P2.2: xử lý 401/403 cùng phiên trước khi loại response cũ; epoch chặn response của phiên đã xóa.
- Regression List/Overview/Detail cho 401/403 đến muộn, đổi phiên và stale 500 đã qua; 401/403 thực tế trên Xiaomi: NOT TESTED.
- P2.3: List/Detail/Overview theo dõi refresh signal và vòng đời phiên/màn hình.
- Regression cập nhật bản tin tắt, bộ lọc active, pause/resume và xóa phiên đã qua.
- Toàn bộ testDebugUnitTest và assembleDebug thành công; APK đã cài trên Xiaomi M2006C3LG.

### P2.3 Detail — PASS thực tế
- AlertId: UQsUSLlESIg7BTI36JcF.
- Control deactivated gửi lúc 03:09:06 ngày 26/11/2026, GMT+7.
- EventId: a9a5ee6a-ca5a-45f7-aefa-43c3303cf392.
- Log: WORK_ENQUEUED lúc 03:09:08.821; CONTROL_PROCESSED lúc 03:09:09.051.
- Detail đang mở tự chuyển Đã tắt, không làm mới hoặc thoát vào lại; theo xác nhận thao tác thực tế của Thiên và ghi nhận của Phú.
- List nhận control khi đang mở trên Xiaomi: NOT TESTED.

### APK đối chiếu
- Variant: debug; applicationId: com.example.floodguard.
- SHA256: 98C4793FE29897B37C419192F783D09C2C04EB732758F58862A7F7DB33048A48.
- APK được build/test trước commit sửa P2, từ base e737882e96ce9359f4913fed1b995de13f01f051 cộng các thay đổi P2.
- Giữ nguyên kết quả general PASS và đối chiếu GPS 318.
- Không sửa Backend, không bật sender diện rộng. Chưa merge/deploy.
