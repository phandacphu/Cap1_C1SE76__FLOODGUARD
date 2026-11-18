# Rescue Web – Lịch sử cứu hộ

Base: develop `5a9f777`. Branch: `feature/rescue-history-ui`.

## Delivered

- Protected Rescue route `/rescue/history` and existing sidebar item enabled.
- List-first UI: All rescued / Confirmed by me, loaded-data search, completion dates in Vietnam time and completion-time sorting.
- Server `completedBy` ID and `completedAt`; no invented actor names/time, contact details, urgency or assignment workflow.
- Missing-location SOS remain in table. Optional existing SOS map uses the same filtered records and valid latest coordinates.
- Exact-ID detail with return to history, existing events and confirmation recovery logic retained.
- Responsive grid and shorter labels for SOS list filters; existing groups/map/list behavior retained.

Shared edits: `web/src/App.tsx`, `web/src/components/layout/navConfig.ts`. No Admin, Backend, Mobile or authentication changes.

## API and date semantics

Existing authenticated `GET rescue-requests?state=rescued&sort=newest` via `useRescueRequests` and its visibility-aware polling, stale data and session safeguards.

Search, actor filter, sorting and completion dates operate on loaded results. Backend `from/to` mean creation dates and are deliberately NOT sent for completion filtering. Missing completion dates remain visible without a range, and are excluded when a range is applied. Missing actors never become the current user.

Detail reuses `GET rescue-requests/:id`, including embedded `statusHistory`. No new endpoint, duplicate history polling, mock fallback or new write action. Base URL uses existing configuration; do not duplicate `/api`.

## Validation – 2026-11-18

Node 24.22.1, TypeScript 6, Vite 8.3.1.

- ESLint PASS; production build PASS (existing >500 kB JS bundle warning remains).
- Entire Web suite: 117 tests, 113 PASS, 4 SKIP, 0 FAIL.
- Seven new tests cover state separation, Vietnam completion boundaries, exact actor identity, completion sort/null handling, search/range, rendered table escaping/missing GPS/zero people, error versus empty and stale retention.
- Existing SOS completion/session/race regressions PASS; harness supplies the new query hook for detail navigation.
- Four SKIPs require captured Render payloads supplied through existing environment options; these are not claimed as live API passes.
- `git diff --check` PASS.

Browser acceptance PENDING: Chromium could not start in this environment. No Rescue credentials supplied; no SOS changed on Render. Figma retrieval failed; layout review used the supplied screenshot/current source, not all Figma frames.

## Browser handoff checklist

1. Rescue login → history. Network requests `state=rescued&sort=newest`, no Admin/flood-history layers.
2. Cross-check agreed TEST ID, actor ID, completion time, latest coordinates and detail events against API.
3. Search/date/sort/mine filters; map and table IDs match, missing GPS stays listed.
4. Open/close map, collocated popup, exact-ID detail and return. Check desktop/tablet/narrow widths.
5. First load failure shows retry, not empty. Later network failure keeps labeled stale data. Check existing 401 login and 403 protected-data behavior.
6. Another Rescue completes a TEST SOS: refresh history shows it, active group removes it. Never mutate non-TEST records.

No merge/deploy performed.
