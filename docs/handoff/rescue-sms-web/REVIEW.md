# Rescue Web — SOS nguồn SMS

Branch: `feat/khoa-rescue-sms-source`.
Base develop: `2698b3826662ef6bde9116f329d4e231a858026b`.
Backend contract: PR #152, docs/handoff/sos-sms/01_API_VA_MAU_SMS.md.
The implementation commit is the commit containing this file (`git rev-parse HEAD`).

## Behavior

- Existing SOS list keeps state filters and newest ordering; each record shows Qua SMS, Qua ứng dụng or Không rõ nguồn.
- Adapter retains normalized source, smsSenderPhone and smsReceivedAt. Missing/unknown source remains unknown, never inferred from phone.
- Detail labels SMS sender separately from profile/verified account phone; SMS reception, initial/latest coordinates and capture/receipt times stay distinct. SMS rows with missing metadata are hidden.
- Existing list/detail maps and latest backend coordinates are reused. Popup includes intake channel. List reports requests without valid positions; no synthetic coordinates are created.
- Existing assisted PATCH, duplicate guard, conflict reconciliation and error handling remain in use. Detail local action state additionally resets on auth-token changes, as well as SOS ID changes.
- No new source query, Gateway API, secrets, direct Firestore access or Backend changes.

## Validation

| Check | Result | Evidence / limits |
| --- | --- | --- |
| ESLint | PASS | npm run lint |
| TypeScript + Vite production build | PASS | npm run build; existing large JS chunk warning remains |
| All Web .mjs/.cjs tests | PASS | 200 passed, 4 skipped, 0 failures |
| SMS/API/legacy parser and detail markup | PASS | rescue-direct.test.cjs; phone escaping, null metadata, GMT+7, coordinate order, unchanged query and Bearer token |
| Exact-ID navigation and existing map popup | PASS (fixture browser) | List/detail/map screenshots; two valid markers, missing position omitted |
| Completion updates detail/list, removes active action | PASS (fixture browser) | One mocked assisted PATCH; completed SMS in rescued list |
| Network vs empty, late read/write, auth errors, duplicate/conflict recovery | PASS (controlled automated tests) | Existing rescue-direct suite; not a real multi-device run |
| Flood warnings, map data, Safe Locations regression | PASS (automated) | Full Web test suite; not a live end-to-end session |
| Render Rescue account / historical case 82QoOMAqbZUxwu7rssqK | NOT TESTED | No real Rescue session available in this workspace; case was not changed |
| Real MapTiler background | NOT TESTED | No local map key configured here; screenshot background is gray |
| Live concurrent rescuers, live new SOS creation/completion | NOT TESTED | Requires agreement with Phú; no Backend writes performed |

All provided SMS screenshots use controlled fixtures, with a masked placeholder sender phone and a TEST ONLY account. No screenshot proves live Render behavior. Existing four skipped tests remain skipped; see full test log for names. No merge/deploy.

## Files

- web/src/types/rescueDirect.ts
- web/src/api/rescueDirectContract.ts
- web/src/pages/rescue/sosDirect.ts
- web/src/pages/rescue/RescueSosList.tsx
- web/src/pages/rescue/RescueSosDetail.tsx
- web/src/pages/rescue/components/DirectSosFacts.tsx
- web/src/pages/rescue/components/DirectSosMap.tsx
- web/src/pages/rescue/components/SosOperationsMap.tsx
- web/tests/rescue-direct.test.cjs
- docs/handoff/rescue-sms-web/REVIEW.md

## Local real-data acceptance (read-only)

1. Check HEAD and git status; preserve all existing modifications. Configure API base/MapTiler key locally without committing credentials, disable any warning fixture flag for live warning checks, and sign in as Rescue.
2. Open the existing SOS list. Inspect Network GET rescue-requests to confirm Render host, 200 and Authorization present; never share token. Open known SMS case through Đã cứu when API still provides it.
3. Compare exact ID, source, sender, SMS received time and initial/latest positions against response. Inspect map popup. Mask phone/resident identity in evidence.
4. Refresh list/detail. Verify ordinary API SOS and legacy unknown source. Record actual values/results; do not claim unavailable cases passed.
5. New real SOS or completion/concurrent-action tests require Phú agreement first. Keep historic completed SMS rescued.
6. Attach live evidence separately from fixture evidence in PR; request review only, no merge/deploy.
