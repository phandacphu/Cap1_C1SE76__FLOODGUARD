# Admin Flood Warning Management API



## Jira Task



CCF-114 - ADMIN-BE-03 Implement Flood Warning Management API



## Scope



Allow active Admin accounts to:



\- List flood warnings.

\- View warning details.

\- Create warnings.

\- Update warning fields and status.



Deletion is not included in this task.



Warnings use the existing flood\_alerts collection and reference flood\_areas through areaId.



## Verification Status



\- Syntax checks passed.

\- Admin flood warning management API tests passed.

\- Related regression tests passed.

\- Local API integration with real Firestore passed.

\- Transaction retry and concurrent operations have not been tested for this feature.

\- Merge and Render deployment verification are pending at the time of writing.



## Base URLs



Local: http://localhost:5000



Demo: https://floodguard-backend-demo.onrender.com



Use the demo Admin endpoints after deployment is confirmed.



## Authentication



All endpoints require:



Authorization: Bearer <token>



POST and PATCH requests require:



Content-Type: application/json



The backend uses JWT authentication and Admin role middleware.



The service also checks the current users document:



\- The user must exist.

\- isActive must be true.

\- role must be admin.



Do not send actor IDs, roles, audit data or timestamps such as createdAt from the client.



## Endpoints



| Method | Path | Purpose | Success |

| --- | --- | --- | --- |

| GET | /api/admin/flood-alerts | List warnings | 200 |

| GET | /api/admin/flood-alerts/:alertId | Warning detail | 200 |

| POST | /api/admin/flood-alerts | Create warning | 201 |

| PATCH | /api/admin/flood-alerts/:alertId | Update fields or status | 200 |



Replace :alertId with a real warning document ID.



## Fields and Validation



| Field | Type | Rules |

| --- | --- | --- |

| title | string | Required, trimmed, non-empty |

| content | string | Required, trimmed, non-empty |

| severity | string | low, medium, high or critical |

| status | string | active or inactive |

| areaId | string | Valid document ID referencing an existing flood area |

| startAt | string | Valid ISO 8601 UTC timestamp ending in Z |

| endAt | string | Valid ISO 8601 UTC timestamp ending in Z |



All seven fields are required when creating a warning.



PATCH accepts one or more of these fields.



Unsupported fields and empty bodies return 400.



Document IDs are trimmed and must be non-empty. They cannot contain "/", be "." or "..", or exceed 1500 UTF-8 bytes.



The referenced flood area may be active or inactive, but it must exist.



## Time Rules



Client timestamp examples:



2026-10-12T08:00:00Z

2026-10-12T08:00:00.000Z



Supported format:



YYYY-MM-DDTHH:mm:ss\[.SSS]Z



Fractional seconds are optional and may contain one to three digits.



Date-only strings, local timestamps without Z, timezone-offset strings, invalid calendar dates and numeric timestamps are rejected.



startAt must be strictly earlier than endAt.



Future and past intervals are allowed.



PATCH validates the complete resulting interval. Changing only startAt or endAt must still produce a valid interval.



For browser date/time inputs, convert the selected time to UTC with Date.toISOString() before sending.



## Response Fields



Admin responses expose only:



\- id

\- title

\- content

\- severity

\- status

\- areaId

\- startAt

\- endAt

\- createdAt

\- updatedAt



Firestore timestamps are serialized as ISO 8601 UTC strings.



Missing stored timestamps are returned as null.



Unrelated internal fields are not exposed.



## List Warnings



GET /api/admin/flood-alerts



Read the array from:



response.data.floodAlerts



Success message:



Flood warnings retrieved successfully



An empty collection returns 200 with \[].



Warnings are sorted by startAt descending, then by document ID for equal times.



The Admin list currently does not support query parameters, filtering, searching or pagination. Query parameters return 400.



## Warning Detail



GET /api/admin/flood-alerts/:alertId



Read the object from:



response.data.floodAlert



Success message:



Flood warning retrieved successfully



A missing warning returns 404.



## Create Warning



POST /api/admin/flood-alerts



Example body:



{

&#x20; "title": "TEST ONLY - simulated warning",

&#x20; "content": "API testing only - NOT a real flood warning",

&#x20; "severity": "low",

&#x20; "status": "inactive",

&#x20; "areaId": "<existing-flood-area-id>",

&#x20; "startAt": "2026-10-12T08:00:00.000Z",

&#x20; "endAt": "2026-10-12T10:00:00.000Z"

}



Replace areaId with an existing flood area ID.



Success: HTTP 201



{

&#x20; "success": true,

&#x20; "message": "Flood warning created successfully",

&#x20; "data": {

&#x20;   "floodAlert": {

&#x20;     "id": "<generated-warning-id>",

&#x20;     "title": "TEST ONLY - simulated warning",

&#x20;     "content": "API testing only - NOT a real flood warning",

&#x20;     "severity": "low",

&#x20;     "status": "inactive",

&#x20;     "areaId": "<existing-flood-area-id>",

&#x20;     "startAt": "2026-10-12T08:00:00.000Z",

&#x20;     "endAt": "2026-10-12T10:00:00.000Z",

&#x20;     "createdAt": "<server-generated-ISO-timestamp>",

&#x20;     "updatedAt": "<server-generated-ISO-timestamp>"

&#x20;   }

&#x20; }

}



The backend generates the ID and timestamps.



The Admin account check, referenced area read and warning creation occur in one transaction.



## Update Warning



PATCH /api/admin/flood-alerts/:alertId



Example:



{

&#x20; "severity": "medium",

&#x20; "content": "TEST ONLY - updated simulated warning"

}



Change status:



{

&#x20; "status": "inactive"

}



Move the warning interval:



{

&#x20; "startAt": "2026-10-13T08:00:00.000Z",

&#x20; "endAt": "2026-10-13T10:00:00.000Z"

}



