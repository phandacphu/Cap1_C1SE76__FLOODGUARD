# Rescue Assignment Logic

## Jira Task

CCF-99 - RESCUE-BE-05 Rescue Assignment Logic

## Purpose

Protect the link between a Rescue Request and its Rescue Staff

recipient, prevent duplicate assignments, and preserve the

original assignment time.

## Files

\- backend/src/services/rescue-assignment.service.js

\- backend/tests/rescue-assignment.service.test.js

## Assignment Data

Collection: rescue\_assignments

Document ID: the Rescue Request ID.

Fields:

\- requestId: linked SOS request ID.

\- rescueStaffId: assigned Rescue Staff account ID.

\- status: assignment status.

\- note: optional trimmed string, otherwise null.

\- assignedAt: original server assignment timestamp.

\- updatedAt: server timestamp of the latest update.

Supported status values:

\- assigned

\- accepted

\- in\_progress

\- completed

\- cancelled

This task validates supported status values. It does not define

a full status transition workflow.

## Creation Rules

createRescueAssignment uses a Firestore transaction to check:

\- The referenced SOS request exists.

\- The SOS status is submitted.

\- No assignment document exists for the request.

\- The recipient account exists.

\- The recipient role is rescue.

\- The recipient isActive value is true.

The transaction creates the assignment with server timestamps.

Client-provided timestamp fields are not used.

An existing assignment blocks creation, regardless of its status.

This helper does not support reassignment.

## Update Rules

setRescueAssignmentById uses a Firestore transaction.

It verifies:

\- The assignment exists.

\- The input requestId matches the assignment document ID.

\- The stored requestId matches the assignment document ID.

\- The recipient matches the original rescueStaffId.

\- The original assignedAt is present.

\- The linked SOS request still exists.

\- The recipient still exists, has role rescue, and is active.

It updates only:

\- status

\- note

\- updatedAt

It preserves:

\- requestId

\- rescueStaffId

\- assignedAt

\- Additional fields already stored in the assignment.

Missing original assignedAt is rejected instead of silently

replacing it with a new time.

## Relationship to CCF-98

The public acceptance endpoint remains:

```text

POST /api/rescue-requests/:requestId/accept

```

CCF-98 performs assignment creation, SOS status update, and status

history creation in one transaction.

The CCF-99 create and update helpers are internal data functions.

They do not update SOS status or create SOS status history.

They are not authorization boundaries. A future API caller must

authorize the acting user before invoking them.

Clients must continue using the public acceptance endpoint to

accept an SOS request.

No new public endpoint is added by CCF-99.

## Service Error Codes

Creation and update may return:

\- RESCUE\_REQUEST\_NOT\_FOUND

\- RESCUE\_REQUEST\_UNAVAILABLE

\- RESCUE\_ASSIGNMENT\_ALREADY\_EXISTS

\- RESCUE\_ASSIGNMENT\_NOT\_FOUND

\- RESCUE\_ASSIGNMENT\_REQUEST\_MISMATCH

\- RESCUE\_ASSIGNMENT\_STAFF\_MISMATCH

\- RESCUE\_ASSIGNMENT\_TIMESTAMP\_MISSING

\- RESCUE\_STAFF\_NOT\_FOUND

\- INVALID\_RESCUE\_STAFF\_ROLE

\- RESCUE\_STAFF\_INACTIVE

These are internal service error codes, not a new HTTP contract.

Unexpected database errors are propagated to the caller.

## Validation

Assignment data must be an object.

Request, staff, and assignment IDs must be non-empty strings.

IDs are trimmed and cannot contain a slash, equal "." or "..",

or exceed 1500 UTF-8 bytes.

Status must be a supported assignment status.

Note must be a string, null, or omitted.

Blank notes become null.

## Automated Tests

Run from the backend directory:

```text

node tests/rescue-assignment.service.test.js

node tests/accept-rescue-request.test.js

node tests/create-sos.test.js

node tests/get-my-sos-requests.test.js

node tests/get-sos-detail.test.js

node tests/rescue-request-filtering.test.js

node tests/rescue-request-priority.test.js

node tests/sos-validation.test.js

```

Tests use mocked Firestore and do not write real records.

Coverage includes:

\- Normalization and invalid input rejection.

\- Missing SOS request or recipient account.

\- Wrong recipient role and inactive recipient.

\- Unavailable SOS statuses.

\- Duplicate assignment rejection.

\- Server assignment timestamps.

\- Recipient and request identity protection.

\- Preservation of assignedAt and additional stored fields.

\- Missing original timestamp and corrupt request links.

\- Database read and commit failures without partial writes.

\- Two competing creates using simulated conflict and retry.

\- Recipient role change during a transaction.

\- Compatibility with the existing CCF-98 acceptance API.

Real Firestore concurrency testing has not been performed.

## Scope Limits

This task does not add:

\- A public assignment update endpoint.

\- Authorization for a future update endpoint.

\- A complete status transition workflow.

\- Synchronization of internal helper updates with SOS status/history.

\- Reassignment to another staff member.

\- Notifications or team dispatch.

\- A migration or repair of existing invalid assignment records.

Any future status update API must coordinate assignment, SOS status,

and status history atomically.
