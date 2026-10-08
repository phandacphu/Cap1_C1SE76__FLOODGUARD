# Accept Rescue Request API

## Jira Task

CCF-98 - RESCUE-BE-04 Accept Rescue Request API

## Endpoint

```text

POST /api/rescue-requests/:requestId/accept

```

Local base URL:

```text

http://localhost:5000

```

Shared demo base URL:

```text

https://floodguard-backend-demo.onrender.com

```

This endpoint is available on the shared demo only after the

feature is merged and successfully deployed.

## Authentication

Required header:

```text

Authorization: Bearer <access\_token>

```

Only authenticated, active Rescue Staff accounts can accept SOS

requests. The backend role value is `rescue`.

Resident and Admin accounts cannot use this endpoint.

The route checks the JWT role. The service also checks the current

user record inside the Firestore transaction.

The rescue staff ID comes from the verified JWT.

## Request

Replace `:requestId` with the SOS request ID.

No request body is required. An empty JSON object is also accepted:

```json

{}

```

When sending JSON, include:

```text

Content-Type: application/json

```

Do not send rescueStaffId, residentId, status, note, timestamps,

or assignment fields.

Non-empty objects and arrays are rejected with HTTP 400.

Primitive or malformed JSON may be rejected by Express before

the controller runs.

## Availability Rules

A request can be accepted only when:

\- The SOS request exists.

\- Its current status is `submitted`.

\- No assignment document exists for that request.

Requests with status `received`, `in\_progress`, `assisted`,

or `cancelled` cannot be accepted.

An existing assignment blocks acceptance, including an assignment

whose status is `cancelled`. Reassignment is outside this task.

## Successful Response

HTTP 200 OK

```json

{

&#x20; "success": true,

&#x20; "message": "Rescue request accepted successfully",

&#x20; "data": {

&#x20;   "rescueRequest": {

&#x20;     "id": "<request-id>",

&#x20;     "residentId": "<resident-id>",

&#x20;     "location": {

&#x20;       "latitude": 16.0544,

&#x20;       "longitude": 108.2022

&#x20;     },

&#x20;     "urgency": "high",

&#x20;     "numberOfPeople": 3,

&#x20;     "note": "TEST ONLY - simulated SOS",

&#x20;     "status": "received",

&#x20;     "createdAt": "2026-10-08T12:00:00.000Z",

&#x20;     "updatedAt": "2026-10-08T12:05:00.000Z"

&#x20;   },

&#x20;   "assignment": {

&#x20;     "id": "<request-id>",

&#x20;     "requestId": "<request-id>",

&#x20;     "rescueStaffId": "<authenticated-rescue-staff-id>",

&#x20;     "status": "accepted",

&#x20;     "note": null,

&#x20;     "assignedAt": "2026-10-08T12:05:00.000Z",

&#x20;     "updatedAt": "2026-10-08T12:05:00.000Z"

&#x20;   }

&#x20; }

}

```

Timestamps are returned as ISO 8601 UTC strings.

## Firestore Transaction

The transaction reads:

\- users/{rescueStaffId}

\- rescue\_requests/{requestId}

\- rescue\_assignments/{requestId}

After validation, it performs three writes together:

1\. Creates rescue\_assignments/{requestId}.

2\. Updates the SOS status from `submitted` to `received`

&#x20;  and updates its updatedAt timestamp.

3\. Creates a rescue\_request\_status\_history document.

The assignment document ID equals the SOS request ID.

Assignment fields:

\- requestId: the SOS request ID.

\- rescueStaffId: the authenticated Rescue Staff ID.

\- status: accepted.

\- note: null.

\- assignedAt: server timestamp.

\- updatedAt: server timestamp.

History fields:

\- requestId: the SOS request ID.

\- oldStatus: submitted.

\- newStatus: received.

\- changedBy: the authenticated Rescue Staff ID.

\- note: SOS request accepted by rescue staff.

\- changedAt: server timestamp.

All transaction writes succeed together or none are applied.

When two staff members attempt to accept the same SOS concurrently,

Firestore transaction conflict handling prevents both from

successfully accepting it. The losing attempt returns HTTP 409

when its retried transaction finds the request unavailable.

## Error Responses

Controller and authentication errors use:

```json

{

&#x20; "success": false,

&#x20; "message": "Error description"

}

```

Status codes:

\- 400: invalid request ID or unsupported request body.

\- 401: missing, invalid, or expired token; user no longer exists.

\- 403: inactive account or account without Rescue Staff permission.

\- 404: SOS request does not exist.

\- 409: SOS request is no longer available.

\- 500: unexpected server or database failure.

Example conflict:

```json

{

&#x20; "success": false,

&#x20; "message": "Rescue request is no longer available"

}

```

Express parser errors may return a non-JSON HTTP 400 response.

## Client Integration

\- Use the SOS ID from the listing or detail API.

\- Attach the Rescue Staff access token.

\- Send no body or an empty object.

\- Disable the accept button while the request is in progress.

\- On HTTP 200, display the received state and assigned staff.

\- On HTTP 401, require the user to sign in again.

\- On HTTP 403, display the access restriction.

\- On HTTP 404, refresh the listing.

\- On HTTP 409, refresh the SOS detail and listing.

\- Do not display success before receiving HTTP 200.

Repeated acceptance returns HTTP 409, even for the same staff member.

After a timeout or HTTP 500, the transaction may already have

committed before the response failed. Refresh the request state

before deciding what to do next.

This task does not implement later progress updates, completion,

cancellation, reassignment, or notifications.

## Automated Testing

Run from the backend directory:

```text

node tests/accept-rescue-request.test.js

node tests/rescue-assignment.service.test.js

node tests/create-sos.test.js

node tests/get-my-sos-requests.test.js

node tests/get-sos-detail.test.js

node tests/rescue-request-filtering.test.js

node tests/rescue-request-priority.test.js

node tests/auth.middleware.test.js

node tests/rbac.middleware.test.js

```

The acceptance tests use mocked Firestore and do not write real

SOS records.

Coverage includes:

\- Successful acceptance and response serialization.

\- JWT authentication and role restrictions.

\- Current database role and account activity checks.

\- Missing user and missing SOS request.

\- Unsupported request bodies and invalid request ID.

\- Unavailable statuses and existing assignment.

\- Repeated acceptance without additional history.

\- Transaction failure without partial writes.

\- Two competing transactions using simulated conflict and retry.

The concurrency test validates the application with a mock.

It is not a real Firestore concurrency integration test.

## Manual Integration Testing

Manual integration checks passed using the local backend and

real Firestore with a dedicated simulated SOS:

\- Acceptance changes the SOS from submitted to received.

\- Assignment is accepted and belongs to the authenticated Rescue Staff.

\- Repeated acceptance returns HTTP 409.

\- History contains the initial submission and one acceptance entry.

\- Repeated acceptance does not create additional history.

Real Firestore concurrency testing has not been performed.

Concurrent acceptance is covered by the mocked transaction test.

Use only clearly marked simulated SOS records.

Do not accept a real emergency request for testing.
