\# Rescue Request Priority Sorting



\## Jira Task



CCF-97 - RESCUE-BE-03 Implement Rescue Priority Sorting



\## Endpoint



```text

GET /api/rescue-requests?sort=priority

```



\## Authentication



Required header:



```text

Authorization: Bearer <access\_token>

```



Allowed roles:



\- Resident

\- Rescue Staff

\- Admin



\## Priority Order



Requests are sorted from highest to lowest urgency:



```text

critical > high > medium > low

```



When two requests have the same urgency, the request with the newest

`createdAt` timestamp appears first.



\## Supported Sort Values



\### priority



Sort by SOS urgency priority:



```text

GET /api/rescue-requests?sort=priority

```



\### newest



Sort by newest creation time first.



This is the default when no `sort` parameter is provided:



```text

GET /api/rescue-requests?sort=newest

```



\### oldest



Sort by oldest creation time first:



```text

GET /api/rescue-requests?sort=oldest

```



\## Combining With Filters



Priority sorting can be combined with other request filters:



```text

GET /api/rescue-requests?status=submitted\&sort=priority

```



```text

GET /api/rescue-requests?urgency=critical\&sort=priority

```



\## Role Behavior



\- Resident receives only their own SOS requests.

\- Rescue Staff receives SOS requests from all residents.

\- Admin receives SOS requests from all residents.

\- Sorting is applied after role-based access filtering.



\## Successful Response



HTTP 200:



```json

{

&#x20; "success": true,

&#x20; "message": "Rescue requests retrieved successfully",

&#x20; "data": {

&#x20;   "rescueRequests": \[]

&#x20; }

}

```



For `sort=priority`, the response order is:



```text

critical

high

medium

low

```



\## Invalid Sort



Unsupported sort values return HTTP 400:



```json

{

&#x20; "success": false,

&#x20; "message": "Invalid rescue request sort filter"

}

```



Example of invalid request:



```text

GET /api/rescue-requests?sort=random

```



\## Testing



Run from the backend directory:



```text

node --check tests/rescue-request-priority.test.js

node tests/rescue-request-priority.test.js

node tests/rescue-request-filtering.test.js

```



Tests use mocked Firestore and do not modify real rescue requests.
