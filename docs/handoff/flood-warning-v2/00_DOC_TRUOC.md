# FLOODGUARD — bàn giao Cảnh báo lũ V2

Ngày 22/11/2026 (Việt Nam). Chủ trì Backend/duyệt: Phú.

## Mốc nguồn và phạm vi

- Nền đã merge: `be9d99cbc954eb0800bba20fd824ac69a61cd569` (PR150, develop).
- Gói tiếp theo: nhánh local `feature/flood-warning-v2-sender-handoff`, chưa commit/push/merge/deploy. Dùng manifest SHA256 trong ZIP để nhận diện đúng nội dung.
- API HTTP đã có trên nền; gói này thêm sender FCM, không đổi URL/body/DTO HTTP. Chỉ bổ sung hai field string `installationId`, `bindingId` trong FCM để Android loại push khác phiên.
- Chưa xác nhận deploy SHA Render, chưa có nghiệm thu bốn client/điện thoại/FCM thật. Không lấy health200 hoặc test giả provider làm bằng chứng đã nhận push.

## Giao việc đúng người

| Người | Phạm vi | Đọc trước |
|---|---|---|
| Huy | Admin Web | 01_HUY_ADMIN_WEB.md |
| Khoa | Cứu hộ Web | 02_KHOA_CUU_HO_WEB.md |
| Thiên | Người dân Mobile + lớp FCM/binding Android dùng chung | 03_THIEN_NGUOI_DAN_MOBILE.md |
| Phú (chat khác) | Cứu hộ Mobile | 04_PHU_CUU_HO_MOBILE.md |

Mỗi người phụ trách UI và nối API của mình. Backend do Phú giữ tại chat chính này. Không sửa Jira hoặc gửi tin nhắn thay Phú trong gói này.

## Thứ tự tài liệu

1. Mở `UI_4_GIAO_DIEN_DA_DUYET.html` bằng trình duyệt, chọn đúng đối tượng. Đây là bản mẫu Phú đã duyệt ngày20/11; dữ liệu/map/push minh họa, không phải ứng dụng đã nối Backend.
2. Đọc file giao việc của mình và `05_QUY_UOC_CHUNG.md`.
3. API chi tiết: `../../flood-warning-v2-api.md`. Android: `../../flood-warning-v2-device-gps.md`. JSON dựng UI: `../../examples/flood-warning-v2.json`.
4. Request dùng thử: `Warning_V2.postman_collection.json`, `Warning_V2.postman_environment.json`. Base mặc định loopback, token/credential để trống; tự chọn đúng môi trường được Phú thông báo. Không bật Runner toàn collection vì có thao tác ghi.
5. Kiểm thử chung: `06_NGHIEM_THU_LIEN_THONG.md`; vận hành Backend: `../../flood-warning-v2-sender.md`.

## Mẫu UI và dữ liệu thật

HTML là nguồn bố cục/luồng xem trước, không lấy state local/ID mẫu/timestamp mẫu làm API. HTML chỉ có một cảnh báo active minh họa; bản thật phải hỗ trợ nhiều active, chọn đúng ID, không fallback sang bản tin khác nếu404. HTML đổi vai trò để xem thử; ứng dụng thật phân quyền từ đăng nhập và Backend. Không dùng nút giả như tính năng hoàn thành.

Màu/nhãn tham khảo mẫu đã duyệt của bốn giao diện; giữ ngôn ngữ thiết kế sản phẩm, màu phẳng, không thêm gradient. Không tự đổi màu bản đồ chung đã chốt giữa các nhóm; nếu HTML sơ đồ và bản đồ thật khác màu, phối hợp với Phú trước thay lớp dùng chung. Ba nhóm dữ liệu và ý nghĩa là bắt buộc, không phụ thuộc màu.

Ưu tiên khi tài liệu khác nhau: quyết định mới Phú chốt → contract API hiện tại + quy ước chung → checklist → HTML bố cục. Báo Phú nếu phát hiện mâu thuẫn; không tự thêm field/endpoint hoặc diễn giải unknown thành an toàn.

## Điều kiện bắt đầu

Có thể làm UI/adapter và test fixture ngay. Chỉ nối môi trường thật sau khi Phú thông báo baseURL, deploy SHA, tài khoản TEST và trạng thái worker/sender. Sau nhập gói Backend, Phú chạy Windows/Emulator, review rồi tự quyết định Git/Render. Không yêu cầu member bật worker hoặc dùng Firebase key server trong frontend.

## Quy tắc tích hợp Git

Tạo nhánh riêng từ develop mới nhất sau mốc Backend đã thống nhất. Ghi base/head SHA vào báo cáo. Phạm vi client tách riêng; shared Android phải thống nhất file với Thiên/Phú trước sửa. Không cherry-pick cả Backend vào từng nhánh client, không tự merge nhánh thành viên khác. Mỗi PR ghi file dùng chung, tests và ca thiết bị chưa chạy.
