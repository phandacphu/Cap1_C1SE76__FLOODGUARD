import L from "leaflet";

export const FLOOD_MAP_CENTER: L.LatLngTuple = [16.0544, 108.2022];
/** Shared Leaflet setup for full and embedded maps; preserves camera, tiles and cleanup. */
export function createFloodMapCanvas(
  container: HTMLDivElement,
  options: {
    mapTilerKey: string;
    zoom: number;
    historyPanes?: boolean;
    allowOsm?: boolean;
    onTileErrorCount: (count: number) => void;
  },
) {
  const map = L.map(container, {
    center: FLOOD_MAP_CENTER,
    zoom: options.zoom,
    zoomControl: true,
  });
  const tileLayer = options.mapTilerKey
    ? L.tileLayer(
        `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(options.mapTilerKey)}`,
        {
          tileSize: 512,
          zoomOffset: -1,
          minZoom: 1,
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
          referrerPolicy: "strict-origin-when-cross-origin",
        },
      )
    : options.allowOsm
      ? L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
        })
      : null;
  if (options.historyPanes) {
    for (const [name, zIndex, pointerEvents] of [
      ["flood-history", "390", "none"],
      ["hist-interactive", "410", "auto"],
      ["hist-points", "430", "auto"],
    ]) {
      const pane = map.createPane(name);
      pane.style.zIndex = zIndex;
      pane.style.pointerEvents = pointerEvents;
    }
  }
  const failedTiles = new Set<HTMLImageElement>();
  tileLayer?.on("tileerror", (event) => {
    failedTiles.add(event.tile as HTMLImageElement);
    options.onTileErrorCount(failedTiles.size);
  });
  const clearTile = (event: L.TileEvent) => {
    failedTiles.delete(event.tile as HTMLImageElement);
    options.onTileErrorCount(failedTiles.size);
  };
  tileLayer?.on("tileload", clearTile);
  tileLayer?.on("tileunload", clearTile);
  const retryTiles = () => {
    map.invalidateSize();
    tileLayer?.redraw();
  };
  window.addEventListener("online", retryTiles);
  tileLayer?.addTo(map);
  const polygons = L.layerGroup().addTo(map);
  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(container);
  return {
    map,
    tileLayer,
    polygons,
    retryTiles,
    dispose() {
      window.removeEventListener("online", retryTiles);
      observer.disconnect();
      tileLayer?.off();
      map.remove();
    },
  };
}
