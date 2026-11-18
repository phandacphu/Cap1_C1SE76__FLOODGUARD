import L from 'leaflet';

// Static SVG only: names/descriptions from API never enter icon HTML.
function locationPin(selected: boolean) {
  return L.divIcon({
    className: 'catalog-location-pin',
    html: `<svg width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 40C12 34 2 23 2 15a14 14 0 1 1 28 0c0 8-10 19-14 25Z" fill="${selected ? '#15803d' : '#22c55e'}" stroke="white" stroke-width="${selected ? 3 : 2}"/><circle cx="16" cy="15" r="6" fill="none" stroke="white" stroke-width="2"/><path d="M16 6v4m0 10v4M7 15h4m10 0h4" stroke="white" stroke-width="2"/><circle cx="16" cy="15" r="2" fill="white"/></svg>`,
    iconSize: [32, 42], iconAnchor: [16, 40], popupAnchor: [0, -36],
  });
}
export const safeLocationIcon = locationPin(false);
export const selectedSafeLocationIcon = locationPin(true);
export const rescueGpsIcon = L.divIcon({
  className: 'catalog-gps-icon',
  html: '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="12" fill="white" stroke="#2563eb" stroke-width="2"/><path d="M17 1v8m0 16v8M1 17h8m16 0h8" stroke="#2563eb" stroke-width="3"/><circle cx="17" cy="17" r="5" fill="#2563eb"/></svg>',
  iconSize: [34, 34], iconAnchor: [17, 17],
});
