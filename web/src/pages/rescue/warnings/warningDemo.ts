import fixtures from "./warningFixtures.json";
import {
  parseWarningList,
  filterWarnings,
  parseWarningDetail,
  parseZoneBundle,
  WarningReadError,
} from "./warningData";
import type { RescueWarningSource } from "./warningData";

// Explicit DEV-only fixture source, never an automatic fallback after HTTP failure.
// The factory also permits deterministic failure/empty/race tests without adding product controls.
export function createRescueWarningDemo(delay = 250): RescueWarningSource {
  async function wait(signal: AbortSignal) {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const timer = setTimeout(finish, delay);
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
    });
    signal.throwIfAborted();
  }
  return {
    demo: true,
    async list(signal, filters = {}) {
      await wait(signal);
      return filterWarnings(
        parseWarningList(structuredClone(fixtures.list)),
        filters.status ?? "all",
        filters.q ?? "",
      );
    },
    async active(signal) {
      await wait(signal);
      return filterWarnings(
        parseWarningList(structuredClone(fixtures.list)),
        "active",
        "",
      );
    },
    async detail(id, signal) {
      await wait(signal);
      const item = parseWarningList(structuredClone(fixtures.list)).find(
        (item) => item.id === id,
      );
      if (!item)
        throw new WarningReadError("Không tìm thấy bản tin này (404).", 404);
      return parseWarningDetail(
        {
          success: true,
          data: { floodAlert: item, serverTime: fixtures.list.data.serverTime },
        },
        id,
      );
    },
    async zones(signal) {
      await wait(signal);
      return parseZoneBundle(structuredClone(fixtures.zones));
    },
  };
}
export const rescueWarningDemo = createRescueWarningDemo();
