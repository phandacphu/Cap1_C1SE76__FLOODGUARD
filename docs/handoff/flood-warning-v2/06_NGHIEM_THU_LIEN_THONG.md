# Nghiệm thu bốn giao diện

Mỗi ca ghi: source/head SHA, deploy SHA, baseURL, role/account TEST, Web build/APK/applicationId/Android, input và dữ liệu ID, expected/actual, ảnh/log an toàn, PASS/FAIL/CHƯA CHẠY. Không dùng báo cáo cũ cho binary mới.

## Trình tự nhóm

1. Phú công bố Backend build/API ready, cờ worker và chế độ TEST; mọi người xác nhận cùng baseURL/contract.
2. Huy tạo một bản tin TEST có idempotency key giữ nguyên. Ghi alertId Backend trả về, không dùng ID fixture.
3. Khoa, Thiên và Phú Rescue đọc list/detail cùng alertId/title/content/status/startAt/endAt; Admin summary khớp số active.
4. Huy sửa title/content bằng revision hiện tại; ba client refresh thấy cùng nội dung, không có general lần hai.
5. Thiên dùng GPS TEST trong/gần/xa/unknown và kiểm tra notification theo bảng dưới. Hai Rescue chỉ đọc, không gọi API Resident.
6. Huy tắt đúng alertId. Tất cả refresh chuyển inactive với cùng endAt; Android control/late push không bật lại. Không DELETE bản tin TEST.

## Ma trận tối thiểu

| Ca | Expected |
|---|---|
| Tạo hai bản tin khác key | Hai active độc lập; mọi UI xem đủ |
| Tạo timeout/retry cùng key/body | Một ID/event; không tạo trùng |
| Cùng key khác body |409; không tự đổi key |
| Hai edit cùng revision | Một thắng, một409/reload |
| Tắt lặp/edit sau tắt | endAt giữ nguyên; edit409 |
| Resident/Rescue gọi Admin |403, không ghi dữ liệu |
| JWT cũ sau account khóa/đổi role | Không tiếp tục truy cập |
| V1 cùng DB, schemaVersion sai | Không trộn vào V2 hoặc coi empty |
| GPS trong/cạnh/đỉnh |inside; distance=null |
| GPS ngoài499/500/501m |near/near/far với dữ liệu vùng đầy đủ |
| Age60s/60001ms; accuracy100/101/null | biên hợp lệ, quá biên/thiếu là unknown |
| Permission denied/GPS off/no fix | bỏ trạng thái đỏ; vẫn đọc bản tin chung |
| Radar + Admin low_lying | Cùng nhóm Vùng trũng, lời văn đúng |
| HIST Point không outline; nguồn lỗi | diagnostics/partial/unknown; không bịa polygon/far |
| Nhiều vùng/multi polygon/holes | matches đầy đủ, inside trước near |
| Zoom/tắt layer | Không giảm phạm vi đối chiếu |
| Far→near→inside→near/relogin | Tối đa1 general/near/inside logic; inside chặn near |
| Nhiều installation | general cùng eventId; vị trí chỉ installation origin |
| Token đổi/permission đổi/logout A→B | không gửi/hiện cho account/binding cũ |
| Provider timeout/unknown/restart | Không auto resend; Android dedupe |
| Admin tắt khi provider đang bay | Late data không hiện active, control không thành thông báo thứ tư |
| Foreground/background/Doze/force-stop | Ghi hành vi thiết bị thật; không suy PASS từ Emulator |
| Offline/refresh lỗi/reconnect | dữ liệu cũ có nhãn, không false empty hoặc an toàn |
| Detail404/response muộn/rotate/back | đúng ID/phiên, không treo/ghi đè |
| Login, SOS, bản đồ, Điểm tránh trú | Hồi quy shared nav/GPS/map/DTO đạt |

## Cổng nghiệm thu

Backend test chọn lọc + Emulator chỉ chứng minh phạm vi tương ứng. Windows nhập gói phải có log riêng. Để ghi “nhóm dùng API thật”: cần đúng deploy SHA, tài khoản TEST đủ ba role,16 endpoint HTTP kiểm tra quyền/shape, Rules/indexes đã đối chiếu môi trường. Để ghi “nhận cảnh báo hoàn chỉnh”: thêm Android/FCM thật và bốn client liên thông. Ca chưa chạy phải để CHƯA CHẠY, không bỏ qua trong kết luận.
