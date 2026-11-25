import L from "leaflet";
import type { ZoneGroup, ZoneBundle } from "../rescue/warnings/warningData";
import {
  visibleZones,
  ZONE_COLORS,
  zoneMetadataRows,
} from "../rescue/warnings/warningData";

export function publishedZoneStyle(group: ZoneGroup): L.PathOptions {
  return {
    color: ZONE_COLORS[group],
    fillColor: ZONE_COLORS[group],
    weight: 2.5,
    opacity: 0.95,
    fillOpacity:
      group === "current_flood"
        ? 0.4
        : group === "historical_flood"
          ? 0.12
          : 0.3,
    dashArray: group === "historical_flood" ? "8 6" : undefined,
  };
}
/** Use the existing map's GeoJSON layer group, without points/buffers or bulletin-to-area inference. */
export function drawPublishedFloodZones(
  map: L.Map,
  layerGroup: L.LayerGroup,
  bundle: ZoneBundle,
  shown: boolean,
) {
  layerGroup.clearLayers();
  map.closePopup();
  if (!shown) return;
  for (const feature of visibleZones(bundle, [
    "low_lying",
    "historical_flood",
    "current_flood",
  ])) {
    const group = feature.properties.group!;
    L.geoJSON(feature, {
      pane: `warning-${group}`,
      style: publishedZoneStyle(group),
      onEachFeature: (_feature, layer) => {
        // textContent treats names/source as text; API content can never inject markup.
        const popup = document.createElement("dl");
        popup.className = "rw-zone-metadata";
        for (const row of zoneMetadataRows(feature.properties)) {
          const pair = document.createElement("div"),
            label = document.createElement("dt"),
            value = document.createElement("dd");
          label.textContent = row.label;
          value.textContent = row.value;
          pair.append(label, value);
          popup.append(pair);
        }
        layer.bindPopup(popup, { maxWidth: 360, maxHeight: 320 });
      },
    }).addTo(layerGroup);
  }
}
