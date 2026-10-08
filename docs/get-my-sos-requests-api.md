\# Get SOS Requests API



\## Jira Task



CCF-77 - SOS-BE-03 Get My SOS Requests



\## Endpoint



```http

GET /api/rescue-requests

```



Local base URL:



```text

http://localhost:5000

```



Shared demo base URL:



```text

https://floodguard-backend-demo.onrender.com

```



\## Authentication



Required header:



```text

Authorization: Bearer <access\_token>

```



The backend verifies the current user and checks that the account is active.



\## Role behavior



\- Resident: only receives SOS requests created by the authenticated resident.

\- Rescue: can view SOS requests from all residents.

\- Admin: can view SOS requests from all residents.



The client must not provide `residentId` to bypass access control.



\## Successful response



HTTP `200 OK`



```json

{

&#x20; "success": true,

&#x20; "message": "Rescue requests retrieved successfully",

&#x20; "data": {

&#x20;   "rescueRequests": \[

&#x20;     {

&#x20;       "id": "<request-id>",

&#x20;       "residentId": "<resident-id>",

&#x20;       "location": {

&#x20;         "latitude": 16.0544,

&#x20;         "longitude": 108.2022

&#x20;       },

&#x20;       "urgency": "high",

&#x20;       "numberOfPeople": 3,

&#x20;       "note": "TEST ONLY - simulated SOS",

&#x20;       "status": "submitted",

&#x20;       "createdAt": "2026-10-06T12:48:20.606Z",

&#x20;       "updatedAt": "2026-10-06T12:48:20.606Z"

&#x20;     }

&#x20;   ]

&#x20; }

}

```



Requests are sorted from newest to oldest by `createdAt`.



\## Error responses



```json

{

&#x20; "success": false,

&#x20; "message": "Error description"

}

```



\- `401`: missing, invalid, or expired token; authenticated user no longer exists.

\- `403`: inactive account or unsupported role.

\- `500`: unexpected server or database failure.



\## Testing



Run from the backend directory:



```text

node tests/get-my-sos-requests.test.js

```



The automated test verifies:



\- Missing token returns `401`.

\- Resident sees only their own SOS requests.

\- Rescue can view SOS requests from all residents.

\- Admin can view SOS requests from all residents.

\- Results are sorted newest first.



Tests use mocked Firestore and do not write real SOS records.