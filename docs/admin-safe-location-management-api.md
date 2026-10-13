# Admin Safe Location Management API



## Jira task



CCF-115 — ADMIN-BE-04 Implement Safe Location Management API.



Admin thêm, xem, sửa và deactivate địa điểm an toàn.



## Trạng thái bàn giao



Đã kiểm thử local bằng API và Firestore thật.

Chưa xác nhận deploy hoặc kiểm thử trên Render cho CCF-115.



## Xác thực và quyền



Mọi endpoint cần:



Authorization: Bearer <token>



POST/PATCH có JSON cần:



Content-Type: application/json



Chỉ Admin đang hoạt động được sử dụng.



Backend kiểm tra JWT qua middleware và kiểm tra lại tài khoản

trong collection users. Tài khoản phải tồn tại, có role = admin

và isActive = true.



Actor ghi audit được lấy từ phiên đăng nhập, không lấy từ body.



## Endpoints



| Method | Path | Chức năng |

| --- | --- | --- |

| GET | /api/admin/safe-locations | Danh sách |

| GET | /api/admin/safe-locations/:locationId | Chi tiết |

| POST | /api/admin/safe-locations | Tạo mới |

| PATCH | /api/admin/safe-locations/:locationId | Sửa, activate hoặc deactivate |



Các endpoint hiện không hỗ trợ query parameters.

Chưa có phân trang hoặc tìm kiếm.

Danh sách sắp theo ID.



## Tạo địa điểm



POST /api/admin/safe-locations



```json

{

&#x20; "name": "TEST ONLY - simulated safe location",

&#x20; "address": "Simulated address - NOT a real shelter",

&#x20; "location": {

&#x20;   "latitude": 16.0544,

&#x20;   "longitude": 108.2022

&#x20; },

&#x20; "type": "shelter",

&#x20; "capacity": 10,

&#x20; "capacityNote": "TEST ONLY - simulated capacity",

&#x20; "description": "NOT a real evacuation location",

&#x20; "contactPhone": null,

&#x20; "status": "inactive"

}

```



### Validation



\- name và address: chuỗi bắt buộc, không rỗng sau trim.

\- location: object chỉ gồm latitude và longitude.

\- latitude: số hữu hạn từ -90 đến 90.

\- longitude: số hữu hạn từ -180 đến 180.

\- Không chuyển chuỗi tọa độ thành số.

\- type: shelter, school, hospital, community\_center hoặc other.

\- capacity: số nguyên không âm; chấp nhận 0.

\- status: active hoặc inactive.

\- capacityNote, description, contactPhone: có thể bỏ qua,

&#x20; null hoặc chuỗi. Chuỗi được trim; chuỗi rỗng lưu null.

\- contactPhone hiện chỉ kiểm tra kiểu chuỗi/null,

&#x20; chưa chuẩn hóa hoặc kiểm tra định dạng số điện thoại.

\- Không gửi id, timestamps, actor hoặc services.

\- Trường không được hỗ trợ sẽ bị từ chối.



Thành công: HTTP 201.



Đọc địa điểm tại response.data.safeLocation.



## Danh sách và chi tiết



GET /api/admin/safe-locations



Thành công: HTTP 200.

Đọc response.data.safeLocations là mảng.

Admin nhận cả địa điểm active và inactive.

Không có dữ liệu trả mảng rỗng.



GET /api/admin/safe-locations/:locationId



Thành công: HTTP 200.

Đọc response.data.safeLocation.



Các trường trả về:



id, name, address, location, type, capacity, capacityNote,

description, contactPhone, status, createdAt, updatedAt.



Timestamps trả dạng ISO 8601 UTC.

Giao diện chuyển sang giờ địa phương khi hiển thị.



API Admin này không trả hoặc quản lý services.

Các dịch vụ thuộc collection safe\_location\_services

được giữ theo luồng hiện có.



## Cập nhật một phần



PATCH /api/admin/safe-locations/:locationId



```json

{

&#x20; "capacity": 20,

&#x20; "capacityNote": "TEST ONLY - updated simulated capacity"

}

```



Chỉ gửi các trường cần sửa; body phải là object không rỗng.

Các trường hợp lệ giống POST.



Backend ghép body với dữ liệu hiện có để validate kết quả.

Khi sửa location phải gửi đủ latitude và longitude.

location được thay theo cả cặp tọa độ.



Thành công: HTTP 200.

Đọc response.data.safeLocation.



createdAt và các trường lưu trữ không liên quan được giữ nguyên.

updatedAt thay đổi khi dữ liệu thực sự thay đổi.



PATCH không tạo mới nếu ID chưa tồn tại.



