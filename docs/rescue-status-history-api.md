# Rescue Status History API

## Jira Task

CCF-101 - BE-07 Rescue Status History API

## Endpoint

```text

GET /api/rescue-requests/:requestId/history

```

Local base URL: http://localhost:5000

Shared demo base URL: https://floodguard-backend-demo.onrender.com

This endpoint is available on the shared demo only after the feature

is merged and successfully deployed.

## Authentication

Required header:

```text

Authorization: Bearer <access\_token>

```

The backend checks the current user record in Firestore.

Access rules:

\- Resident: may view history of their own SOS requests.

\- Rescue: may view history of SOS requests from all residents.

\- Admin: may view history of SOS requests from all residents.

\- Inactive accounts and unsupported roles are rejected.

The request owner is checked before history is queried.

Client-supplied user IDs cannot override access rules.

## Request

Replace requestId with an existing SOS request ID.

```text

GET /api/rescue-requests/<requestId>/history

```

No request body is required.

## Successful Response

HTTP 200 OK

```json

{

&#x20; "success": true,

&#x20; "message": "Rescue request history retrieved successfully",

&#x20; "data": {

&#x20;   "requestId": "<requestId>",

&#x20;   "statusHistory": \[

&#x20;     {

&#x20;       "id": "<initial-history-id>",

&#x20;       "oldStatus": null,

&#x20;       "newStatus": "submitted",

&#x20;       "changedBy": "<residentId>",

&#x20;       "note": "SOS request submitted",

&#x20;       "changedAt": "2026-10-09T08:00:00.000Z"

&#x20;     },

&#x20;     {

&#x20;       "id": "<acceptance-history-id>",

&#x20;       "oldStatus": "submitted",

&#x20;       "newStatus": "received",

&#x20;       "changedBy": "<rescueStaffId>",

&#x20;       "note": "SOS request accepted by rescue staff",

&#x20;       "changedAt": "2026-10-09T08:05:00.000Z"

&#x20;     }

&#x20;   ]

&#x20; }

}

```

An existing SOS with no history returns HTTP 200 and:

```json

{

&#x20; "success": true,

&#x20; "message": "Rescue request history retrieved successfully",

&#x20; "data": {

&#x20;   "requestId": "<requestId>",

&#x20;   "statusHistory": \[]

&#x20; }

}

```

## Timeline Ordering

History is returned from oldest to newest.

Sorting uses Firestore timestamp seconds and nanoseconds.

When timestamps are identical, document ID ascending is the tie-breaker.

Document IDs provide deterministic ordering for identical timestamps;

they do not indicate the causal order of those events.

changedAt is returned as an ISO 8601 UTC string with millisecond precision.

Clients should preserve the returned array order.

## History Fields

\- id: history document ID.

\- oldStatus: previous SOS status; null for the initial entry.

\- newStatus: SOS status after the event.

\- changedBy: ID of the user responsible for the event.

\- note: event description, or null.

\- changedAt: server timestamp serialized as an ISO 8601 UTC string.

Supported SOS status values:

\- submitted

\- received

\- in\_progress

\- assisted

\- cancelled

Supporting a status value does not mean its update endpoint

is implemented by this task.

## Error Responses

Errors use this structure:

```json

{

&#x20; "success": false,

&#x20; "message": "Error description"

}

```

Status codes:

\- 400: invalid rescue request ID.

\- 401: missing, invalid or expired token; user no longer exists.

\- 403: inactive account, unsupported role, or another resident's SOS.

\- 404: SOS request does not exist.

\- 500: unexpected server or database failure.

## History Writes and Task Scope

Existing public SOS creation saves the request and its initial

submitted history together in one batch.

Existing public SOS acceptance saves the received status,

accepted assignment and status history together in one transaction.

This task adds a read-only history endpoint and deterministic

timeline ordering. It does not add a status-update endpoint

or automatically generate history for direct database edits.

Future SOS status-update flows must save the status change and

its history atomically, and obtain changedBy from the authenticated

user rather than client-controlled input.

The existing SOS detail endpoint continues to include statusHistory.

## Web and Mobile Integration

\- Attach the signed-in user's access token.

\- Use the SOS ID to request its timeline.

\- Render entries in the returned order.

\- Convert UTC timestamps to local time for display.

\- Display an empty state when statusHistory is empty.

\- On 401, require sign-in again.

\- On 403, display the access restriction.

\- On 404, display that the SOS no longer exists.

\- On 500, display a retry option.

\- Resolve changedBy to a display name only through an authorized API.

## Automated Testing

Run from the backend directory:

```text

node tests/rescue-status-history.test.js

node tests/get-sos-detail.test.js

node tests/accept-rescue-request.test.js

```

Tests use mocked Firestore and do not write real SOS records.

Coverage includes:

\- Missing, invalid and expired authentication.

\- Missing and inactive users.

\- Current user role validation.

\- Resident ownership restrictions.

\- Rescue and Admin access.

\- No history query before access is granted.

\- Missing SOS and invalid request IDs.

\- Empty timelines.

\- Filtering history by the requested SOS ID.

\- Timestamp ordering, including sub-millisecond differences.

\- Document ID tie-breaking for identical timestamps.

\- ISO timestamp serialization.

\- Database failures returning HTTP 500.

Manual testing against real Firestore and the deployed endpoint

has not yet been performed for CCF-101.
