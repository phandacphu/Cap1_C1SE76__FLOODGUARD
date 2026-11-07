# Admin Web – Theo dõi và thống kê SOS

## Phạm vi bàn giao

- Jira: **CCF-122** (màn theo dõi SOS), **CCF-127** (tích hợp API theo dõi SOS).
- Branch: `feature/CCF-122-127-admin-sos-monitoring`.
- Nền: `develop` tại `12f20f14dd77b72d9ee67ea6843111c584909e02`.
- CCF-122: đã triển khai giao diện danh sách, ba thẻ thống kê và chi tiết chỉ đọc.
- CCF-127: đã nối các endpoint hiện có để đọc thông tin tương thích; **chưa nghiệm thu hợp đồng SOS mới hoặc luồng có đăng nhập với API thật**.
- Giữ layout, token màu và component Admin hiện có. Figma `18:9440` được dùng làm tham khảo bố cục; nghiệp vụ mới trong yêu cầu của Phú được ưu tiên hơn các trạng thái trung gian, heatmap, phân công và xuất CSV còn có trong bản thiết kế.
- Không có thay đổi Backend, Resident Mobile, Rescue Mobile, Rescue Web, phân quyền dùng chung, cấu hình hay khóa trong commit.

## Giao diện và hành vi

### Danh sách `/admin/sos`

- Các cột: mã SOS, người gửi, liên hệ, thời gian gửi, tình huống, số người, mức nước, tình trạng, xem chi tiết.
- Ba thẻ: tổng SOS, còn hoạt động/chờ cứu, đã cứu. Số liệu API lấy từ endpoint summary, không tính từ số dòng đang hiển thị.
- Chế độ API hiện tại chỉ bật sắp xếp `newest`/`oldest`. Tình trạng mới, khoảng ngày, tìm kiếm được thiết kế sẵn nhưng khóa kèm giải thích khi hợp đồng chưa hỗ trợ.
- Chế độ mẫu áp dụng mọi tiêu chí lên toàn bộ tập mẫu, rồi tính cả ba số liệu từ cùng tập đã lọc. Khoảng ngày theo UTC+7, bao gồm cả ngày kết thúc.
- Dữ liệu mẫu được tạo một lần trong phiên trang. Chuyển danh sách/chi tiết hoặc bấm Làm mới không tự thay giờ gửi, giờ GPS hay giờ hoàn tất. Tải lại toàn bộ trang khởi tạo phiên mẫu mới.
- Không thêm phân trang giả hoặc lọc cục bộ một trang dữ liệu API.
- Đang tải, không có SOS, không có kết quả lọc, lỗi/Thử lại, 401 và 403 được xử lý riêng.
- Đổi bộ lọc nhanh không cho phản hồi cũ ghi đè phản hồi mới.

### Chi tiết `/admin/sos/:id`

- Thông tin SOS, khai báo, bản đồ chỉ đọc, tọa độ, thời điểm cập nhật vị trí, kết quả và lịch sử gửi/xác nhận đã cứu.
- Chế độ mẫu minh họa cả chờ cứu và đã cứu; SOS đã cứu vẫn giữ tọa độ.
- Chế độ API không tự ánh xạ `submitted/received/in_progress/assisted/cancelled` sang tình trạng mới.
- Không dùng `updatedAt` của SOS làm thời điểm GPS hoặc thời gian hoàn tất. Chưa có trường thì ghi rõ chưa được cung cấp.
- Làm mới gọi lại API chi tiết. Lỗi mạng khi làm mới giữ thông tin/vị trí lần tải thành công và đánh dấu dữ liệu cũ. 401/403/404 ẩn dữ liệu đã lưu trong màn hình.
- Tọa độ sai không làm mất SOS; màn hình giải thích không thể hiển thị vị trí. Lỗi nền bản đồ có thông báo và nút thử lại riêng, vẫn giữ tọa độ/ghim.
- Không tự ghi online, GPS trực tiếp, mất kết nối thiết bị hoặc tự xóa SOS vì GPS cũ.
- Không có thao tác tiếp nhận, phân công, sửa/xóa/hủy SOS hoặc xác nhận đã cứu.

### Dashboard

- Chỉ sửa phần SOS: sử dụng summary, bỏ nhánh thay lỗi SOS bằng `MOCK_SERIES`/`MOCK_STATUS_COUNTS`, hiển thị lỗi và Thử lại.
- Thay các biểu đồ SOS của luồng cũ bằng phần tổng hợp đúng phạm vi mới. Phần cảnh báo lũ, vùng, người dùng, audit và hạ tầng giữ hành vi cũ; không coi các phần ngoài phạm vi là đã được sửa hoặc nghiệm thu.
- Mock SOS trên dashboard cũng phải bật rõ trong môi trường phát triển.

