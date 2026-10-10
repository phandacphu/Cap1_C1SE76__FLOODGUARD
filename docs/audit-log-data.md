# Audit Log Data



## Jira Task



CCF-167 - AUDIT-DB-01 Audit Log Data Firestore



## Purpose



Store audit records for Admin and other important actions.



Collection: `audit\_logs`



Each call creates a new document with a generated ID.

Existing audit records are not overwritten by this helper.



## Stored Fields



| Field | Type | Description |

| --- | --- | --- |

| actor | object | Acting user's ID and role |

| action | string | Action label, for example `user.update` |

| target | object | Target object's type and ID |

| timestamp | Firestore Timestamp | Generated with `FieldValue.serverTimestamp()` |

| metadata | object | Optional information from the supported allowlist |



Example document:



```json

{

&#x20; "actor": {

&#x20;   "id": "admin-1",

&#x20;   "role": "admin"

&#x20; },

&#x20; "action": "user.update",

&#x20; "target": {

&#x20;   "type": "user",

&#x20;   "id": "user-1"

&#x20; },

&#x20; "timestamp": "<Firestore server timestamp>",

&#x20; "metadata": {

&#x20;   "source": "api",

&#x20;   "outcome": "success",

&#x20;   "changedFields": \["role", "isActive"]

&#x20; }

}

```



The timestamp placeholder above represents a Firestore Timestamp,

not a stored string.



## Validation



\- Input, actor, target and metadata must be plain objects.

\- Unsupported fields are rejected.

\- Actor roles: `resident`, `rescue`, `admin`.

\- Actor and target IDs are trimmed and must be valid document IDs.

\- IDs cannot contain `/`, equal `.` or `..`, or exceed 1500 UTF-8 bytes.

\- Action and target type are trimmed.

\- Action and target type must match `^\[a-z]\[a-z0-9\_.-]{0,79}$`.

\- Callers cannot supply `timestamp`.

\- Invalid input throws an error with code `INVALID\_AUDIT\_LOG\_DATA`.

\- Invalid input is rejected before any Firestore write.



## Metadata



Metadata may be omitted or null; it is stored as an empty object.



Supported keys:



| Key | Allowed values |

| --- | --- |

| source | `api`, `system`, `test` |

| outcome | `success`, `failure` |

| changedFields | Array of supported field names |



Supported changedFields:



`fullName`, `role`, `isActive`, `name`, `description`,

`location`, `severity`, `urgency`, `status`, `capacity`.



Duplicate field names are removed.

Only field names are stored, not old or new values.



Extend the allowlist deliberately when a later feature needs it.



## Sensitive Data



Do not pass passwords, password hashes, tokens, authorization headers,

service account credentials, raw request bodies or complete user objects.



The schema rejects unsupported keys at every supported object level.

Metadata accepts only predefined values and field names.



Actor, action and target must be constructed from trusted server-side

context. Never use these string fields to store credentials or free text.



## Internal Helper



File: `backend/src/services/audit-log.service.js`



Exports:



\- `AUDIT\_LOGS\_COLLECTION`

\- `ALLOWED\_ACTOR\_ROLES`

\- `ALLOWED\_CHANGED\_FIELDS`

\- `normalizeAuditLogData`

\- `createAuditLog`



Example internal usage:



```javascript

await createAuditLog({

&#x20; actor: {

&#x20;   id: authenticatedUser.id,

&#x20;   role: authenticatedUser.role,

&#x20; },

&#x20; action: "user.update",

&#x20; target: {

&#x20;   type: "user",

&#x20;   id: updatedUser.id,

&#x20; },

&#x20; metadata: {

&#x20;   source: "api",

&#x20;   outcome: "success",

&#x20;   changedFields: \["role", "isActive"],

&#x20; },

});

```



createAuditLog returns `{ id }` after the write succeeds.



This helper is not an authorization boundary.

Callers must authorize the operation and supply trusted audit fields.



## Scope and Next Task



CCF-167 provides validation and the Firestore write helper.



It does not expose a public endpoint, add an audit screen,

or automatically attach logging to business operations.



Firestore write errors propagate from this helper.

CCF-168 will add the shared logging service and handling for

non-critical logging failures.



## Verification



Run from the backend directory:



```powershell

node --check src/services/audit-log.service.js

node --check tests/audit-log.service.test.js

node tests/audit-log.service.test.js

git diff --check

```



Verified locally:



\- Audit log data tests passed.

\- 57 invalid input cases were checked.

\- Invalid input does not reach Firestore.

\- Timestamp uses the Firestore server timestamp.

\- Separate calls create separate audit records.

\- Firestore write failures propagate.

\- Tests use an in-memory Firestore mock.



A real Firestore write has not yet been verified.
