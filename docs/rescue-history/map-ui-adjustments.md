# Rescue map UI adjustments – 2026-11-18

- All HIST polygons now use the existing red historical color for border/fill, including records classified flood or missing classification. Metadata and popup remain unchanged. Managed current flood/low-lying area styles remain unchanged.
- Removed redundant “Xem chi tiết” buttons from the safe-location list and map popup only. Selecting a card or marker still fetches the exact ID and opens its existing information panel. SOS/history detail links remain intact.
- Safe-location circle markers replaced by green GPS/location pins; selected pin darkens. Rescuer blue circle replaced by a blue GPS crosshair. Real coordinates, IDs, camera commands and Google Maps links retained.
- Static SVG icon markup contains no API strings.

Validation: Web lint PASS; production build PASS; full Web tests 113 PASS / 4 SKIP / 0 FAIL (117 total). Skips require existing live fixtures. git diff --check PASS. Real-browser visual checks and live Render acceptance remain pending; no deployment or remote mutation performed.

Bundle includes the earlier Rescue history commit 4d1d5b9 as well as this adjustment, based on develop 5a9f777.
