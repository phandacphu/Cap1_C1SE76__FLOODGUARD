# Admin SOS CCF-127 / PR #131 – Bàn giao sau review

## Phạm vi
- Nhánh: `feature/CCF-127-admin-sos-v2`; PR #131 vào `develop`.
- Chỉ sửa Web Admin SOS và bộ kiểm thử; Admin chỉ dùng HTTP GET.
- Endpoint đã có: `GET /api/admin/rescue-requests`, `GET /api/admin/rescue-requests/summary`, `GET /api/admin/rescue-requests/:id`.
- Bộ lọc API v2: `state` (active, rescued, legacy_other), `from`/`to` (ISO datetime), `sort` (newest/oldest). Tìm mã SOS/Resident chỉ lọc cục bộ trên toàn bộ hàng đã tải.
- Dữ liệu chi tiết: GPS ban đầu/mới nhất, thời điểm ghi nhận/Backend nhận, kết quả cứu hộ, lịch sử trạng thái. Không phỏng đoán thông tin còn thiếu của SOS cũ.

## Sửa theo review của Phú
1. Nếu danh sách trả 200 và summary lỗi 500/mạng/hợp đồng, hàng SOS mới vẫn được hiển thị; `summaryError` hiển thị riêng, số thống kê = chưa biết (ký hiệu —), không gán 0 hay dùng số cũ như số mới.
2. Nếu một trong hai request báo HTTP 401/403, Promise kết hợp báo lỗi ngay mà không đợi request còn lại; `useSosResource` xóa dữ liệu được bảo vệ. Response thành công đến sau không được khôi phục danh sách. Nếu list lỗi khác trong khi summary chưa xong, chờ để ưu tiên 401/403 nếu xuất hiện.
3. Bộ kiểm thử Node và trình duyệt cập nhật hợp đồng v2, bổ sung ca summary 500/danh sách 200, refresh có trạng thái rescued mới và 401/403 ở cả hai chiều với peer chậm.

## Cách kiểm thử
Từ `web`:

```powershell
npm.cmd run lint
npm.cmd run build
node --test scripts/test-admin-sos.mjs
node --test scripts/test-admin-sos.mjs scripts/test-flood-area-types.mjs scripts/test-pr114-geojson.mjs scripts/test-pr114-ui.mjs
```

Kiểm tra UI trên trình duyệt thật: danh sách → chi tiết → quay lại, trạng thái/ngày/sắp xếp, làm mới GPS và trạng thái, mất mạng rồi phục hồi. Chụp DevTools Network/Response 200 và ảnh đủ bằng chứng. Chỉ gọi API GET, không sửa SOS thật.

Bộ QA trình duyệt giả lập (tùy chọn nếu có Playwright): build bằng `VITE_API_URL=http://127.0.0.1:5999/api` và `VITE_ADMIN_SOS_MOCK=true`, sau đó chạy `node scripts/test-admin-sos-browser.mjs`. Đây là **HTTP fixture**, không phải kiểm thử Render/Firebase thật. Kết quả mới lưu tại `docs/evidence/admin-sos/pr131-review/browser-results.json` và ảnh cùng thư mục.

## Minh chứng và giới hạn
- **Không sử dụng kết luận 48/48, 17/17 hay ảnh từ phiên bản cũ làm bằng chứng cho bản sửa này.** Chỉ ghi số liệu từ lệnh vừa chạy trên SHA mới.
- SHA mới: ghi trong PR #131 sau khi commit và push.
- Node SOS v2: **20/20 PASS**. Hồi quy tổng hợp: **51/51 PASS** (11/11/2026).
- ESLint và production build: **PASS** trên Windows (11/11/2026).
- Browser QA Playwright: **21/21 PASS**, browserErrors rỗng; 12 ảnh PNG và browser-results.json trong docs/evidence/admin-sos/pr131-review/. Đây là HTTP fixture, không phải Render thật.
- Render thật: **chưa xác nhận lại cho bản sửa**; phải tách rõ kết quả thật với HTTP giả lập.
- Các ca chưa xác minh: cập nhật sau khi thực hiện test, không tự ghi PASS.
- Nếu browser test phụ thuộc Playwright/Chromium chưa cài, ghi rõ `NOT RUN` kèm lý do; không báo PASS.

## Kiểm soát merge
Review PR #131 trên SHA mới, xử lý xung đột với `develop` mới nếu có, rồi Phú quyết định merge.
