# PR #134 – Admin Safe Location review fixes

Scope: **Web Admin only**, branch `feature/admin-safe-location-ui-mock`. No Backend, Rescue Web, Mobile, Firebase writes, deployment or merge in this change. All browser fixture tests use synthetic token and intercepted HTTP; they do **not** use the Render account.

## Changes

1. **Detail selection**: reselecting the same ID preserves an already loaded detail; failed GET transitions from loading to an explicit error with **Thử lại chi tiết**. Changing the selected ID invalidates prior detail requests. GET 404 removes that ID and reloads the list.
2. **Authorization loss**: any 401/403 from list, detail, create, edit, delete, or a read-back verification locks the screen synchronously, hides table and markers, closes editor/confirmation, and disables creating further records. Previously launched success responses cannot restore data. 401 directs the user to login; 403 leaves admin actions blocked. This is UI handling; it is **not proof of Backend RBAC behavior**.
3. **Unconfirmed write**: network error, timeout, 5xx, malformed/unconfirmed success after a POST/PATCH/DELETE is treated as a possibly completed write, not a safe retry. POST reads the list and compares **new ID not in prior list plus all submitted fields**, never just a matching name; PATCH/DELETE read the **same ID**, then refresh the list. Further writes remain locked until a successful read-back and explicit user acknowledgement. No write is replayed automatically; read-back does not constitute a success response to the original write. When read-back fails, the block remains in place.
4. **404 on edit/delete**: the missing ID is removed from locally displayed rows/markers, the editor/confirmation is closed and the list is refreshed. A refresh failure shows **Chưa thể cập nhật** while retaining remaining prior data. Never claims a successful delete without an API confirmation.
5. **Race protection**: epoch/ref guards reject late list/detail responses after access denial or confirmed missing IDs. Missing IDs are not revived by stale list responses.

## Verification – evidence and limitations

- Author-side **component interaction harness**: `node --test tests/safeLocationInteractionReview.test.mjs` (14/14 PASS in isolated environment, Nov 13 2026). This mounts the actual TSX event handlers using a deterministic hook runner and simulated `SafeLocationSource`. Does not measure Leaflet visual rendering or browser networking.
- **Real browser HTTP-fixture QA**: `node scripts/test-safe-location-review-browser.mjs` after Playwright installation; takes screenshots and saves JSON under `docs/evidence/admin-safe-location/pr134-review/`. **Not yet executed on the user's Windows checkout**. It spins up a Vite server on 5178 with `VITE_API_URL=http://127.0.0.1:5999/api` and intercepts HTTP; does **not** contact Render.
- **ESLint, production build, existing 16 UI/API tests and Dashboard/Flood Map regression**: require running again on the user's checkout after applying this patch. Previous PASS results on SHA `94692ff` do not establish that this patch passes.
- **Render evidence**: earlier DELETE HTTP 200, list refresh and GET detail HTTP 404 were observed for a test location before this review patch. Screenshots of actual POST 201 and PATCH 200 with the **same TEST ID**, and fresh post-patch manual CRUD QA, have **not yet been captured**. Do not claim them passed.
- **Map tiles**: intermittent `ERR_CONNECTION_RESET` from `*.tile.openstreetmap.org` was observed; separate from safe-location coordinates/CRUD and still needs environmental verification.

## Run on Windows

```powershell
cd "C:\Huy-4042\Cap1_C1SE76__FLOODGUARD\web"
npm.cmd run lint
npm.cmd run build
node --test tests/safeLocationUi.test.mjs tests/safeLocationApiV2.test.mjs tests/safeLocationInteractionReview.test.mjs
node --test tests/dashboard-map-load-states.test.mjs tests/floodAreaService.test.cjs
node scripts/test-safe-location-review-browser.mjs
```

Playwright is a separate optional installation: `npm.cmd install --no-save --package-lock=false playwright`, then `npx.cmd playwright install chromium` if necessary. If installation cannot be completed, record the browser test as **NOT RUN**, never as PASS.

For actual Render CRUD, login through Web Admin with an authorized account; use only a new location named `TEST ONLY - ...`, record the new ID from POST 201, verify PATCH 200 keeps it, list/detail GET, then DELETE 200 and GET detail 404. Check both the list/map and Dashboard. Never upload JWT, login secrets, Firebase keys, or screenshots of request Authorization headers. Avoid modifying other users' records. Do not force 401/403/500 by changing Backend data; use HTTP fixtures for negative scenarios.

---

## Kết quả kiểm thử bổ sung - 13/11/2026

### 1. Kiểm thử tự động

- ESLint: PASS.
- Production Build: PASS.
- Unit/API/component interaction tests: 30/30 PASS.
- Regression Dashboard/Flood Map: 8 PASS, 1 SKIP.
- Browser QA với HTTP fixtures: 10/10 PASS.

Các bài kiểm thử HTTP fixture không phải kết quả gọi Backend Render thật.

### 2. Kiểm thử thực tế trên Backend Render

API: https://floodguard-backend-demo.onrender.com/api

ID bản ghi TEST: xtCHk5ADm2gFaeuFYZ6L

- POST /api/admin/safe-locations: 201 Created - PASS.
- PATCH /api/admin/safe-locations/{id}: 200 OK - PASS.
- GET /api/admin/safe-locations/{id} sau PATCH: 200 OK - PASS.
- GET xác nhận ID giữ nguyên và tên đã cập nhật - PASS.
- DELETE /api/admin/safe-locations/{id}: 200 OK - PASS.
- GET /api/admin/safe-locations/{id} sau DELETE: 404 Not Found - PASS.
- Số địa điểm trong bảng sau DELETE: 2 xuống 1 - PASS.
- Bản ghi Sample Community Shelter 01 vẫn còn trong danh sách.

Chỉ thao tác trên bản ghi do người kiểm thử tạo.
Không chỉnh sửa hoặc xóa bản ghi Sample.

### 3. Giới hạn kiểm thử

- Các trường hợp 401/403, phản hồi đến muộn, mất phản hồi POST,
  PATCH/DELETE 404 được kiểm tra bằng test tương tác và HTTP fixtures.
- Chưa tái hiện toàn bộ các lỗi này với Backend Render thật.
- Hai địa điểm TEST và Sample dùng cùng tọa độ nên ghim có thể chồng nhau.
  Việc xóa đúng một ghim chưa được xác minh trực quan độc lập.
- Lỗi ERR_CONNECTION_RESET khi tải tile OpenStreetMap được ghi nhận riêng,
  không kết luận là lỗi dữ liệu tọa độ hoặc CRUD.
- Regression có 1 bài SKIP do chưa cung cấp LIVE_FLOOD_AREAS.

### 4. Trạng thái bàn giao

Đã sửa bốn nhóm lỗi theo review PR #134.
Đã chạy kiểm thử tự động và bổ sung minh chứng CRUD Render.
Chờ reviewer kiểm tra lại trước khi merge/deploy.