Success: HTTP 200



Success message:



Flood warning updated successfully



Read the updated object from:



response.data.floodAlert



Rules:



\- Omitted fields retain their existing values.

\- The complete resulting warning must pass validation.

\- The resulting areaId must reference an existing area.

\- createdAt and unrelated stored fields are preserved.

\- updatedAt changes only when normalized values change.

\- An update with identical normalized values returns 200 without changing timestamps or creating another audit event.

\- A missing warning returns 404.

\- A missing referenced area returns 404.



The Admin check, warning read, referenced area read and update occur in one transaction.



## Status Meaning



active and inactive represent the stored warning status.



The existing public active-warning endpoint additionally checks that the current time falls between startAt and endAt.



Therefore, a warning marked active may still be scheduled for the future or already expired.



Do not assume status active alone means a warning is currently being displayed by the active-warning endpoint.



## Audit Logging



| Operation | Action | Target type |

| --- | --- | --- |

| Create | flood\_alert.create | flood\_alert |

| Update, including status | flood\_alert.update | flood\_alert |



Audit actor is the authenticated Admin.



target.id is the warning ID.



Metadata contains:



\- source: api

\- outcome: success

\- changedFields: changed field names only



Create records all seven supported fields.



Update records only fields whose normalized values changed.



Read operations, rejected requests and no-op updates do not create audit events through these endpoints.



Old and new field values are not stored in audit metadata.



Logging runs after the business transaction commits through the shared best-effort service.



Audit failures do not roll back successful warning changes. The warning write and audit write are not one atomic transaction.



## Errors



Error response format:



{

&#x20; "success": false,

&#x20; "message": "Error description"

}



| HTTP | Meaning |

| --- | --- |

| 400 | Invalid body, document ID, timestamp, interval or unsupported query |

| 401 | Missing/invalid authentication or authenticated user no longer exists |

| 403 | Account inactive or current user role is not admin |

| 404 | Warning or referenced flood area does not exist |

| 500 | Unexpected server/database error |



Example reference error:



{

&#x20; "success": false,

&#x20; "message": "Referenced flood area does not exist"

}



## Public API Compatibility



Existing public endpoints remain available:



GET /api/flood-alerts

GET /api/flood-alerts/active



The existing public list supports areaId, severity and status filters.



These public endpoints are separate from the new authenticated Admin endpoints.



This task does not implement push notifications.



## Frontend Integration



Use the existing login token and API client.



List screen:



\- Call GET /api/admin/flood-alerts.

\- Read data.floodAlerts.

\- Handle loading, empty and error states.



Create screen:



\- Select an existing flood area.

\- Supply all seven required fields.

\- Convert dates to UTC ISO strings.

\- Submit POST.

\- Show success only after receiving HTTP 201.



Edit screen:



\- Load warning detail.

\- Submit selected changes through PATCH.

\- Replace displayed data with data.floodAlert from the response.



Status control:



\- Send PATCH with status active or inactive.

\- Update the UI after a successful response.



Disable submit controls while requests are in progress.



For 400 or 404, display the response message and allow correction.



For 401, require login again. For 403, explain that access is forbidden.



Do not automatically retry POST after a timeout; the first request may already have been saved.



## Automated Checks



Run from the backend directory:



node --check src/services/admin-flood-alert.service.js

node --check src/services/audit-log.service.js

node --check src/controllers/admin-flood-alert.controller.js

node --check src/routes/admin-flood-alert.routes.js

node --check src/app.js

node --check tests/admin-flood-alert-management.test.js



node tests/admin-flood-alert-management.test.js

node tests/active-flood-alerts.test.js

node tests/flood-alert-filtering.test.js

node tests/admin-flood-area-management.test.js

node tests/admin-user-management.test.js

node tests/audit-log.service.test.js

node tests/audit-logging.service.test.js



git diff --check



All listed checks passed.



The new API test uses Firestore mocks. It covers authorization, input validation, reference checks, create/read/update, timestamp preservation, no-op updates, status changes, commit failures and audit failures.



It does not simulate transaction retry or concurrent operations.



## Local Firestore Integration Evidence



Test area:



TLpdPrxHD6D1pVECasus



Test warning:



5pLzgc5a2547ay5XT3q5



Results:



\- Admin login succeeded.

\- Created an inactive test area.

\- Created an inactive warning linked to that area.

\- List and detail returned the warning.

\- Updated content and severity to medium.

\- Original createdAt was preserved:

&#x20; 2026-10-11T15:30:09.215Z

\- Invalid interval returned 400.

\- Missing referenced area returned 404.

\- Changed status inactive -> active -> inactive.

\- Exactly four audit events were found:

&#x20; - flood\_alert.create

&#x20; - flood\_alert.update: content and severity

&#x20; - flood\_alert.update: status

&#x20; - flood\_alert.update: status

\- Repeated identical PATCH and rejected requests did not add audit events.



The test warning and area remain stored as inactive.



Warning deletion is not provided by this API. The referenced test area cannot be deleted through the area API while the warning still references it.



## Remaining Verification



After merge and Render deployment:



\- Confirm the deployed commit.

\- Verify Admin list and detail.

\- Verify create, update and status changes using TEST ONLY data.

\- Verify invalid intervals and missing area references.

\- Verify timestamps and audit events.

\- Leave test warnings inactive.



Transaction retry and concurrent operations remain unverified for this feature.



## Files



backend/src/app.js

backend/src/services/audit-log.service.js

backend/src/services/admin-flood-alert.service.js

backend/src/controllers/admin-flood-alert.controller.js

backend/src/routes/admin-flood-alert.routes.js

backend/tests/admin-flood-alert-management.test.js

docs/admin-flood-warning-management-api.md
