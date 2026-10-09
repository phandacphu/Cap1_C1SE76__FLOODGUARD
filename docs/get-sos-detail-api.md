\# Get SOS Detail API



\## Jira Task



CCF-78 - SOS-BE-04 Get SOS Detail



\## Endpoint



```http

GET /api/rescue-requests/:requestId

```



\## Authentication



Required header:



```text

Authorization: Bearer <access\_token>

```



Only authenticated and active users may access the endpoint.



\## Access control



\- Resident can view only their own SOS request.

\- Rescue can view SOS requests from all residents.

\- Admin can view SOS requests from all residents.

\- A resident accessing another resident's request receives `403`.

\- A missing request receives `404`.



\## Successful response



HTTP `200 OK`



```json

{

&#x20; "success": true,

&#x20; "message": "Rescue request retrieved successfully",

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

&#x20;     "status": "in\_progress",

&#x20;     "createdAt": "2026-10-06T10:00:00.000Z",

&#x20;     "updatedAt": "2026-10-06T11:00:00.000Z",

&#x20;     "statusHistory": \[

&#x20;       {

&#x20;         "id": "<history-id>",

&#x20;         "oldStatus": null,

&#x20;         "newStatus": "submitted",

&#x20;         "changedBy": "<resident-id>",

&#x20;         "note": "SOS request submitted",

&#x20;         "changedAt": "2026-10-06T10:00:00.000Z"

&#x20;       }

&#x20;     ]

&#x20;   }

&#x20; }

}

```



\## Error responses



```json

{

&#x20; "success": false,

&#x20; "message": "Error description"

}

```



\- `400`: missing request ID.

\- `401`: missing, invalid, or expired token; authenticated user no longer exists.

\- `403`: inactive account or resident accessing another resident's request.

\- `404`: SOS request not found.

\- `500`: unexpected server or database failure.



\## Testing



Run from the backend directory:



```text

node tests/get-sos-detail.test.js

```



The automated test verifies:



\- Resident can view their own SOS detail.

\- Resident cannot view another resident's SOS.

\- Rescue can view another resident's SOS.

\- Admin can view another resident's SOS.

\- Status history is returned in chronological order.

\- Missing request returns `404`.

\- Missing token returns `401`.



Tests use mocked Firestore and do not write real SOS records.

## Assignment in SOS Detail

GET /api/rescue-requests/:requestId also returns
data.rescueRequest.assignment.

If the SOS has not been assigned, assignment is null.

Otherwise, assignment contains:

```json
{
  "id": "<request-id>",
  "requestId": "<request-id>",
  "rescueStaffId": "<assigned-rescue-user-id>",
  "status": "accepted",
  "note": null,
  "assignedAt": "2026-10-08T20:07:01.809Z",
  "updatedAt": "2026-10-08T20:07:01.809Z"
}
```

Assignment timestamps are ISO 8601 UTC strings.
Existing SOS fields and statusHistory remain available.

After opening or reloading the page, the client reads
data.rescueRequest.assignment to identify the assigned Rescue.

Show status update controls only when:
- The current user has the rescue role.
- assignment.rescueStaffId matches the current user's ID.
- SOS and assignment statuses allow the requested transition.

Supported transitions:
- SOS received + assignment accepted → SOS in_progress.
- SOS in_progress + assignment in_progress → SOS assisted.

The backend independently checks authorization and transitions
for every PATCH request. UI visibility does not grant permission.

Automated tests cover assignment fields, timestamp serialization,
fresh reads by Rescue/Admin, and null for an unassigned SOS.