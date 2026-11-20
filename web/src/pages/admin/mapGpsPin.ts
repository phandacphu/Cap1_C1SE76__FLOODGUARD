import L from "leaflet";

/** A map pin whose tip, rather than its center, indicates the actual coordinates. */
export function mapGpsPin(color: "red" | "green", selected = false): L.DivIcon {
  const width = selected ? 34 : 28;
  const height = selected ? 44 : 36;
  const fill = color === "red" ? "#dc2626" : "#16a34a";

  return L.divIcon({
    className: "fg-map-gps-pin",
    html: `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 32" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">
      <path d="M12 30S2 19.5 2 12a10 10 0 0 1 20 0c0 7.5-10 18-10 18Z" fill="${fill}" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>
      <circle cx="12" cy="12" r="4" fill="#fff"/>
      <circle cx="12" cy="12" r="1.5" fill="${fill}"/>
    </svg>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 6],
    tooltipAnchor: [0, -height + 6],
  });
}
