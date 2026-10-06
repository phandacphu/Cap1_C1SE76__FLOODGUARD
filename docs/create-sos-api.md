\# Create SOS API



\## Jira Task



CCF-75 - Create SOS API



\## Endpoint



POST /api/rescue-requests



Local base URL: http://localhost:5000



Shared demo base URL: https://floodguard-backend-demo.onrender.com



The shared demo endpoint is available only after this feature is merged and successfully deployed.



\## Authentication



Required headers:



```text

Content-Type: application/json

Authorization: Bearer <access\_token>

```



Only authenticated, active Resident accounts can create SOS requests.



The backend checks the current user record in Firestore.

Admin and Rescue accounts cannot use this endpoint.



\## Request Body



```json

{

&#x20; "location": {

&#x20;   "latitude": 16.0544,

&#x20;   "longitude": 108.2022

&#x20; },

&#x20; "urgency": "high",

&#x20; "numberOfPeople": 3,

&#x20; "note": "TEST ONLY - simulated SOS, not a real emergency"

}

```



Validation rules:



- location: required.

- latitude: finite number between -90 and 90.

- longitude: finite number between -180 and 180.

- urgency: low, medium, high, or critical.

- numberOfPeople: positive integer.

- note: optional string or null; surrounding whitespace is removed.

- Missing or blank note is stored as null.

- Unsupported top-level fields are rejected.



Do not send residentId, status, timestamps, or history fields.

The backend obtains residentId from the verified JWT and sets status to submitted.



\## Successful Response



HTTP 201 Created



```json

{

&#x20; "success": true,

&#x20; "message": "SOS request created successfully",

&#x20; "data": {

&#x20;   "rescueRequest": {

&#x20;     "id": "<generated-request-id>",

&#x20;     "residentId": "<authenticated-resident-id>",

&#x20;     "location": {

&#x20;       "latitude": 16.0544,

&#x20;       "longitude": 108.2022

&#x20;     },

&#x20;     "urgency": "high",

&#x20;     "numberOfPeople": 3,

&#x20;     "note": "TEST ONLY - simulated SOS, not a real emergency",

&#x20;     "status": "submitted",

&#x20;     "createdAt": "2026-10-06T12:48:20.606Z",

&#x20;     "updatedAt": "2026-10-06T12:48:20.606Z"

&#x20;   }

&#x20; }

}

```



Timestamps are returned as ISO 8601 UTC strings.



\## Firestore Writes



One batch creates both documents:



- rescue\_requests/{requestId}

- rescue\_request\_status\_history/{historyId}



The initial history contains:



- requestId: the newly created request ID.

- oldStatus: null.

- newStatus: submitted.

- changedBy: the authenticated Resident ID.

- note: SOS request submitted.

- changedAt: server timestamp.



The batch commits both documents together or neither document.



\## Error Responses



Errors use this structure:



```json

{

&#x20; "success": false,

&#x20; "message": "Error description"

}

```



Status codes:



- 400: invalid input or unsupported request field.

- 401: missing, invalid, or expired token; authenticated user no longer exists.

- 403: inactive account or account without Resident permission.

- 500: unexpected server or database failure.



Example validation error:



```json

{

&#x20; "success": false,

&#x20; "message": "Rescue request numberOfPeople must be a positive integer"

}

```



\## Mobile Integration



- Obtain coordinates before submitting.

- Send coordinates as JSON numbers.

- Send numberOfPeople as a JSON integer.

- Attach the Resident access token.

- Disable the submit button while the request is in progress.

- On HTTP 201, retain data.rescueRequest.id and show the submitted state.

- On HTTP 400, display the validation message.

- On HTTP 401, require the user to sign in again.

- On HTTP 403, display the access restriction.

- Never display success before receiving a successful response.



Duplicate prevention and idempotent retries are not implemented in this task.

Do not automatically retry a POST after a timeout or uncertain failure:

the first request may already have been saved.



This task creates SOS requests and their initial history.

It does not implement rescue assignment or later status changes.



\## Testing



Automated tests use mocked Firestore and do not write real SOS records.



```text

node tests/create-sos.test.js

node tests/auth.middleware.test.js

node tests/rbac.middleware.test.js

```



Manual checks completed locally:



- Resident successfully creates an SOS.

- Initial history is stored with the matching request ID and Resident ID.

- Missing token returns 401.

- numberOfPeople = 0 returns 400.

- Client-supplied residentId returns 400.

- Latitude outside the allowed range returns 400.



All manual demo submissions must be clearly marked as simulated.