## Endpoint được dùng

Tất cả lời gọi SOS là **GET**, dùng token từ AuthContext và API URL hiện có.

| Endpoint | Phần đã nối | Giới hạn hiện tại |
| --- | --- | --- |
| `/api/admin/rescue-requests?sort=newest` hoặc `oldest` | Danh sách, mã, residentId, số người, ghi chú, tọa độ, thời gian | Chưa lọc tình trạng mới/ngày/tìm kiếm/phân trang |
| `/api/admin/rescue-requests/:requestId` | Chi tiết với dữ liệu tương thích | Không diễn giải assignment/statusHistory của luồng cũ thành xác nhận đã cứu |
| `/api/admin/rescue-requests/summary` | Tổng SOS, cùng phạm vi toàn bộ với danh sách API hiện tại | Không cộng/ánh xạ các nhóm trạng thái cũ thành chờ cứu/đã cứu |

Phản hồi sai cấu trúc tạo lỗi rõ ràng, không trở thành mảng rỗng hoặc số 0. Thiếu tên/liên hệ không tạo tên, số điện thoại hay địa chỉ giả; nếu có residentId thì chỉ hiển thị rõ đó là ID.

## Phần cần Phú chốt/cập nhật Backend

Không tự đặt thêm endpoint hoặc mã trạng thái kỹ thuật. Các tên trong phần dữ liệu mẫu là nhãn/model nội bộ của UI, **không phải đề xuất hợp đồng HTTP**.

| Nội dung | Cần cung cấp để tích hợp thật |
| --- | --- |
| Tình trạng SOS | Mã trạng thái chính thức cho hai tình trạng nghiệp vụ và quy tắc xử lý dữ liệu cũ, gồm cả ca đã hủy |
| `situations`, `waterLevel` | Cấu trúc response, kiểu dữ liệu, đơn vị và danh mục/nhãn hợp lệ theo form mới |
| Người gửi/liên hệ | Trường tên, liên hệ hoặc quy tắc tra cứu được phép; API hiện tại chỉ có residentId |
| GPS | Trường vị trí cuối và timestamp riêng của vị trí; xác nhận thời điểm timestamp thay đổi và dữ liệu vẫn giữ sau hoàn tất |
| Xác nhận đã cứu | Người xác nhận, thời gian hoàn tất và lịch sử tương ứng theo luồng mới |
| Bộ lọc danh sách | `from/to`, tìm kiếm mã/tên/điện thoại, tình trạng mới; chốt tên query, biên thời gian và timezone |
| Phân trang | Nếu bổ sung: query, cursor/page, tổng theo bộ lọc và thông tin còn trang; UI hiện chưa giả lập phân trang API |
| Summary | Ba số liệu cùng phạm vi và tiêu chí lọc với danh sách, không dùng số dòng của một trang |
| Dữ liệu test | Bộ SOS chờ cứu/đã cứu/trống/GPS cũ và quyền truy cập qua kênh riêng, do Phú chuẩn bị qua API test |

## File tạo/sửa

