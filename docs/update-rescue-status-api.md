# Rescue Status Update API

## Jira Task

CCF-100 - BE-06 Rescue Status Update API

## Endpoint

```text

PATCH /api/rescue-requests/:requestId/status

```

Local base URL: http://localhost:5000

Shared demo base URL: https://floodguard-backend-demo.onrender.com

The endpoint is available on the shared demo only after this feature

is merged and successfully deployed.

## Authentication and Authorization

Required headers:

```text

Content-Type: application/json

Authorization: Bearer <access\_token>

```

Only the active Rescue Staff assigned to the SOS may update its status.

The transaction checks the current user record in Firestore,

the SOS and its assignment.

Resident, Admin, inactive accounts and other Rescue Staff are rejected.

The acting user ID comes from the verified JWT.

Client-supplied staff IDs and history fields are rejected.

## Supported Workflow

| Current SOS | Current assignment | Requested SOS | New assignment |

| --- | --- | --- | --- |

| received | accepted | in\_progress | in\_progress |

| in\_progress | in\_progress | assisted | completed |

The SOS must first be accepted through the acceptance API.

Skipping steps, reversing status, repeating a completed transition

and updating terminal SOS requests are rejected.

This endpoint does not support cancellation or reassignment.

Cancellation permissions and workflow require a separate specification.

## Request Body

Start rescue work:

```json

{

&#x20; "status": "in\_progress",

&#x20; "note": "TEST ONLY - simulated rescue in progress"

}

```

Complete rescue work:

```json

{

&#x20; "status": "assisted",

&#x20; "note": "TEST ONLY - simulated rescue completed"

}

```

Validation:

\- Body must be an object.

\- status is required and must be in\_progress or assisted.

\- note is optional and must be a string or null.

\- Surrounding note whitespace is removed.

\- Missing, null or blank note becomes null.

\- Unsupported top-level fields are rejected.

The note is stored in the new history entry.

Existing SOS and assignment notes are preserved.

## Successful Response

HTTP 200 OK

```json

{

&#x20; "success": true,

&#x20; "message": "Rescue request status updated successfully",

&#x20; "data": {

&#x20;   "rescueRequest": {

&#x20;     "id": "<requestId>",

&#x20;     "residentId": "<residentId>",

&#x20;     "location": {

&#x20;       "latitude": 16.0544,

&#x20;       "longitude": 108.2022

&#x20;     },

&#x20;     "urgency": "high",

&#x20;     "numberOfPeople": 1,

&#x20;     "note": "TEST ONLY - simulated SOS",

&#x20;     "status": "in\_progress",

&#x20;     "createdAt": "2026-10-08T20:06:17.269Z",

&#x20;     "updatedAt": "2026-10-09T08:55:39.291Z"

&#x20;   },

&#x20;   "assignment": {

&#x20;     "id": "<requestId>",

&#x20;     "requestId": "<requestId>",

&#x20;     "rescueStaffId": "<assignedRescueStaffId>",

&#x20;     "status": "in\_progress",

&#x20;     "note": null,

&#x20;     "assignedAt": "2026-10-08T20:07:01.809Z",

&#x20;     "updatedAt": "2026-10-09T08:55:39.291Z"

&#x20;   }

&#x20; }

}

```

On successful completion, rescueRequest.status is assisted

and assignment.status is completed.

Timestamps are ISO 8601 UTC strings.

## Atomic Firestore Writes

One transaction:

\- Updates the SOS status and updatedAt.

\- Updates the assignment status and updatedAt.

\- Creates a status history entry with a server timestamp.

All three writes commit together or none commit.

The assignment request ID, staff ID, original assignedAt

and other existing fields are preserved.

History contains:

\- requestId

\- oldStatus

\- newStatus

\- changedBy

\- note

\- changedAt

Competing identical updates are rechecked against current data

when the transaction retries. Only one may perform that transition.

The response reads the SOS and assignment after commit.

An unexpected response-read failure may return 500 even though

the transaction committed. Fetch the current SOS before deciding

whether to retry an uncertain update.

## Error Responses

```json

{

&#x20; "success": false,

&#x20; "message": "Error description"

}

```

Status codes:

\- 400: invalid request ID, body, status, note or unsupported field.

\- 401: missing, invalid or expired token; user no longer exists.

\- 403: inactive account, unsupported role or another assigned staff.

\- 404: SOS does not exist.

\- 409: missing or mismatched assignment, inconsistent statuses,

&#x20; or a disallowed transition.

\- 500: unexpected server or database failure.

Example conflict:

```json

{

&#x20; "success": false,

&#x20; "message": "Status transition is not allowed for the current SOS and assignment"

}

```

## Web Integration

\- Show update actions for the assigned Rescue Staff.

\- Send only status and optional note.

\- Disable the action while a request is in progress.

\- Update the displayed state only after a successful response.

\- On 409, refresh the SOS to obtain its current status.

\- On 401, require sign-in again.

\- On 403, display the access restriction.

\- After an uncertain failure, fetch the current SOS before retrying.

\- Fetch GET /api/rescue-requests/:requestId/history for the timeline.

The backend enforces permissions independently of UI visibility.

## Automated Tests

Run from the backend directory:

```text

node tests/update-rescue-status.test.js

node tests/accept-rescue-request.test.js

node tests/rescue-status-history.test.js

```

Tests use mocked Firestore and do not write real SOS records.

Coverage includes authentication, current account role,

assignment ownership, body validation, workflow restrictions,

successful progress and completion, field preservation,

history writes, database failures and simulated competing updates.

## Manual Local Validation

Completed through the local API using real Firestore

and an existing clearly marked simulated SOS:

\- received to in\_progress succeeded.

\- SOS and assignment became in\_progress.

\- in\_progress to assisted succeeded.

\- Assignment became completed.

\- Original assignedAt was preserved.

\- Timeline contained creation, acceptance, progress and completion.

\- Reversing assisted to in\_progress returned HTTP 409.

Real Firestore concurrency testing and deployed PATCH endpoint

testing have not yet been performed.
