# Admin User Management API



## Jira Task



CCF-112 - ADMIN-BE-01 Implement Admin User Management API



## Deployment Status



Implemented and tested locally with real Firestore.

Merge and Render deployment verification are pending.



## Base URLs



\- Local: http://localhost:5000

\- Demo: https://floodguard-backend-demo.onrender.com



## Authentication and Authorization



All endpoints require:



```http

Authorization: Bearer <admin-token>

```



The JWT must have role `admin`.



The service also checks the current Firestore account:

\- The account must exist.

\- `isActive` must be `true`.

\- The current role must be `admin`.



A stale admin claim cannot override the current database role.



## Endpoints



| Method | Path | Purpose |

|---|---|---|

| GET | /api/admin/users | List users |

| GET | /api/admin/users/:userId | Get user detail |

| PATCH | /api/admin/users/:userId | Update role or account status |



Replace `:userId` with the actual Firestore user document ID.



## List Users



```http

GET /api/admin/users

```



Successful response: HTTP 200.



```json

{

&#x20; "success": true,

&#x20; "message": "Users retrieved successfully",

&#x20; "data": {

&#x20;   "users": \[

&#x20;     {

&#x20;       "id": "example-user-id",

&#x20;       "fullName": "Example User",

&#x20;       "email": "example@floodguard.local",

&#x20;       "phone": null,

&#x20;       "role": "resident",

&#x20;       "isActive": true,

&#x20;       "createdAt": "2026-10-11T10:00:00.000Z",

&#x20;       "updatedAt": "2026-10-11T10:00:00.000Z"

&#x20;     }

&#x20;   ]

&#x20; }

}

```



The current implementation reads all users and sorts by document ID.

Pagination, search and filtering are not implemented.

Do not assume query parameters provide these features.



## Get User Detail



```http

GET /api/admin/users/:userId

```



Successful response: HTTP 200.



```json

{

&#x20; "success": true,

&#x20; "message": "User retrieved successfully",

&#x20; "data": {

&#x20;   "user": {

&#x20;     "id": "example-user-id",

&#x20;     "fullName": "Example User",

&#x20;     "email": "example@floodguard.local",

&#x20;     "phone": null,

&#x20;     "role": "resident",

&#x20;     "isActive": true,

&#x20;     "createdAt": "2026-10-11T10:00:00.000Z",

&#x20;     "updatedAt": "2026-10-11T10:00:00.000Z"

&#x20;   }

&#x20; }

}

```



A missing user returns HTTP 404.



## Update User



```http

PATCH /api/admin/users/:userId

Content-Type: application/json

```



Change role:



```json

{

&#x20; "role": "rescue"

}

```



Disable account:



```json

{

&#x20; "isActive": false

}

```



Enable account:



```json

{

&#x20; "isActive": true

}

```



Update both fields:



```json

{

&#x20; "role": "resident",

&#x20; "isActive": true

}

```



### Validation



\- Body must be a non-empty JSON object.

\- Only `role` and `isActive` are accepted.

\- Allowed roles: `resident`, `rescue`, `admin`.

\- `isActive` must be a JSON boolean.

\- Unknown fields are rejected with HTTP 400.

\- User IDs must be non-empty valid document IDs.

\- IDs containing `/`, equal to `.` or `..`, or exceeding

&#x20; 1500 UTF-8 bytes are rejected.



Do not send passwords, passwordHash, email, phone, fullName,

timestamps or an actor ID to this endpoint.



### Self-Update Restriction



Admins cannot change their own role or account status.

Such requests return HTTP 403.



This is an implementation rule added to prevent accidental

loss of the acting administrator's access.



### Successful Response



HTTP 200:



```json

{

&#x20; "success": true,

&#x20; "message": "User updated successfully",

&#x20; "data": {

&#x20;   "user": {

&#x20;     "id": "example-user-id",

&#x20;     "fullName": "Example User",

&#x20;     "email": "example@floodguard.local",

&#x20;     "phone": null,

&#x20;     "role": "rescue",

&#x20;     "isActive": true,

&#x20;     "createdAt": "2026-10-11T10:00:00.000Z",

&#x20;     "updatedAt": "2026-10-11T11:00:00.000Z"

&#x20;   }

&#x20; }

}

```



Other stored fields and the original createdAt are preserved.

An actual change updates updatedAt using a server timestamp.



Submitting values identical to the stored values returns

HTTP 200 without changing updatedAt or creating another audit.



