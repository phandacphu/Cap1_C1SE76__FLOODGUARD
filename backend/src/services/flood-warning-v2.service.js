const { FieldValue } = require("firebase-admin/firestore");
const c = require("./flood-warning-v2-contract");
const { createWarningZonesService } = require("./warning-v2-zones.service");
const { createWarningDeviceService } = require("./warning-v2-device.service");

const COLLECTIONS = Object.freeze({ alerts: "flood_alerts", requests: "flood_warning_v2_creation_requests",
  events: "flood_warning_v2_events", audit: "audit_logs" });
const READ_ROLES = Object.freeze(["resident", "rescue", "admin"]);

// The service has no implicit credentials: tests inject an isolated DB.
function createFloodWarningV2Service({ db, zonesService = createWarningZonesService({ db }) }) {
  const devices = createWarningDeviceService({ db, zonesService });
  const actorRef = (id) => db.collection("users").doc(c.documentId(id, "AUTH_REQUIRED", 401));
  const alertRef = (id) => db.collection(COLLECTIONS.alerts).doc(c.documentId(id));
  const eventRef = (id, kind) => db.collection(COLLECTIONS.events).doc(c.hash([id, kind]));
  function checkActor(snapshot, roles) {
    if (!snapshot.exists) throw c.warningError("AUTH_REQUIRED", "Account no longer exists", 401);
    const actor = snapshot.data();
    if (actor.isActive !== true) throw c.warningError("ACCOUNT_INACTIVE", "Account is inactive", 403);
    if (!roles.includes(actor.role)) throw c.warningError("ROLE_FORBIDDEN", "You do not have permission for this operation", 403);
  }
  async function authorize(actorId, roles = READ_ROLES) { checkActor(await actorRef(actorId).get(), roles); }
  function audit(tx, ref, actorId, id, action, changedFields) {
    tx.create(ref, { actor: { id: actorId, role: "admin" }, action: `flood_alert.${action}`,
      target: { type: "flood_alert", id }, metadata: { source: "api", outcome: "success", changedFields },
      timestamp: FieldValue.serverTimestamp() });
  }
  function event(id, kind, alert) {
    return { schemaVersion: 2, alertId: id, kind, alertRevision: alert.revision,
      payload: { title: alert.title, content: alert.content, scope: alert.scope },
      status: "pending", createdAt: FieldValue.serverTimestamp() };
  }
  async function list(actorId, query, admin = false) {
    await authorize(actorId, admin ? ["admin"] : READ_ROLES);
    const f = c.filters(query);
    const snapshot = await db.collection(COLLECTIONS.alerts).where("schemaVersion", "==", 2).get();
    const floodAlerts = snapshot.docs.map(c.clientAlert)
      .filter((a) => (!f.status || a.status === f.status) &&
        (!f.q || `${a.title}\n${a.content}`.toLocaleLowerCase("vi").includes(f.q)))
      .sort((a, b) => b.startAt.localeCompare(a.startAt) || a.id.localeCompare(b.id));
    return { schemaVersion: 2, floodAlerts, serverTime: new Date().toISOString() };
  }
  async function detail(actorId, id, admin = false) {
    await authorize(actorId, admin ? ["admin"] : READ_ROLES);
    return { floodAlert: c.clientAlert(await alertRef(id).get()), serverTime: new Date().toISOString() };
  }
  async function summary(actorId) {
    const { floodAlerts, serverTime } = await list(actorId, {}, true);
    return { schemaVersion: 2, total: floodAlerts.length,
      active: floodAlerts.filter((a) => a.status === "active").length,
      inactive: floodAlerts.filter((a) => a.status === "inactive").length, serverTime };
  }
  async function create(actorId, key, body) {
    await authorize(actorId, ["admin"]);
    const requestId = c.requestId(key), data = c.createBody(body), bodyHash = c.hash(data);
    const requestRef = db.collection(COLLECTIONS.requests).doc(c.hash([actorId, requestId]));
    // Allocate once outside retryable callbacks.
    const newRef = db.collection(COLLECTIONS.alerts).doc(), auditRef = db.collection(COLLECTIONS.audit).doc();
    const result = await db.runTransaction(async (tx) => {
      checkActor(await tx.get(actorRef(actorId)), ["admin"]);
      const previous = await tx.get(requestRef);
      if (previous.exists) {
        const saved = previous.data();
        if (saved.actorId !== actorId || saved.requestId !== requestId || saved.bodyHash !== bodyHash) {
          throw c.warningError("IDEMPOTENCY_CONFLICT", "Request key was used for different content", 409);
        }
        const found = await tx.get(alertRef(saved.alertId));
        if (!found.exists || found.data().schemaVersion !== 2) throw new Error("Creation receipt has no V2 warning");
        return { id: saved.alertId, replayed: true };
      }
      const alert = { ...data, schemaVersion: 2, scope: "all_published_zones", status: "active",
        startAt: FieldValue.serverTimestamp(), endAt: null, createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(), revision: 1 };
      tx.create(newRef, alert);
      tx.create(requestRef, { actorId, requestId, bodyHash, alertId: newRef.id, createdAt: FieldValue.serverTimestamp() });
      tx.create(eventRef(newRef.id, "general"), event(newRef.id, "general", alert));
      audit(tx, auditRef, actorId, newRef.id, "create", ["title", "content", "status", "startAt"]);
      return { id: newRef.id, replayed: false };
    });
    const floodAlert = c.clientAlert(await alertRef(result.id).get());
    return { floodAlert, idempotency: { requestId, replayed: result.replayed },
      broadcast: { status: floodAlert.status === "active" ? "queued" : "canceled" } };
  }
  async function creationRequest(actorId, key) {
    await authorize(actorId, ["admin"]);
    const requestId = c.requestId(key);
    const ref = db.collection(COLLECTIONS.requests).doc(c.hash([actorId, requestId]));
    return db.runTransaction(async (tx) => {
      checkActor(await tx.get(actorRef(actorId)), ["admin"]);
      const saved = await tx.get(ref);
      if (!saved.exists || saved.data().actorId !== actorId || saved.data().requestId !== requestId) {
        throw c.warningError("CREATION_REQUEST_NOT_FOUND", "Creation result is not recorded", 404);
      }
      return { requestId, floodAlert: c.clientAlert(await tx.get(alertRef(saved.data().alertId))) };
    });
  }
  async function update(actorId, id, body) {
    await authorize(actorId, ["admin"]);
    const ref = alertRef(id), { expectedRevision, patch } = c.patchBody(body);
    const auditRef = db.collection(COLLECTIONS.audit).doc();
    await db.runTransaction(async (tx) => {
      checkActor(await tx.get(actorRef(actorId)), ["admin"]);
      const current = c.clientAlert(await tx.get(ref));
      if (current.status !== "active") throw c.warningError("ALERT_ALREADY_INACTIVE", "Warning is already inactive", 409);
      if (current.revision !== expectedRevision) throw c.warningError("ALERT_REVISION_CONFLICT", "Warning was changed; reload before editing", 409);
      const changedFields = Object.keys(patch).filter((field) => patch[field] !== current[field]);
      if (!changedFields.length) return;
      const changes = Object.fromEntries(changedFields.map((field) => [field, patch[field]]));
      tx.update(ref, { ...changes, revision: current.revision + 1, updatedAt: FieldValue.serverTimestamp() });
      audit(tx, auditRef, actorId, ref.id, "update", changedFields);
    });
    return { floodAlert: c.clientAlert(await ref.get()) };
  }
  async function deactivate(actorId, id, body) {
    await authorize(actorId, ["admin"]);
    c.emptyBody(body);
    const ref = alertRef(id), auditRef = db.collection(COLLECTIONS.audit).doc();
    const changed = await db.runTransaction(async (tx) => {
      checkActor(await tx.get(actorRef(actorId)), ["admin"]);
      const current = c.clientAlert(await tx.get(ref));
      if (current.status === "inactive") return false;
      const generalRef = eventRef(ref.id, "general"), general = await tx.get(generalRef);
      tx.update(ref, { status: "inactive", endAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(), revision: current.revision + 1 });
      if (general.exists && ["pending", "processing"].includes(general.data().status)) {
        tx.update(generalRef, { status: "canceled", canceledAt: FieldValue.serverTimestamp() });
      }
      tx.create(eventRef(ref.id, "deactivated"), event(ref.id, "deactivated", { ...current, revision: current.revision + 1 }));
      audit(tx, auditRef, actorId, ref.id, "deactivate", ["status", "endAt"]);
      return true;
    });
    return { floodAlert: c.clientAlert(await ref.get()), changed };
  }
  async function zones(actorId) {
    await authorize(actorId, READ_ROLES);
    const result = await zonesService.load();
    // Known records with bad/missing outlines still have useful names/diagnostics for the UI.
    if (result.coverage.status === "unavailable" && result.coverage.totalZones === 0) {
      throw c.warningError("ZONE_DATA_UNAVAILABLE", "No region data can currently be loaded", 503);
    }
    return result;
  }
  return { authorize, list, detail, summary, create, creationRequest, update, deactivate, zones, devices };
}
let productionService;
function getFloodWarningV2Service() {
  if (!productionService) productionService = createFloodWarningV2Service({ db: require("../config/firebase").db });
  return productionService;
}
module.exports = { COLLECTIONS, READ_ROLES, createFloodWarningV2Service, getFloodWarningV2Service };