| File | Phạm vi |
| --- | --- |
| `web/src/App.tsx` | Chỉ thêm import và hai route Admin SOS, trong nhóm quyền ADMIN hiện có |
| `web/src/components/layout/navConfig.ts` | Chỉ gắn đường dẫn cho menu Theo dõi SOS của Admin |
| `web/src/pages/admin/AdminDashboard.tsx` | Chỉ phần số liệu/biểu đồ SOS và lỗi liên quan |
| `web/src/pages/admin/adminApi.ts` | Chỉ thay lời gọi dữ liệu SOS của dashboard bằng summary |
| `web/src/pages/admin/sos/sosTypes.ts` | Model nội bộ của UI |
| `web/src/pages/admin/sos/sosContract.ts` | Kiểm tra/adapt hợp đồng API hiện có, không ánh xạ trạng thái cũ |
| `web/src/pages/admin/sos/sosApi.ts` | Các lời gọi GET và lựa chọn nguồn mẫu có điều kiện |
| `web/src/pages/admin/sos/sosMock.ts` | Dữ liệu tổng hợp nhân tạo và lọc trên toàn bộ tập mẫu |
| `web/src/pages/admin/sos/useSosResource.ts` | Tải, làm mới, giữ dữ liệu cũ có đánh dấu, chống phản hồi lỗi thời |
| `web/src/pages/admin/sos/sosFormat.ts` | Hiển thị giờ Việt Nam và số liệu chưa có |
| `web/src/pages/admin/sos/SosFrame.tsx` | Tái sử dụng khung Admin |
| `web/src/pages/admin/sos/SosFeedback.tsx` | Nhãn nguồn, tình trạng và lỗi/quyền truy cập |
| `web/src/pages/admin/sos/SosSummaryCards.tsx` | Ba thẻ thống kê |
| `web/src/pages/admin/sos/SosMonitoringScreen.tsx` | Danh sách và bộ lọc |
| `web/src/pages/admin/sos/SosDetailScreen.tsx` | Chi tiết chỉ đọc |
| `web/src/pages/admin/sos/SosLocationMap.tsx` | Bản đồ tọa độ cuối, không lấy/gửi GPS |
| `web/src/pages/admin/sos/SosDashboardPanel.tsx` | Tổng hợp SOS trong dashboard |
| `web/scripts/test-admin-sos.mjs` | Kiểm tra hợp đồng, logic lọc, số liệu, lỗi HTTP |
| `web/scripts/test-admin-sos-browser.mjs` | Kiểm tra trình duyệt bằng phản hồi HTTP giả lập và dữ liệu mẫu |
| `docs/admin-sos-web-ccf122-127.md` | Tài liệu bàn giao này |
| `docs/evidence/admin-sos/*` | Ảnh và kết quả kiểm tra trình duyệt; mọi danh tính trong ảnh đều là fixture nhân tạo |

Hai file dùng chung App/nav nằm trong phạm vi Phú đã ghi nhận. Không sửa HTTP helper, AuthContext, kiểu dữ liệu dùng chung của Rescue hoặc CSS toàn cục.

## Chạy trên Windows

Trong thư mục `web`, tạo hoặc chỉnh `.env.local` ngoài Git:

```dotenv
VITE_API_URL=http://localhost:5000/api
VITE_ADMIN_SOS_MOCK=true
```

`VITE_API_URL` phải trỏ đến backend nhóm thống nhất khi kiểm thử API thật. Bật mock chỉ cho thử UI, vẫn đi qua đăng nhập và quyền Admin hiện có; không có tài khoản hoặc cơ chế bỏ qua đăng nhập được thêm vào sản phẩm.

```powershell
cd C:\Huy-4042\Cap1_C1SE76__FLOODGUARD\web
npm ci
npm run dev
```

Đăng nhập Admin, mở menu **Theo dõi SOS**. Để dùng API thật, đặt `VITE_ADMIN_SOS_MOCK=false` hoặc bỏ biến đó rồi khởi động lại Vite. Bản production bỏ mock kể cả khi biến này bị đặt là `true` lúc build.

## Kiểm chứng

### Tự động và giao diện

- Lint: **PASS**.
- TypeScript và production build: **PASS**; Vite còn cảnh báo bundle JS lớn hơn 500 kB, không làm build thất bại.
- Node tests: **48/48 PASS**, gồm 17 kiểm tra SOS và 31 kiểm tra hồi quy vùng/bản đồ hiện có.
- Browser QA: **14/14 nhóm PASS**; dữ liệu mẫu hoặc HTTP fixture, không dùng dữ liệu đăng nhập thật.
- Trong bộ ảnh QA chuẩn, nền OpenStreetMap không tải được từ trình duyệt của môi trường này; thông báo lỗi nền, ghim và tọa độ vẫn được kiểm tra. Cần xác nhận tải đủ nền bản đồ trên máy chạy thật; không coi ảnh nền xám là bằng chứng bản đồ nền đã hoạt động.
- Ảnh Huy cung cấp ngày 07/11/2026 đã cho thấy trên máy Windows: lint/build đạt; bộ lọc Đã cứu khớp ba số liệu 1/0/1; chi tiết DEMO-SOS-002 hiển thị nền bản đồ, tọa độ, thời điểm GPS, người xác nhận, giờ hoàn tất và lịch sử. Đây vẫn là kiểm tra bằng dữ liệu mẫu, chưa phải tích hợp API thật. Qua đối chiếu giờ gửi giữa hai ảnh, đã sửa việc nguồn mẫu tự tạo lại timestamp khi đổi màn hình và bổ sung kiểm tra hồi quy.
- Production đã được build với biến mock đặt `true` để kiểm tra: vẫn sử dụng API, không hiển thị fixture mẫu; bundle không chứa các mã/danh tính mẫu.

Các lệnh chuẩn:

