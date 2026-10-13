# Admin SOS Monitoring API



## Jira task



CCF-116 — ADMIN-BE-05 Implement Admin SOS Monitoring API.



Cho Admin xem toàn bộ SOS, lọc và xem chi tiết phục vụ monitoring.



## Trạng thái



Đã kiểm thử tự động và API local với Firestore thật.

Chưa deploy hoặc kiểm thử CCF-116 trên Render.



## Quyền truy cập



Mọi request cần:



Authorization: Bearer <token>



Chỉ tài khoản Admin đang hoạt động được sử dụng.

Backend kiểm tra JWT và kiểm tra lại tài khoản trong Firestore:

tồn tại, role = admin, isActive = true.



Thông tin người thực hiện lấy từ token, không nhận qua query.



## Endpoints



| Method | Path | Chức năng |

| --- | --- | --- |

| GET | /api/admin/rescue-requests | Danh sách toàn bộ SOS |

| GET | /api/admin/rescue-requests/:requestId | Chi tiết, assignment và history |



Các endpoint chỉ đọc dữ liệu, không ghi audit thay đổi.



Không có API tạo, tiếp nhận, cập nhật trạng thái hoặc xóa SOS

trong nhóm Admin monitoring.



Các API accept/status hiện có vẫn chỉ dành cho Rescue.



## Danh sách và bộ lọc



GET /api/admin/rescue-requests



Ví dụ:



```text

/api/admin/rescue-requests?status=received

/api/admin/rescue-requests?urgency=high

/api/admin/rescue-requests?status=submitted\&sort=priority

```



Tham số hỗ trợ:



| Query | Giá trị |

| --- | --- |

| status | submitted, received, in\_progress, assisted, cancelled |

| urgency | low, medium, high, critical |

| severity | Tên thay thế cho urgency |

| sort | newest, oldest, priority |



Nếu gửi cả urgency và severity, giá trị sau trim phải khớp nhau.



Giá trị chuỗi rỗng sau trim được coi là không lọc.

sort mặc định là newest.



Tham số không hỗ trợ hoặc giá trị không hợp lệ trả 400.

Không hỗ trợ phân trang hoặc tìm kiếm.



Admin nhận SOS của mọi Resident, bao gồm các trạng thái hoàn tất/hủy.

Không có dữ liệu phù hợp trả HTTP 200 và mảng rỗng.



Thành công: HTTP 200.



Đọc response.data.rescueRequests.



Mỗi SOS có:



id, residentId, location, urgency, numberOfPeople, note,

status, createdAt, updatedAt.



Danh sách không trả assignment hoặc statusHistory.

Dùng endpoint chi tiết để đọc dữ liệu liên quan.



## Thứ tự danh sách



\- newest: thời gian tạo mới nhất trước.

\- oldest: thời gian tạo cũ nhất trước.

\- priority: critical → high → medium → low;

&#x20; cùng mức ưu tiên thì thời gian tạo mới nhất trước.

\- Cùng thời gian tạo thì ID giảm dần làm thứ tự phụ.



UI giữ thứ tự backend trả về khi dùng sort=priority.



## Chi tiết



GET /api/admin/rescue-requests/:requestId



Thay requestId bằng ID thật.



ID được trim và phải hợp lệ:

không rỗng, không chứa "/", không là "." hoặc "..",

tối đa 1500 byte UTF-8.



Endpoint chi tiết không hỗ trợ query parameters.



Thành công: HTTP 200.

Đọc response.data.rescueRequest.



Ngoài các trường SOS, chi tiết có:



### assignment



Object gồm:



id, requestId, rescueStaffId, status, note, assignedAt, updatedAt.



Không có assignment trả null.

Assignment hiện dùng document ID trùng requestId.



Trạng thái assignment có thể là:

assigned, accepted, in\_progress, completed, cancelled.



Không suy luận trạng thái assignment chỉ từ trạng thái SOS.



### statusHistory



Mảng gồm:



id, oldStatus, newStatus, changedBy, note, changedAt.



Không có history trả \[].

History sắp từ cũ đến mới.

Nếu thời gian trùng nhau, sắp theo ID tăng dần.