## Response Data Protection



List, detail and update responses explicitly select:

\- id

\- fullName

\- email

\- phone

\- role

\- isActive

\- createdAt

\- updatedAt



They do not return passwordHash or other internal fields.



Missing or unsupported timestamp values are serialized as null.

Valid Firestore timestamps are serialized as ISO 8601 UTC.



## Audit Logging



Successful committed changes call the shared audit service

after the user transaction completes.



Example event:



```json

{

&#x20; "actor": {

&#x20;   "id": "acting-admin-id",

&#x20;   "role": "admin"

&#x20; },

&#x20; "action": "user.update",

&#x20; "target": {

&#x20;   "type": "user",

&#x20;   "id": "updated-user-id"

&#x20; },

&#x20; "metadata": {

&#x20;   "source": "api",

&#x20;   "outcome": "success",

&#x20;   "changedFields": \["role"]

&#x20; }

}

```



Firestore adds the audit timestamp.



Audit records contain changed field names, not passwords,

raw request bodies or before/after user values.



Read requests, rejected updates and unchanged updates do not

create audit events.



Audit is best effort:

\- Audit failure does not undo the committed user update.

\- The shared service waits up to 5 seconds.

\- Timeout does not cancel the underlying Firestore write.

\- User update and audit are not one atomic transaction.



## HTTP Errors



| Status | Meaning |

|---|---|

| 400 | Invalid user ID or update body |

| 401 | Missing/invalid/expired token or deleted acting account |

| 403 | Wrong role, inactive acting account or self-update |

| 404 | Target user does not exist |

| 500 | Unexpected server or database failure |



Error responses from the controller use:



```json

{

&#x20; "success": false,

&#x20; "message": "Error description"

}

```



Malformed JSON may be rejected by Express before reaching

the controller. Clients must handle non-JSON error responses.



## Frontend Integration



1\. Use the token from the current Admin login session.

2\. Read the list from response.data.users.

3\. Read detail/update results from response.data.user.

4\. Send only the fields being changed.

5\. Disable the save button while submitting.

6\. Refresh displayed user data after a successful update.

7\. Hide or disable self role/status editing.

8\. Handle 401 by requesting login again and 403 as denied access.



Existing JWTs are not rewritten when a role changes.

The affected user should log in again to obtain a token

with the new role.



This task does not change authorization behavior in unrelated

endpoints. Immediate enforcement of account changes for existing

sessions depends on each endpoint's current database checks.



## Automated Verification



Run from the backend directory:



```powershell

node --check src/services/admin-user.service.js

node --check src/controllers/admin-user.controller.js

node --check src/routes/admin-user.routes.js

node --check src/app.js

node --check tests/admin-user-management.test.js

node tests/admin-user-management.test.js

```



Expected:



```text

Admin user management API tests passed

```



The API test uses an in-memory Firestore mock and checks:

\- Authentication and Admin RBAC on all three endpoints.

\- Current database role and account status checks.

\- Safe response fields.

\- Invalid IDs, missing users and invalid update bodies.

\- Self-update rejection.

\- Role and account status changes.

\- Preservation of unrelated stored fields.

\- Audit after commit and no audit for unchanged updates.

\- Transaction failure without partial changes.

\- Successful business update despite audit failure.



It does not simulate concurrent Firestore transaction retries.



Related checks completed successfully:



```powershell

node tests/user.service.test.js

node tests/auth.middleware.test.js

node tests/rbac.middleware.test.js

node tests/audit-log.service.test.js

node tests/audit-logging.service.test.js

node tests/accept-rescue-request.test.js

node tests/update-rescue-status.test.js

```



The existing user.service.test.js uses real Firestore

and creates a test user.



## Local Integration Verification



Date: 2026-10-11.



Dedicated test user:

\- ID: bHEX8DRkfd7b2aKeuQNR

\- Email: ccf112.cab34df2fff5496aa521a8490bcc26ef@floodguard.local



Verified:

\- Admin login succeeded.

\- User list returned 25 users before creating the dedicated user.

\- List and detail responses did not contain passwordHash.

\- Role changed from resident to rescue.

\- Disabling the test account set isActive to false.

\- Login while disabled returned 403, Account is inactive.

\- Enabling the account restored successful login.

\- Firestore contained exactly 3 user.update audit logs:

&#x20; role change, disable and enable.

\- The test Rescue token was denied access to the Admin list

&#x20; with HTTP 403.



Render verification remains pending.
