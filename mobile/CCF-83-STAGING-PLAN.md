# CCF-83 — Proposal for isolated E2E SOS testing (approval required)

## Scope at commit 4037ed2 and this patch
- Repository/Create SOS DTOs/Retrofit/Bearer token handling and ViewModel's `submitSos()` are testable.
- Production SOS button remains **Demo** and does not call `submitSos()`.
- This patch does **not** enable a real SOS endpoint, change `AppConfig.BASE_URL`, or alter the API request contract.

## Required approvals and safeguards BEFORE enabling E2E
1. Leader/Backend owner provides a dedicated staging host with distinct credentials and an independent staging database (no shared writes to production).
2. Staging rescue requests must not flow into real dispatch queues, SMS, push notifications, response dashboards, escalation or third-party/webhook automation. Backend owner verifies this separation end-to-end.
3. Mobile staging build variant points to staging only. Default/debug/release builds should remain Demo until approved; no URL switching via user input and no embedded production test credentials.
4. Provision a clearly labeled resident test account, test rescue-staff account, and recognizable dummy SOS data. Test locations must not be interpreted as real emergencies.
5. Confirm that real responders cannot receive, search or act on staging SOS requests. Restrict staging access and define test-data cleanup with the Backend owner.
6. Test: 201 with valid ID, 400/401/403/409/500, offline/timeout, malformed 201, rapid taps, form locking, GPS expires between validation and POST, and SOS history read-back on staging.
7. After timeout/invalid 201, do not automatically retry a POST; check history/status first to avoid duplicates.
8. Keep production submission disabled unless there is a separate explicit release authorization and safety verification.

## Contract gap — situation and water level
- Current Backend Create SOS contract accepts only `location`, `urgency`, `numberOfPeople`, and optional `note`.
- The UI collects `selectedSituations` and `waterLevel`, but the current request does not transmit these.
- **Proposal A (approval needed):** define an agreed, clearly labeled format within the optional 200-character `note` while respecting any backend length and sanitization rules; clarify how user note truncation or missing data will be handled.
- **Proposal B:** create a separate Backend/API contract-change task for explicit `situations` and `waterLevel` fields and update both sides together.
- Do not silently modify the contract or claim those fields are transmitted today.

## Acceptance / evidence
- Gradle `:app:testDebugUnitTest --rerun-tasks`, `:app:assembleDebug`, `git diff --check origin/develop...HEAD` must pass locally.
- Inspect XML report for new tests and provide logs.
- Recheck CCF-81/82 GPS flow on Xiaomi and SOS history screen after this patch.
- Supply a new commit SHA with PR #95. No merge until the Leader decides on the E2E scope.
