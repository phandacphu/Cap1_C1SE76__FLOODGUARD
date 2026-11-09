# SOS Backend — direct rescue confirmation (v2)

Baseline: develop `12f20f1` (PR #117). New SOS follows:
**Resident sends → Rescue sees and goes to help → Rescue confirms Đã cứu.**

Phú owns Backend/Rescue Mobile, Thiên Resident Mobile, Huy Admin Web, Khoa Rescue
Web, Tú testing. Develop independently against this contract, with separate PRs.
No acceptance, assignment, Admin intervention or in-progress prerequisite.

## Authentication and states

All endpoints use `Authorization: Bearer <JWT>`. Current stored account/role and
isActive are checked too. Actor IDs come from authentication, never request input.

| Stored status | API state | UI |
|---|---|---|
| submitted | active | Đã gửi — chờ cứu hộ |
| assisted | rescued | Đã cứu |
| received/in_progress (legacy only) | active | Chờ cứu; raw status preserved |
| cancelled/unknown (legacy only) | legacy_other | Historical record; never classify as rescued |

Only submitted and assisted are written by new SOS operations. Completing an SOS
removes it from `state=active` reads, not the database. Keep its GPS and history.
Clients must refresh lists/maps; Backend does not push a map refresh or turn off
phone GPS. Rescue's history stays on Yêu cầu SOS using filters; Nhiệm vụ untouched.

## Create SOS

`POST /api/rescue-requests` — active Resident only.

```json
{
  "location": { "latitude": 16.0544, "longitude": 108.2022 },
  "situations": ["trapped", "injured"],
  "numberOfPeople": 3,
  "waterLevel": "waist",
  "note": "Cần hỗ trợ"
}
```

- location: finite numbers, latitude [-90,90], longitude [-180,180].
- situations: 1–5 unique values: trapped, evacuation, injured, vulnerable, other.
- numberOfPeople: positive safe integer (numeric strings rejected).
- waterLevel: below_knee, waist, chest, above_two_meters.
- note: optional/null/blank, trimmed at ends, <=200 UTF-16 units after trimming
  (same Kotlin/JavaScript length convention); blank becomes null.
- Unknown fields rejected, including urgency, residentId, id, status, assignment
  and server timestamps. No automatic urgency inference.

HTTP 201, illustrative response:

```json
{
  "success": true,
  "message": "SOS request created successfully",
  "data": {
    "rescueRequest": {
      "id": "EXAMPLE_SOS_ID",
      "residentId": "EXAMPLE_RESIDENT_ID",
      "location": { "latitude": 16.0544, "longitude": 108.2022 },
      "initialLocation": { "latitude": 16.0544, "longitude": 108.2022 },
      "locationCapturedAt": null,
      "locationReceivedAt": "2026-11-08T06:00:00.000Z",
      "situations": ["trapped", "injured"],
      "numberOfPeople": 3,
      "waterLevel": "waist",
      "note": "Cần hỗ trợ",
      "status": "submitted",
      "state": "active",
      "completedBy": null,
      "completedAt": null,
      "createdAt": "2026-11-08T06:00:00.000Z",
      "updatedAt": "2026-11-08T06:00:00.000Z"
    }
  }
}
```

The current Mobile create payload does not include GPS capture time. Backend
therefore initializes locationCapturedAt=null; locationReceivedAt is server time.
Do not invent a device capture time from receipt time.

Only one active SOS per Resident, including legacy received/in_progress records.
Duplicate/concurrent POST: HTTP 409, code DUPLICATE_SOS_REQUEST,
`data:{activeRequestId:"EXISTING_ID"}`. No second SOS/history is created.
After a POST timeout, read the Resident's active SOS to reconcile; do not blindly
resend or display success. No idempotency-key header is introduced.

## Read endpoints

- GET `/api/rescue-requests`: Resident sees only own SOS; Rescue/Admin see all.
- GET `/api/rescue-requests/:requestId`: same scope.
- GET `/api/rescue-requests/:requestId/history`: same scope.
- Admin read-only routes:
  - GET `/api/admin/rescue-requests`
  - GET `/api/admin/rescue-requests/summary`
  - GET `/api/admin/rescue-requests/:requestId`

List envelope: `{success:true,message,data:{rescueRequests:[...]}}`.
Detail envelope: `{success:true,message,data:{rescueRequest:{...}}}`.
All clients receive the same SOS fields as the creation response. Detail also
includes assignment (null for new records; legacy metadata only) and statusHistory.

History envelope: `{success:true,message,data:{requestId,statusHistory:[...]}}`.
Each event has id, oldStatus, newStatus, changedBy, note, changedAt (ISO datetime).
New requests have creation null→submitted and completion submitted→assisted;
there are no synthetic acceptance/in-progress events. Existing history preserved.

Missing legacy facts (initial GPS, device/receipt timestamps, situations,
waterLevel, completedBy/completedAt) return null. No invented profile, phone,
address or completion information. Current projection provides residentId, not a
joined contact profile; coordinate a separate explicit contract if UI needs it.
No urgency field is returned to clients.

### Shared list/summary filters

| Query | Meaning |
|---|---|
| state=active | submitted + legacy received/in_progress |
| state=rescued | assisted |
| state=legacy_other | cancelled/unknown historical records |
| omit state | All records |
| status | Optional exact raw status; do not combine with state |
| sort=newest or oldest | Creation time; default newest, ID tie-break |
| from, to | Inclusive ISO creation-time boundaries with explicit timezone |

Use state=active for active map pins/default Rescue list, state=rescued for history.
UI must use Backend state rather than guess legacy status mappings.
Unsupported queries, repeated values, malformed dates, urgency/severity filters
and sort=priority return 400. Date-only strings are rejected; send exact instants.

No search or pagination is claimed. Current endpoint returns the whole filtered
result; filtering is server-side using existing collection reads. Do not present
one local page's length as a global total. Revisit database pagination before
high-volume deployment; this change does not redesign unrelated storage.

### Admin summary

`data` is:

```json
{
  "total": 6,
  "active": 3,
  "rescued": 1,
  "legacyOther": 2,
  "byStatus": { "submitted": 1, "received": 1, "in_progress": 1, "assisted": 1, "cancelled": 1 }
}
```

For identical filters, list length equals total and
`total = active + rescued + legacyOther`. Unknown states are included in
legacyOther/total, not named byStatus buckets. Display legacy count separately
when nonzero; never count cancellation as rescued. byUrgency is removed.
Admin cannot accept/assign/complete/edit/delete/cancel an SOS.

## Update location

`PATCH /api/rescue-requests/:requestId/location` — active Resident owner only.

```json
{
  "location": { "latitude": 16.055, "longitude": 108.203 },
  "capturedAt": "2026-11-08T06:00:30.000Z"
}
```

HTTP 200 uses `{success:true,message,data:{rescueRequest:{...}}}`.

- capturedAt required ISO datetime with timezone; stored as locationCapturedAt.
  locationReceivedAt is independently set by Backend.
- Capture must be newer than last accepted capture; for first update it must be
  newer than SOS creation. Equal/older samples return 409 STALE_SOS_LOCATION.
- Device clock >2 minutes ahead of server: 400 INVALID_SOS_LOCATION. A slow clock
  may receive 409 until corrected; retain last server position and show the error.
- Missing usable legacy time: 409 SOS_LOCATION_TIME_UNAVAILABLE, not a guessed time.
- Ended SOS: 409 SOS_NOT_ACTIVE. Stop that SOS uploader and refresh.
- Offline means retain last Backend-received point/time. Reconnect resumes sending
  newer samples while active; an old queued sample cannot overwrite a new point.
- Initial position stays immutable. Only initial/latest stored; no route tracking.
- GPS and completion share transactional request reads: an in-flight GPS update
  cannot move an SOS after completion, including during retry.

Resident targets ~30s uploads when device can get/transmit location. This Backend
PR does not implement Android background-location behavior. Thiên owns uploader,
permissions and lifecycle handling; do not promise exact 30s delivery when Android
suspends/kills the app. Backend never closes an SOS due to inactivity alone.

## Confirm đã cứu

`PATCH /api/rescue-requests/:requestId/status` — active Rescue only.

```json
{ "status": "assisted" }
```

Optional note is string/null, trimmed, <=200 UTF-16 units. No other target status
or caller-supplied confirmer/time accepted. Any active Rescue may complete an
active SOS after actually rescuing; no assignment/assignee match prerequisite.

HTTP 200: `{success:true,message,data:{rescueRequest:{...},assignment:null}}`.
Transaction commits status, completedBy (JWT user), completedAt (server), history,
audit, notification and queued delivery log, plus matching lock release together.
Missing/inactive Resident owner does not prevent rescue; no notification is sent
to an unrelated account. This records Rescue's declaration, not external proof.

Repeat/concurrent completion returns 409 STATUS_TRANSITION_CONFLICT; read detail
to see true confirmer/time. Timeout/500 never justifies showing local success.

## Legacy storage and old API

Collections reused: rescue_requests, rescue_request_status_history, notifications,
notification_delivery_logs, audit_logs. New records contain schemaVersion=2.
New lock collection: active_sos_requests/{sha256(residentId)}, with residentId and
requestId only. Creation/completion write/release it in the same transaction.
Creation also queries the Resident's legacy SOS inside the transaction, so an
unlocked pre-migration active SOS still prevents duplicates. A stale lock can be
replaced only after that query finds no active SOS.

No bulk migration/deletion of old requests/assignments/history. Legacy active SOS
can be completed directly; stored assignments remain historical metadata.
POST `/:requestId/accept` is retained only for legacy records and returns 409 for
schemaVersion=2. PATCH status now accepts only assisted; old clients expecting
in_progress must migrate. No silent return to multi-step workflow.
Trusted legacy CRUD/fixture helpers remain for old tools; live SOS creation must
use createSosWithHistory, not bypass the lock through direct DB writes.

## Errors and client behavior

Business errors: `{success:false,message,code}`. Auth middleware may return just
success/message. Unexpected DB errors return 500 without raw error in response.

| HTTP | Meaning / codes |
|---|---|
| 400 | INVALID_SOS_INPUT, INVALID_SOS_LOCATION, INVALID_SOS_REQUEST_ID, INVALID_STATUS_REQUEST_ID, INVALID_STATUS_UPDATE, INVALID_RESCUE_REQUEST_FILTER, INVALID_ADMIN_SOS_QUERY |
| 401 | Missing/expired JWT or removed user; SOS_AUTH_REQUIRED, SOS_USER_NOT_FOUND, STATUS_AUTH_REQUIRED, STATUS_USER_NOT_FOUND |
| 403 | Wrong role/inactive account/wrong owner; SOS_ROLE_FORBIDDEN, SOS_OWNER_FORBIDDEN, STATUS_ACCOUNT_INACTIVE, STATUS_ROLE_FORBIDDEN |
| 404 | SOS_REQUEST_NOT_FOUND, STATUS_REQUEST_NOT_FOUND, ADMIN_SOS_REQUEST_NOT_FOUND |
| 409 | DUPLICATE_SOS_REQUEST (activeRequestId), STALE_SOS_LOCATION, SOS_NOT_ACTIVE, SOS_LOCATION_TIME_UNAVAILABLE, STATUS_TRANSITION_CONFLICT, ACCEPT_REQUEST_UNAVAILABLE |
| 500 | Internal/DB failure; retain input/displayed data, retry/reconcile explicitly |

Discard stale GPS but continue fresh captures; stop uploads specifically when SOS
is ended, not for every 409. UI errors must not become fake empty/zero/success data.

## Verification and rollout

Run in **backend/** (PowerShell):

```powershell
npm.cmd ci
node .\scripts\test-sos-direct-rescue.js
node .\scripts\test-flood-map-area-types.js
```

First suite uses real routes/controllers/services, local HTTP/JWT and a
transactional in-memory substitute; no .env/key or real Firebase required.
It checks form, authorization, parallel create/complete, stale GPS, both
GPS/completion races, legacy records, lock release, audit/notification and Admin.

Optional Firestore Emulator test (start loopback Emulator first):

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:GCLOUD_PROJECT = "demo-floodguard-sos"
node --test .\tests\sos-status-notification.firestore-emulator.test.js
```

It skips unless exactly that host/project is configured; no production key.

Before merge/deploy coordinate clients: Thiên removes required urgency in response
DTO and adds GPS uploads; Khoa stops accept/in_progress on new SOS; Huy consumes
state/new summary. Independent UI development may use explicitly labeled mocks.
Then test real devices against isolated Firebase: create → GPS/offline/reconnect →
confirm → active pin gone → Resident/Admin/history agree. Only Phú merges/deploys.