## Activate và deactivate



Activate:



```json

{

&#x20; "status": "active"

}

```



Deactivate:



```json

{

&#x20; "status": "inactive"

}

```



Gửi bằng PATCH đến endpoint của địa điểm.



Deactivate giữ document và các dịch vụ liên quan.

Không có endpoint xóa trong task này.



API /api/safe-locations/nearby chỉ trả địa điểm active

thỏa điều kiện tọa độ, bán kính và loại.



API public GET /api/safe-locations hiện trả cả active/inactive.

Nếu dùng endpoint đó để gợi ý địa điểm đang hoạt động,

client cần lọc status = active.



## Cập nhật không thay đổi dữ liệu



Nếu giá trị sau chuẩn hóa giống dữ liệu hiện có:



\- Vẫn trả HTTP 200.

\- Không thay đổi updatedAt.

\- Không thêm audit log.



Client không dùng message thành công để suy luận rằng

backend luôn tạo một lần ghi mới.



## Audit



Tạo thành công: safe\_location.create.

Cập nhật thực sự: safe\_location.update.

Activate/deactivate ghi update với changedFields = \["status"].



Target type: safe\_location.

Actor role: admin.



Metadata:



```json

{

&#x20; "source": "api",

&#x20; "outcome": "success",

&#x20; "changedFields": \["capacity", "capacityNote"]

}

```



Chỉ ghi tên trường, không ghi giá trị cũ/mới hay thông tin liên hệ.



Audit được gọi sau khi transaction nghiệp vụ commit.

Audit dùng cơ chế best effort của audit-logging.service.

Lỗi ghi audit không hoàn tác thay đổi nghiệp vụ thành công.



Request bị từ chối hoặc transaction thất bại

không ghi success audit.



## Mã lỗi



| HTTP | Ý nghĩa |

| --- | --- |

| 400 | Body/query/ID hoặc dữ liệu không hợp lệ |

| 401 | Thiếu hoặc sai JWT, JWT hết hạn, tài khoản không còn tồn tại |

| 403 | Không có quyền Admin hoặc tài khoản inactive |

| 404 | Địa điểm không tồn tại |

| 500 | Lỗi hệ thống |



Response lỗi:



```json

{

&#x20; "success": false,

&#x20; "message": "Safe location not found"

}

```



## Hướng dẫn nối giao diện



\- Dùng token từ phiên đăng nhập hiện có.

\- Danh sách đọc response.data.safeLocations.

\- Chi tiết/POST/PATCH đọc response.data.safeLocation.

\- Khóa nút trong khi thao tác đang chạy.

\- Chỉ báo thành công sau response thành công.

\- Sau deactivate, tải lại dữ liệu hiển thị.

\- Với timeout khi ghi, đọc lại dữ liệu trước khi gửi lại.

\- Không tự retry POST vì request trước có thể đã tạo document.

\- Lỗi 401 yêu cầu đăng nhập lại.

\- Hiển thị response.message khi thao tác thất bại.



## Kiểm thử đã thực hiện



### Test tự động



tests/admin-safe-location-management.test.js đã PASS.



Kiểm tra JWT, role, trạng thái tài khoản trong database,

validation, tạo, đọc, cập nhật một phần, deactivate/reactivate,

giữ createdAt và dữ liệu liên quan, no-op, lỗi commit

và trường hợp wrapper audit trả thất bại.



Firestore và audit wrapper được giả lập trong test API.

Audit input được kiểm tra bằng normalizer thật.



Các test hồi quy đã PASS:



\- safe-location.controller.test.js

\- nearby-safe-locations.test.js

\- admin-user-management.test.js

\- admin-flood-area-management.test.js

\- admin-flood-alert-management.test.js

\- audit-log.service.test.js

\- audit-logging.service.test.js



### API local với Firestore thật



Địa điểm test: LQgJjh7ekqRcTdhKdJGr.



Đã xác nhận:



\- Tạo inactive thành công.

\- Danh sách và chi tiết trả đúng địa điểm.

\- PATCH capacity/capacityNote thành công.

\- createdAt được giữ nguyên.

\- Activate làm địa điểm xuất hiện trong nearby.

\- Deactivate loại địa điểm khỏi nearby.

\- Trạng thái cuối: inactive.

\- Có 4 audit log đúng thao tác và actor.

\- PATCH lặp inactive giữ updatedAt, audit vẫn 4 log.



### Chưa kiểm chứng



\- Deploy và kiểm thử CCF-115 trên Render.

\- Transaction cạnh tranh/retry bằng Firestore thật.

\- Luồng đầy đủ qua giao diện Web Admin.
