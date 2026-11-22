// Deliberately read-only. No reset/retry operation, no token/GPS/user/credential output.
require("dotenv").config({ quiet: true });
async function main() {
  const id = process.argv[2];
  if (process.argv.length !== 3 || !/^[a-f0-9]{64}$/.test(id || "")) throw new Error("Usage: node scripts/inspect-warning-v2-push.js <targetId64hex>");
  const { db } = require("../src/config/firebase");
  const { PUSH_COLLECTIONS } = require("../src/services/warning-v2-push-sender.service");
  const saved = await db.collection(PUSH_COLLECTIONS.targets).doc(id).get();
  if (!saved.exists) { console.log(JSON.stringify({ targetId: id, found: false })); return; }
  const data = saved.data(), out = { targetId: id, found: true };
  for (const key of ["status", "terminal", "attempts", "code", "control"]) if (data[key] !== undefined) out[key] = data[key];
  for (const key of ["createdAt", "updatedAt", "nextAttemptAt", "sendStartedAt", "leaseUntil"]) {
    if (data[key]?.toDate) out[key] = data[key].toDate().toISOString();
  }
  console.log(JSON.stringify(out, null, 2));
}
if (require.main === module) main().catch(() => { console.error("Warning V2 push inspection failed; no data changed"); process.exitCode = 1; });
