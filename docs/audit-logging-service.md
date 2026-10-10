# Audit Logging Service



## Jira Task



CCF-168 - AUDIT-BE-01 Audit Logging Service



## Purpose



Provide a shared audit logging service for Admin and important actions.



Non-critical logging failures must not turn an otherwise successful

business operation into an API error.



## Files



\- backend/src/services/audit-log.service.js: validation and Firestore storage.

\- backend/src/services/audit-logging.service.js: shared logging wrapper.

\- backend/src/services/accept-rescue-request.service.js: first integration.



Collection: `audit\_logs`.



See `audit-log-data.md` for the stored schema and metadata allowlist.



## Shared Function



```javascript

const {

&#x20; logAuditEvent,

} = require("./audit-logging.service");

```



Example:



```javascript

const auditResult = await logAuditEvent({

&#x20; actor: {

&#x20;   id: authorizedUser.id,

&#x20;   role: authorizedUser.role,

&#x20; },

&#x20; action: "user.update",

&#x20; target: {

&#x20;   type: "user",

&#x20;   id: updatedUser.id,

&#x20; },

&#x20; metadata: {

&#x20;   source: "api",

&#x20;   outcome: "success",

&#x20;   changedFields: \["isActive"],

&#x20; },

});

```



Actor, action and target must come from trusted server-side context.

Callers must authorize the business operation independently.



Do not pass request bodies, credentials or complete user objects.



## Results



Successful write:



```json

{

&#x20; "success": true,

&#x20; "id": "<audit-document-id>"

}

```



Failed write:



```json

{

&#x20; "success": false,

&#x20; "code": "AUDIT\_WRITE\_FAILED"

}

```



Supported failure codes:



| Code | Meaning |

| --- | --- |

| INVALID\_AUDIT\_LOG\_DATA | Input failed audit validation |

| AUDIT\_WRITE\_FAILED | The write failed |

| AUDIT\_WRITE\_TIMEOUT | The write exceeded the waiting limit |



The wrapper catches write and validation errors.

It prints a fixed warning containing only the supported failure code.

It does not print audit input or raw error details.



A console warning failure is also contained.



## Timeout and Retry



The waiting limit is 5000 milliseconds.



Timeout does not cancel the underlying Firestore write.

The write may complete after the wrapper returns a timeout result.



The service does not retry automatically.

A late rejection is handled by the promise used in Promise.race.



Business operations may experience up to approximately five seconds

of additional waiting while audit logging is pending.



## Acceptance Integration



Endpoint:



```text

POST /api/rescue-requests/:requestId/accept

```



After the acceptance transaction commits, the service records:



\- actor: the authorized Rescue staff ID and role.

\- action: `rescue\_request.accept`.

\- target: the accepted rescue request.

\- metadata: source `api`, outcome `success`, changedFields `\["status"]`.



The audit call is outside the retryable transaction callback.

Transaction retries therefore do not repeat the audit call.



Rejected acceptance and failed transactions do not attempt this audit write.

Audit write failure does not roll back the committed acceptance.



The public acceptance response remains unchanged.



## Consistency Limit



SOS, assignment and status history remain in the existing transaction.

Audit is a separate write performed after that transaction.



Audit persistence is best effort, not atomic with acceptance.

A process interruption after commit or a write failure can leave a

successful acceptance without an audit record.



## Scope



This task provides the shared service and integrates SOS acceptance.



Admin operations will use the service as CCF-112 through CCF-116

are implemented. They are not automatically covered by this change.



There is no public audit listing endpoint in this task.

The audit screen requires a separately defined authorized read API.



## Automated Verification



Run from the backend directory:



```powershell

node tests/audit-log.service.test.js

node tests/audit-logging.service.test.js

node tests/accept-rescue-request.test.js

node tests/create-sos.test.js

node tests/get-my-sos-requests.test.js

node tests/get-sos-detail.test.js

node tests/update-rescue-status.test.js

node tests/rescue-status-history.test.js

git diff --check

```



All listed tests passed locally.



The automated tests use mocks and check:



\- Audit data validation, including 57 invalid input cases.

\- Successful logging and failure results.

\- Write timeout, no automatic retry and late rejection handling.

\- Console failure containment.

\- Audit creation after successful acceptance.

\- No audit attempt on rejected acceptance or failed transaction.

\- One audit record for the winning simulated concurrent acceptance.

\- Acceptance returns HTTP 200 when the audit write fails.



## Real Firestore Verification



Date: 2026-10-10.



Environment: local backend connected to real Firestore.



Test request ID: `OHJDS85QNA0Vi317PpID`.



The SOS note identifies it as TEST ONLY and not a real emergency.



Verified:



\- Acceptance returned success.

\- SOS status became `received`.

\- Assignment status became `accepted`.

\- Exactly one audit record was stored.

\- Actor, action and target matched the acceptance.

\- Audit timestamp and metadata were present.

\- Repeated acceptance returned HTTP 409.

\- Audit count remained one.



Audit document ID: `V4yZzLmBuOAphrAq1wRK`.



Actual Firestore failures and concurrent acceptance were not deliberately

induced in the real database; those cases were checked using mocks.



Render verification is pending deployment of this change.
