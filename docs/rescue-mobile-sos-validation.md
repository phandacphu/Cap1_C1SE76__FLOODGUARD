# Kiểm chứng SOS Mobile cứu hộ

Nền tích hợp của patch 28 file là `6ad4a28d894b62bf8cc52618d1484b8f99c646f0`.

| Phạm vi | Kết quả |
| --- | --- |
| Patch đã bàn giao | SHA-256 `d0435313fecd5c1bae5f1c795250561a1a09eff5a6eb5e7d333ae41c1b70c44f` |
| Bản tích hợp gốc theo biên bản kiểm thử của Phú | Backend ORS 34/34, Android 186/186, Samsung 5/5 |
| Backend sau review | 36/36 test ORS với provider giả lập. Hai ca mới kiểm tra SOS đổi tọa độ nhẹ và API tính lại quãng đường. |
| Android sau review | Cần build và kiểm tra lại thao tác tính quãng đường khi SOS đổi tọa độ. |

Trên Samsung, năm ca đã ghi nhận gồm sắp xếp gần nhất, tự hiện km ở chi tiết,
GPS/quyền vị trí, đa giác lịch sử, điều hướng/bộ lọc. APK kiểm thử dùng Backend
local cổng 5001 để tính quãng đường. Đăng nhập và API SOS dùng Render. Mã chuẩn
lấy URL từ `AppConfig.BASE_URL`.

## Lệnh kiểm tra

Từ thư mục gốc của repo

```sh
node --test backend/tests/rescue-route-distance.test.js backend/tests/rescue-route-matrix.test.js
node backend/scripts/test-sos-direct-rescue.js
```

Từ thư mục `mobile` trên Windows, dùng JDK, SDK và cấu hình Maps của dự án

```powershell
.\gradlew.bat :app:assembleDebug --no-configuration-cache
.\gradlew.bat :app:testDebugUnitTest --no-configuration-cache --tests "com.example.floodguard.ui.screens.rescue.sos.*"
```

## Kiểm tra tích hợp với Render

Đưa Backend ORS lên trước, cấu hình `ORS_API_KEY` trong môi trường Backend và
xác nhận hai API quãng đường bằng tài khoản Rescue và SOS TEST. Sau đó kiểm
tra bản Mobile dùng URL mặc định, gồm danh sách, chi tiết và quãng đường sau
khi tọa độ SOS thay đổi. Dùng SOS TEST để nghiệm thu xác nhận đã cứu và đối
chiếu lại lịch sử trên hệ thống chung.