```text
cd web
npm run lint
npm run build
node --test scripts/test-admin-sos.mjs scripts/test-flood-area-types.mjs scripts/test-pr114-geojson.mjs scripts/test-pr114-ui.mjs
```

Browser QA cần Playwright/Chromium cài riêng. Script không thêm dependency hoặc thay lockfile của dự án. Có thể dùng `PLAYWRIGHT_MODULE` và `CHROMIUM_EXECUTABLE_PATH` để chỉ đến bộ cài có sẵn. Script tự chạy hai Vite dev server và một production preview trong lúc kiểm thử. Trước đó build với `VITE_API_URL=http://127.0.0.1:5999/api` và `VITE_ADMIN_SOS_MOCK=true`; URL này chỉ dành cho HTTP fixture trong QA, không dùng làm cấu hình chạy thật. Browser fixture bỏ qua lỗi chứng chỉ HTTPS do CA riêng của proxy container để chụp nền bản đồ công khai; sản phẩm không có thay đổi về TLS/chứng chỉ.

```text
node scripts/test-admin-sos-browser.mjs
```

Kết quả chính xác của browser được lưu tại [browser-results.json](evidence/admin-sos/browser-results.json). Bao gồm dữ liệu mẫu, API giả lập lỗi/thành công, không dữ liệu, summary lỗi riêng, 401/403/404, đổi bộ lọc nhanh, giữ tọa độ khi làm mới lỗi, lỗi nền bản đồ, phân quyền Admin, viewport nhỏ và production không bật mock.

### API thật: chỉ smoke check không đăng nhập

Ngày 07/11/2026:

- `GET https://floodguard-backend-demo.onrender.com/api/health`: **200**, `success: true`.
- `GET https://floodguard-backend-demo.onrender.com/api/admin/rescue-requests` không có token: **401**, `Authentication token is required`.
- Không gửi thông tin đăng nhập, không tạo/sửa dữ liệu thật trong lượt kiểm tra này.
- **Chưa kiểm thử** danh sách/summary/chi tiết với Admin thật, trạng thái mới, cập nhật GPS và xác nhận đã cứu trên Backend mới.
- Ảnh mang nhãn API trong bộ browser evidence sử dụng **HTTP fixture**, không phải bằng chứng dữ liệu thật hoặc nghiệm thu tích hợp.

### Ảnh giao diện

- [Danh sách và thống kê mẫu](evidence/admin-sos/01-mock-list.png)
- [Bộ lọc đã cứu và thống kê cùng phạm vi](evidence/admin-sos/02-mock-filter.png)
- [Chi tiết đã cứu](evidence/admin-sos/03-mock-rescued-detail.png)
- [Không có kết quả lọc](evidence/admin-sos/04-mock-no-matches.png)
- [API hiện tại và các trường chờ hợp đồng mới – HTTP fixture](evidence/admin-sos/05-api-contract-pending.png)
- [Lỗi làm mới và giữ vị trí – HTTP fixture](evidence/admin-sos/06-api-refresh-error-keeps-location.png)
- [Lỗi tải – HTTP fixture](evidence/admin-sos/07-api-load-error.png)
- [Không có SOS – HTTP fixture](evidence/admin-sos/08-api-empty.png)
- [Danh sách màn hình nhỏ](evidence/admin-sos/09-mobile-list.png)
- [Chi tiết màn hình nhỏ](evidence/admin-sos/10-mobile-detail.png)
- [Dashboard lỗi SOS không thay bằng số liệu mẫu – HTTP fixture](evidence/admin-sos/11-dashboard-sos-error.png)

## Tú kiểm thử và điều kiện nghiệm thu

1. Chạy nhánh này với tài khoản Admin và cấu hình API do nhóm cấp ngoài Git.
2. Dùng mock để kiểm tra UI trước; luôn kiểm tra nhãn nguồn mẫu.
3. Khi Phú chốt hợp đồng mới, cập nhật adapter Admin theo đúng response/query đã thống nhất rồi kiểm thử lại với API thật.
4. Kiểm tra ba số liệu và danh sách cùng phạm vi; kiểm tra chi tiết và tọa độ thay đổi sau làm mới, SOS đã cứu còn trong lịch sử.
5. Kiểm tra 401/403/404, mất kết nối, dữ liệu trống, không khớp bộ lọc và không có thao tác ghi SOS từ Admin.

Khi mở PR, giữ trạng thái **draft**, chờ Backend mới và kiểm thử tích hợp có đăng nhập. Chưa kết luận toàn hệ thống PASS; Phú quyết định review/merge.
