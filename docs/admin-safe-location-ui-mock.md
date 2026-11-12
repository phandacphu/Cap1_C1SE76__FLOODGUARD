# Admin – Quản lý điểm an toàn (UI dữ liệu mẫu)

Phạm vi: chức năng **Quản lý điểm an toàn** của Web Admin tại `/admin/safe-locations`. `Điểm tránh trú` chỉ là một loại địa điểm trong danh sách, không phải tên chức năng. Không thay đổi Backend, Firebase, Rescue Web hoặc Mobile.

## Chế độ dữ liệu
- Route hiện sử dụng `createSafeLocationDemo()` cố định trong `web/src/App.tsx`.
- **TEST / DỮ LIỆU MẪU** được gắn nhãn trong màn hình, form và bản đồ. Dữ liệu chỉ tồn tại trong phiên SPA, tải lại trang sẽ đặt lại.
- Không có fallback sang mock khi API trả lỗi. `safeLocationApi.ts` cũ **không được kết nối với route** và không được coi là contract chính thức cho lượt này.
- Trên dữ liệu thật, việc thêm thành công/xóa mềm chỉ được cập nhật UI sau khi nguồn dữ liệu trả xác nhận. Demo mô phỏng bằng lưu in-memory và tombstone khi xóa.
- Không dùng bất kỳ Firebase SDK hoặc service account trong Web.

## Giao diện theo phạm vi đã chốt
- Header, Thêm địa điểm, tổng số địa điểm, tìm tên/địa chỉ trong tập đang tải, bảng Tên / Địa chỉ / Loại / Tọa độ / Xem–Sửa–Xóa.
- Chi tiết có tên, địa chỉ, loại, tọa độ, mô tả (nếu có). Ghim xanh lá; bảng/ghim cùng ID. Sửa tọa độ cập nhật ghim, xóa xác nhận cập nhật cả 3 vùng.
- Form có lỗi cạnh từng trường bắt buộc; tọa độ trong [-90, 90] và [-180, 180]. Không tự điền tọa độ; bản đồ cho phép chọn ghim và đồng bộ input.
- Không có kích hoạt, active/inactive, sức chứa, thiết bị, chỗ trống, vận hành cứu hộ, KPI hoặc xuất danh sách.

## Kiểm thử
Từ thư mục `web`:

```powershell
npm.cmd run lint
npm.cmd run build
node --test tests/safeLocationUi.test.mjs
node --test scripts/test-admin-sos.mjs scripts/test-flood-area-types.mjs scripts/test-pr114-geojson.mjs scripts/test-pr114-ui.mjs tests/dashboard-map-load-states.test.mjs tests/floodAreaService.test.cjs
```

QA thủ công cần ghi ảnh: tải ban đầu; danh sách hai điểm mẫu; tìm kiếm; thêm thành công (mô tả trống); tên/địa chỉ/type trống; tọa độ thiếu/sai/boundary/zero; click bản đồ điền tọa độ; sửa giữ ID và đổi vị trí ghim; chọn dòng/ghim cùng chi tiết; hộp xác nhận xóa và hủy; xóa thành công ghim/dòng/chi tiết biến mất; rỗng thật; lỗi danh sách/thử lại; lưu/xóa lỗi không đổi dữ liệu (dùng nguồn giả lập lỗi trong QA riêng).

## Chưa có/không được tự suy diễn
- Contract Backend quản lý điểm an toàn, payload/endpoint xóa mềm, đồng bộ Resident/Rescue: **chờ Phú**.
- Màn hình chưa xác nhận khớp pixel ảnh mẫu số 5 vì chưa có ảnh gốc để đối chiếu.
- Không báo PASS trước khi chạy thực tế trên branch của người triển khai.
- Không tự merge hoặc deploy.
