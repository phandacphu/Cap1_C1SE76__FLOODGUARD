# SOS Backend v2 — validation and handoff (2026-11-08)

Branch: feature/sos-direct-rescue-backend
Baseline: develop / 12f20f1 (PR #117)

## Implemented

- Current Resident payload accepted, strict validation, no urgency input/output.
- Direct Rescue completion with live account checks and JWT-derived confirmer.
- Transactional per-Resident active lock, with checks against active legacy SOS.
- Owner-only GPS endpoint, capture/receipt timestamps, stale rejection,
  initial-position preservation and serialization against completion.
- Common response fields/state/date filters for Resident, Rescue and Admin.
- Read-only Admin summary: total/active/rescued/legacyOther and raw byStatus.
- Atomic completion history, audit, notification/queued log and lock release.
- New records cannot enter old acceptance/in-progress workflow. Legacy records,
  assignments and history preserved; active legacy requests can be completed.

## Checks actually executed

- Dedicated isolated SOS suite: **51/51 Node test entries passed**.
  Command: node scripts/test-sos-direct-rescue.js (from backend/).
- Broader isolated Backend regression: **111/111 Node test entries passed** across
  46 test files. Includes the SOS cases above; do not add counts together.
- Existing flood-map area-types suite: **17/17 entries passed**.
- git diff --check: passed. No Web/Mobile/deployment configuration edits.
- Mock HTTP test exercised actual Resident create -> Rescue active list -> GPS
  update -> completion -> active list empty -> Resident/Admin detail/history.
- Other tested cases: malformed payload, wrong/inactive/deleted user, foreign
  ownership, live permission revocation on retry, duplicate create, competing
  completion, older GPS, offline queue ordering, both completion/GPS race orders,
  atomic rollback, new creation after completion, missing notification owner,
  legacy state mapping and matching list/summary date filters.

## Boundaries of this result

- Tests used local HTTP/JWT and in-memory Firestore substitutes; no live SOS
  records, production Firebase, Render or real phone were modified.
- Firestore Emulator test was rewritten for v2 and is opt-in. It was **not run**
  here: default execution reports one skipped test because no local Emulator is
  configured. Do not report Emulator PASS from this result.
- Eight old standalone tests requiring real Firebase configuration were excluded
  from the broader isolated run: firebase, email-phone-login, logout,
  flood-alert.service, rescue-request-status-history.service,
  rescue-request.service, safe-location.service, user.service.
- Mobile background GPS, device permissions, UI and final integration acceptance
  remain client/device work. No claim that SOS is ready for production deployment.

## Next integration step

Use backend/docs/sos-direct-rescue-api.md as the common contract. Coordinate
response DTO/filter/summary changes with Thiên/Huy/Khoa, then run on isolated
Firebase and real devices. Preserve current map and unrelated modules. Only Phú
merges/deploys after review and integration acceptance.

The GitHub connector rejected branch creation with HTTP 403 (Resource not
accessible by integration). No remote branch/PR/merge/deployment was created by
this session. The accompanying bundle is the concrete local branch for Phú to
import, review and push using Phú's normal Git access.
