import { AREA_TYPE_COLOR } from '../admin/flood-area/floodAreaTypes';
import L from 'leaflet';

export const historicalFloodIcon = L.divIcon({
  className: 'historical-flood-pin',
  html: `<svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true"><path d="M12 30C9 25 2 17 2 11a10 10 0 0 1 20 0c0 6-7 14-10 19Z" fill="${AREA_TYPE_COLOR.low_lying}" stroke="white" stroke-width="2"/><circle cx="12" cy="11" r="3.5" fill="white"/></svg>`,
  iconSize: [24, 32],
  iconAnchor: [12, 30],
});
