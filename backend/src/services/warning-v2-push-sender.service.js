const { randomUUID, createHash } = require("node:crypto");
const { FieldPath, FieldValue, Timestamp } = require("firebase-admin/firestore");
const c = require("./flood-warning-v2-contract");
const { WORKER_COLLECTIONS: W, ledgerId } = require("./warning-v2-event-worker.service");
const { DEVICE_COLLECTIONS: D } = require("./warning-v2-device.service");
const { evaluatePosition } = require("./warning-v2-evaluation");
const { pushMessage, sendPush } = require("./warning-v2-push-policy");

const PUSH_COLLECTIONS = Object.freeze({ targets: "warning_v2_push_targets", controls: "warning_v2_control_jobs", cursors: "warning_v2_push_cursors" });
const targetId = (jobId, installationId, bindingId) => c.hash([jobId, installationId, bindingId]);
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const stamp = () => FieldValue.serverTimestamp();
const stateOf = (data) => ({ cursor: data?.cursor ?? null, pass: data?.pass ?? 0 });
const same = (a, b) => a.cursor === b.cursor && a.pass === b.pass;
const resident = (s) => s.exists && s.data().role === "resident" && s.data().isActive === true;
function checkedAlert(s) { try { return c.clientAlert(s); } catch { return null; } }
function contextHash(matches) {
  return c.hash(matches.map(({ zoneId, group, relation, source, recordedAt }) => ({ zoneId, group, relation, source, recordedAt }))
    .sort((a, b) => a.zoneId < b.zoneId ? -1 : a.zoneId > b.zoneId ? 1 : 0));
}

