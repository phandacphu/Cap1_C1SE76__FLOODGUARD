\# Rescue Request Filtering API



\## Jira Task



CCF-96 - RESCUE-BE-02 Implement Rescue Request Filtering API



\## Endpoint



```text

GET /api/rescue-requests
```

## Authentication

Required header:

```text
Authorization: Bearer <access_token>
```

Allowed roles:

- Resident
- Rescue Staff
- Admin

## Query Parameters

### status

Allowed values:

```text
submitted
received
in_progress
assisted
cancelled
```

Example:

```text
GET /api/rescue-requests?status=in_progress
```

### urgency

Allowed values:

```text
low
medium
high
critical
```

Example:

```text
GET /api/rescue-requests?urgency=critical
```

### severity

`severity` is an alias of `urgency`.

```text
GET /api/rescue-requests?severity=critical
```

If both `urgency` and `severity` are provided, they must have the same value.

```text
GET /api/rescue-requests?status=in_progress&urgency=critical
```

## Role Behavior

- Resident receives only their own SOS requests.
- Rescue Staff receives SOS requests from all residents.
- Admin receives SOS requests from all residents.
- Filters are applied after role-based access filtering.

## Successful Response

HTTP 200:

```json
{
  "success": true,
  "message": "Rescue requests retrieved successfully",
  "data": {
    "rescueRequests": []
  }
}
```

Results are sorted by newest `createdAt` first.

## Error Responses

Invalid filters return HTTP 400:

```json
{
  "success": false,
  "message": "Invalid rescue request status filter"
}
```

Invalid cases include:

- Unsupported status.
- Unsupported urgency.
- Non-string filter value.
- Different `urgency` and `severity` values.

## Testing

```text
node --check tests/rescue-request-filtering.test.js
node tests/rescue-request-filtering.test.js
node tests/get-my-sos-requests.test.js
```

Tests use mocked Firestore and do not modify real rescue requests.