Dòng khởi tạo có oldStatus = null.

changedBy và rescueStaffId là ID, không phải tên người dùng.



SOS phải tồn tại trước khi backend đọc assignment/history.

SOS không tồn tại trả 404.



## Thời gian và tính nhất quán



Các timestamp trả dạng ISO 8601 UTC.

UI chuyển sang giờ địa phương khi hiển thị.



Đây là API REST, không phải realtime subscription.

UI tải lại khi mở màn hình hoặc khi người dùng làm mới.



SOS, assignment và history được đọc bằng các lời gọi riêng.

Response chi tiết không bảo đảm một snapshot transaction chung

nếu Rescue đang cập nhật đồng thời.



## Mã lỗi



| HTTP | Ý nghĩa |

| --- | --- |

| 400 | Query, bộ lọc hoặc ID không hợp lệ |

| 401 | Thiếu/sai/hết hạn JWT hoặc tài khoản không còn tồn tại |

| 403 | Không phải Admin hiện tại hoặc tài khoản inactive |

| 404 | SOS không tồn tại |

| 500 | Lỗi hệ thống |



Ví dụ:



```json

{

&#x20; "success": false,

&#x20; "message": "Unsupported query parameter: page"

}

```



Đường dẫn hoặc method chưa khai báo không thuộc bộ API này.

Không giả định lỗi route chưa khai báo luôn trả JSON.



## Hướng dẫn Web Admin



\- Dùng token từ AuthContext hiện có.

\- Bảo vệ route Admin trên UI.

\- Hiển thị loading, empty, error và dữ liệu thành công.

\- Dùng ID SOS mở chi tiết.

\- Hiển thị assignment và timeline từ response chi tiết.

\- Không thêm nút tiếp nhận/cập nhật trạng thái dành cho Admin.

\- Lỗi 401 yêu cầu đăng nhập lại.

\- Lỗi 403 thông báo không có quyền.

\- Lỗi 404 tải lại danh sách.

\- Khi thay bộ lọc, tránh response cũ ghi đè dữ liệu mới.



## Kiểm thử



### Test tự động



tests/admin-sos-monitoring.test.js đã PASS.



Kiểm tra:

\- JWT thiếu, sai, hết hạn.

\- Role middleware và role/isActive hiện tại trong Firestore.

\- Admin thấy SOS từ nhiều Resident và mọi trạng thái.

\- Status, urgency, severity alias và các kiểu sort.

\- Query không hỗ trợ, query lặp và giá trị không hợp lệ.

\- Chi tiết assignment và history đúng SOS, đúng thứ tự.

\- Assignment null và history rỗng.

\- SOS không tồn tại không đọc collection liên quan.

\- Lỗi đọc database trả 500.

\- Không có thao tác ghi dữ liệu hoặc audit.



Firestore được giả lập trong test.



Các test hồi quy đã PASS:

\- get-my-sos-requests.test.js

\- rescue-request-filtering.test.js

\- rescue-request-priority.test.js

\- get-sos-detail.test.js

\- rescue-status-history.test.js

\- accept-rescue-request.test.js

\- update-rescue-status.test.js



### API local với Firestore thật



Đã xác nhận:

\- Admin đăng nhập thành công.

\- Danh sách trả 9 SOS tại thời điểm kiểm thử.

\- status=received\&sort=priority trả 2 SOS received.

\- Hai kết quả đều urgency=low, nên chưa kiểm chứng

&#x20; thứ tự giữa các mức ưu tiên khác nhau bằng dữ liệu thật.

\- Chi tiết SOS 665qA4alKedonTMAKaIC:

&#x20; status received, assignment accepted.

\- History theo thứ tự submitted → received.

\- Query page=1 trả 400.

\- ID không tồn tại trả 404.



Không tạo SOS mới hoặc thay đổi trạng thái để test monitoring.



### Chưa kiểm chứng



\- Deploy và API CCF-116 trên Render.

\- Quyền từ chối trên API local bằng tài khoản thật.

\- Snapshot chi tiết khi Rescue cập nhật đồng thời.

\- Luồng đầy đủ qua Web Admin.