// Dependencies are explicit. The SDK provider is initialized only by the opt-in scheduler.
function createWarningV2PushSender({ db, zonesService, provider, allows, clock = Date.now, batchSize = 20, leaseMs = 30000, timeoutMs = 10000 }) {
  if (typeof provider?.send !== "function" || typeof allows !== "function") throw new Error("Explicit push provider and audience policy required");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50 ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000 ||
    !Number.isSafeInteger(leaseMs) || leaseMs <= timeoutMs || leaseMs > 300000) throw new Error("Invalid push sender limits");
  const ref = (collection, id) => db.collection(collection).doc(c.documentId(id));
  const parentRef = (target) => ref(target.control ? PUSH_COLLECTIONS.controls : W.deliveries, target.jobId);
  async function page(query, state) {
    query = query.orderBy(FieldPath.documentId());
    if (state.cursor !== null) query = query.startAfter(state.cursor);
    return (await query.limit(batchSize).get()).docs;
  }
  const next = (state, docs) => docs.length < batchSize ? { cursor: null, pass: state.pass + 1 } : { cursor: docs.at(-1).id, pass: state.pass };
  async function advance(cursorRef, state, docs, extra = {}) {
    await db.runTransaction(async (tx) => {
      const saved = await tx.get(cursorRef);
      if (!same(stateOf(saved.data()), state)) return;
      const data = { ...next(state, docs), ...extra, updatedAt: stamp() };
      if (saved.exists) tx.update(cursorRef, data); else tx.create(cursorRef, data);
    });
  }
  async function scan(name, query, handler) {
    const cursorRef = ref(PUSH_COLLECTIONS.cursors, `scan_${name}`), state = stateOf((await cursorRef.get()).data());
    const docs = await page(query, state);
    for (const doc of docs) await handler(doc.id);
    await advance(cursorRef, state, docs);
  }
  async function guard(tx, job, { device = null, installationId = null, zones = null } = {}) {
    const alert = checkedAlert(await tx.get(ref(W.alerts, job.alertId)));
    if (!alert || (job.kind === "deactivated" ? alert.status !== "inactive" : alert.status !== "active")) return "alert_state_changed";
    if (!resident(await tx.get(ref("users", job.residentId)))) return "recipient_ineligible";
    if (job.kind === "near" && (await tx.get(ref(W.ledger, ledgerId(job.residentId, job.alertId)))).data()?.inside) return "inside_recorded";
    if (!device) return null;
    if (!device.active || device.ownerId !== job.residentId || device.platform !== "android" ||
      device.notificationPermission !== "granted" || typeof device.fcmToken !== "string" || !device.fcmToken) return "device_ineligible";
    const claim = (await tx.get(ref(D.tokens, tokenHash(device.fcmToken)))).data();
    if (!claim?.active || claim.installationId !== installationId || claim.bindingId !== device.bindingId) return "token_claim_changed";
    if (["near", "inside"].includes(job.kind)) {
      if (job.origin?.installationId !== installationId || job.origin?.bindingId !== device.bindingId) return "device_binding_changed";
      const sample = (await tx.get(ref(D.locations, installationId))).data();
      if (!sample || sample.ownerId !== job.residentId || sample.bindingId !== device.bindingId) return "location_binding_changed";
      const evaluation = evaluatePosition({ sample, zones, activeAlertIds: [job.alertId], now: clock(), installationId, bindingId: device.bindingId });
      if (evaluation.status !== job.kind || contextHash(evaluation.matches) !== job.context?.matchesHash) return "location_no_longer_eligible";
    }
    return null;
  }
  async function prepareControl(eventId) {
    const eventRef = ref(W.events, eventId), event = (await eventRef.get()).data();
    if (event?.kind !== "deactivated" || event.status !== "prepared") return;
    const state = stateOf(event.pushFanout), docs = await page(db.collection(W.ledger).where("alertId", "==", event.alertId), state);
    for (const receipt of docs) {
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(eventRef)).data();
        if (current?.status !== "prepared" || !same(stateOf(current.pushFanout), state)) return;
        const ledger = (await tx.get(ref(W.ledger, receipt.id))).data();
        // Preparation is not transmission: retain non-test users' jobs for a later live rollout.
        if (!ledger || ledger.alertId !== event.alertId) return;
        const id = c.hash([ledger.residentId, event.alertId, "deactivated"]), jobRef = ref(PUSH_COLLECTIONS.controls, id);
        const saved = await tx.get(jobRef);
        const job = { schemaVersion: 2, eventId: id, residentId: ledger.residentId, alertId: event.alertId,
          kind: "deactivated", payload: { title: "", body: "" }, status: "pending", createdAt: current.createdAt };
        if (await guard(tx, job)) return;
        if (!saved.exists) tx.create(jobRef, job);
      });
    }
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(eventRef)).data();
      if (current?.status !== "prepared" || !same(stateOf(current.pushFanout), state)) return;
      tx.update(eventRef, { pushFanout: next(state, docs), ...(docs.length < batchSize ? { status: "control_prepared" } : {}) });
    });
  }
  async function prepareJob(jobId, control = false) {
    const jobRef = ref(control ? PUSH_COLLECTIONS.controls : W.deliveries, jobId), job = (await jobRef.get()).data();
    if (!job || job.status !== "pending" || !allows(job.residentId)) return;
    const state = stateOf(job.pushFanout);
    // Location wording belongs to the generating installation, not a second device elsewhere.
    const locationKind = ["near", "inside"].includes(job.kind);
    const docs = locationKind ? [await ref(D.devices, job.origin.installationId).get()] :
      await page(db.collection(D.devices).where("ownerId", "==", job.residentId).where("active", "==", true), state);
    let eligible = false;
    for (const candidate of docs) {
      if (!candidate.exists) continue;
      const created = await db.runTransaction(async (tx) => {
        const current = (await tx.get(jobRef)).data();
        if (current?.status !== "pending" || !same(stateOf(current.pushFanout), state)) return false;
        const device = (await tx.get(ref(D.devices, candidate.id))).data();
        if (!device?.bindingId) return false;
        const targetRef = ref(PUSH_COLLECTIONS.targets, targetId(jobId, candidate.id, device.bindingId)), saved = await tx.get(targetRef);
        // Actual GPS/zone eligibility is checked immediately before each provider call.
        if (await guard(tx, current)) return false;
        if (!device.active || device.ownerId !== current.residentId || device.platform !== "android" ||
          device.notificationPermission !== "granted" || !device.fcmToken) return false;
        if (locationKind && device.bindingId !== current.origin.bindingId) return false;
        if (!saved.exists) tx.create(targetRef, { schemaVersion: 2, jobId, control, residentId: current.residentId,
          installationId: candidate.id, bindingId: device.bindingId, status: "pending", terminal: false, attempts: 0, createdAt: stamp() });
        return true;
      });
      eligible ||= created;
    }
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(jobRef)).data();
      if (current?.status !== "pending" || !same(stateOf(current.pushFanout), state)) return;
      const reason = await guard(tx, current);
      if (reason) { tx.update(jobRef, { status: "canceled", cancellationReason: reason, canceledAt: stamp() }); return; }
      const hadTarget = current.hasPushTargets === true || eligible, finished = locationKind || docs.length < batchSize;
      // General without a usable installation stays discoverable for later registration/permission.
      tx.update(jobRef, { pushFanout: locationKind ? { cursor: null, pass: state.pass + 1 } : next(state, docs),
        hasPushTargets: hadTarget, ...(finished && hadTarget ? { status: "dispatched", dispatchedAt: stamp() } : {}) });
    });
  }
  async function acquire(targetRef) {
    const leaseId = randomUUID();
    return db.runTransaction(async (tx) => {
      const target = (await tx.get(targetRef)).data();
      if (!target || target.terminal || !allows(target.residentId)) return null;
      if (["leased", "sending"].includes(target.status) && target.leaseUntil?.toMillis() > clock()) return null;
      if (target.status === "sending") {
        tx.update(targetRef, { status: "unknown", terminal: true, code: "SENDING_LEASE_EXPIRED", updatedAt: stamp() }); return null;
      }
      if (target.nextAttemptAt?.toMillis() > clock()) return null;
      tx.update(targetRef, { status: "leased", leaseId, leaseUntil: Timestamp.fromMillis(clock() + leaseMs), updatedAt: stamp() });
      return leaseId;
    });
  }
  async function dispatch(targetId) {
    const targetRef = ref(PUSH_COLLECTIONS.targets, targetId), leaseId = await acquire(targetRef);
    if (!leaseId) return;
    let message;
    try {
      const initial = (await targetRef.get()).data(), job = (await parentRef(initial).get()).data();
      const zones = job && ["near", "inside"].includes(job.kind) ? await zonesService.load() : null;
      message = await db.runTransaction(async (tx) => {
        const target = (await tx.get(targetRef)).data();
        if (target?.status !== "leased" || target.leaseId !== leaseId || target.leaseUntil.toMillis() <= clock()) return null;
        const current = (await tx.get(parentRef(target))).data(), device = (await tx.get(ref(D.devices, target.installationId))).data();
        let reason = !current || current.status === "canceled" ? "job_canceled" :
          !device || device.bindingId !== target.bindingId ? "device_binding_changed" : null;
        if (!reason) reason = await guard(tx, current, { device, installationId: target.installationId, zones });
        if (reason) { tx.update(targetRef, { status: "canceled", terminal: true, code: reason, updatedAt: stamp() }); return null; }
        const value = pushMessage(current, target, device.fcmToken, clock());
        tx.update(targetRef, { status: "sending", attempts: target.attempts + 1, tokenHash: tokenHash(device.fcmToken), sendStartedAt: stamp() });
        return value;
      });
    } catch {
      // Nothing reached the provider. Keep bounded backoff and do not disclose raw DB/location errors.
      await db.runTransaction(async (tx) => {
        const target = (await tx.get(targetRef)).data();
        if (target?.status === "leased" && target.leaseId === leaseId) tx.update(targetRef, {
          status: "retry", code: "PREFLIGHT_UNAVAILABLE", nextAttemptAt: Timestamp.fromMillis(clock() + 60000), updatedAt: stamp() });
      });
      return;
    }
    if (!message) return;
    const outcome = await sendPush(provider, message, timeoutMs);
    // If this commit fails after provider acceptance, leave sending: recovery turns it unknown, never auto-resend.
    await db.runTransaction(async (tx) => {
      const target = (await tx.get(targetRef)).data();
      if (target?.status !== "sending" || target.leaseId !== leaseId) return;
      let status = outcome.status;
      if (status === "retry" && target.attempts >= 5) status = "failed";
      const deviceRef = ref(D.devices, target.installationId), device = outcome.invalidToken ? (await tx.get(deviceRef)).data() : null;
      const claimRef = outcome.invalidToken ? ref(D.tokens, tokenHash(message.token)) : null;
      const claim = claimRef ? (await tx.get(claimRef)).data() : null;
      if (device?.bindingId === target.bindingId && device.fcmToken === message.token) {
        tx.update(deviceRef, { fcmToken: null, revision: device.revision + 1, lastMutationHash: null, updatedAt: stamp() });
        if (claim?.installationId === target.installationId && claim.bindingId === target.bindingId) tx.update(claimRef, { active: false, bindingId: null, updatedAt: stamp() });
      }
      tx.update(targetRef, { status, terminal: status !== "retry", code: outcome.code, updatedAt: stamp(),
        ...(status === "retry" ? { nextAttemptAt: Timestamp.fromMillis(clock() + Math.max(60000 * 2 ** (target.attempts - 1), outcome.retryAfterMs || 0)) } : {}) });
    });
  }
  async function tick() {
    const failedScans = [];
    const scans = [
      ["control_events", db.collection(W.events).where("status", "==", "prepared"), prepareControl],
      ["jobs", db.collection(W.deliveries).where("status", "==", "pending"), (id) => prepareJob(id)],
      ["controls", db.collection(PUSH_COLLECTIONS.controls).where("status", "==", "pending"), (id) => prepareJob(id, true)],
      ["targets", db.collection(PUSH_COLLECTIONS.targets).where("terminal", "==", false), dispatch],
    ];
    for (const [name, query, handler] of scans) { try { await scan(name, query, handler); } catch { failedScans.push(name); } }
    return { failedScans };
  }
  return { prepareControl, prepareJob, dispatch, tick };
}
module.exports = { createWarningV2PushSender, PUSH_COLLECTIONS, targetId };
