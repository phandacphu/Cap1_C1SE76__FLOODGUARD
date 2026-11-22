const { FieldPath, FieldValue } = require("firebase-admin/firestore");
const c = require("./flood-warning-v2-contract");
const { DEVICE_COLLECTIONS: D } = require("./warning-v2-device.service");
const { evaluatePosition, MAX_AGE_MS, MAX_ACCURACY_M } = require("./warning-v2-evaluation");

const WORKER_COLLECTIONS = Object.freeze({ events: "flood_warning_v2_events", alerts: "flood_alerts",
  ledger: "warning_v2_recipient_alerts", deliveries: "warning_v2_deliveries", cursors: "warning_v2_worker_cursors" });
const ledgerId = (residentId, alertId) => c.hash([residentId, alertId]);
const deliveryId = (residentId, alertId, kind) => c.hash([residentId, alertId, kind]);
const step = (value) => ({ cursor: value?.cursor ?? null, pass: value?.pass ?? 0 });
const sameStep = (a, b) => a.cursor === b.cursor && a.pass === b.pass;
function nextStep(previous, docs, limit) {
  return docs.length < limit ? { cursor: null, pass: previous.pass + 1 } : { cursor: docs.at(-1).id, pass: previous.pass };
}
function bounded(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) throw new Error("Invalid worker batch size");
  return value;
}
function activeAlert(snapshot) {
  try { const alert = c.clientAlert(snapshot); return alert.status === "active" ? alert : null; }
  catch { return null; } // Never broadcast V1 or a malformed record.
}
const isResident = (snapshot) => snapshot.exists && snapshot.data().role === "resident" && snapshot.data().isActive === true;
function usableSample(sample, now) {
  const time = Date.parse(sample?.capturedAt), point = sample?.location;
  return sample?.availability === "available" && Number.isFinite(time) && time <= now && now - time <= MAX_AGE_MS &&
    Number.isFinite(sample.accuracyM) && sample.accuracyM >= 0 && sample.accuracyM <= MAX_ACCURACY_M &&
    point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}
function bodyForLocation(kind, matches) {
  const groups = new Set(matches.filter((m) => m.relation === kind).map((m) => m.group));
  const relation = kind === "inside" ? "trong" : "gần";
  return [groups.has("current_flood") && `Bạn đang ${relation} vùng ngập được hệ thống ghi nhận.`,
    groups.has("historical_flood") && `Bạn đang ${relation} khu vực từng ghi nhận ngập. Cần chú ý khi có mưa lớn.`,
    groups.has("low_lying") && `Bạn đang ${relation} vùng trũng, có nguy cơ ngập khi mưa lớn.`].filter(Boolean).join("\n");
}

// Internal preparation/cancellation worker only. There is deliberately no messaging provider here.
function createWarningV2EventWorker({ db, zonesService, clock = Date.now, batchSize = 20 }) {
  bounded(batchSize);
  const ref = (kind, id) => db.collection(WORKER_COLLECTIONS[kind]).doc(id);
  const deviceRef = (id) => db.collection(D.devices).doc(id);
  const locationRef = (id) => db.collection(D.locations).doc(id);
  const userRef = (id) => db.collection("users").doc(c.documentId(id));
  function page(collection, state, limit = batchSize) {
    let q = collection.orderBy(FieldPath.documentId());
    if (state.cursor !== null) q = q.startAfter(state.cursor);
    return q.limit(bounded(limit)).get();
  }
  function sampleOf(snapshot, device) {
    const data = snapshot.data();
    if (!data || data.ownerId !== device.ownerId || data.bindingId !== device.bindingId) return null;
    return { ...data, receivedAt: data.receivedAt?.toDate().toISOString() ?? null };
  }
  function evaluate(snapshot, device, alertId, zones) {
    return evaluatePosition({ sample: sampleOf(snapshot, device), zones, activeAlertIds: [alertId], now: clock(),
      installationId: snapshot.id, bindingId: device.bindingId });
  }
  function contextOf(evaluation) {
    const matches = evaluation.matches.map(({ zoneId, group, relation, source, recordedAt }) => ({ zoneId, group, relation, source, recordedAt }));
    return { zonesRevision: evaluation.zonesRevision, coverageStatus: evaluation.coverage.status,
      matchCount: matches.length, matches: matches.slice(0, 20),
      matchesHash: c.hash([...matches].sort((a, b) => a.zoneId < b.zoneId ? -1 : a.zoneId > b.zoneId ? 1 : 0)) };
  }
  async function record(tx, { residentId, alert, kind, payload, payloadRevision = alert.revision, context = null, origin = null }) {
    const receiptRef = ref("ledger", ledgerId(residentId, alert.id)), receipt = await tx.get(receiptRef);
    const jobRef = ref("deliveries", deliveryId(residentId, alert.id, kind)), job = await tx.get(jobRef);
    const ledger = receipt.exists ? receipt.data() : { schemaVersion: 2, residentId, alertId: alert.id,
      general: false, near: false, inside: false };
    if (ledger.residentId !== residentId || ledger.alertId !== alert.id) throw new Error("Warning receipt integrity failure");
    const nearRef = kind === "inside" ? ref("deliveries", deliveryId(residentId, alert.id, "near")) : null;
    const near = nearRef ? await tx.get(nearRef) : null;
    if (ledger[kind] || (kind === "near" && ledger.inside)) return false;
    if (job.exists) throw new Error("Warning job has no matching receipt");
    const changes = { ...ledger, [kind]: true, updatedAt: FieldValue.serverTimestamp() };
    if (receipt.exists) tx.update(receiptRef, changes); else tx.create(receiptRef, { ...changes, createdAt: FieldValue.serverTimestamp() });
    tx.create(jobRef, { schemaVersion: 2, eventId: jobRef.id, residentId, alertId: alert.id, kind,
      alertRevision: payloadRevision, payload, context, origin, status: "pending", createdAt: FieldValue.serverTimestamp() });
    // Recording inside consumes that kind even if delivery later becomes ineligible. Do not recreate it.
    if (near?.exists && near.data().status === "pending") {
      tx.update(nearRef, { status: "canceled", cancellationReason: "inside_recorded", canceledAt: FieldValue.serverTimestamp() });
    }
    return true;
  }
  async function processGeneralEvent(eventId, limit = batchSize) {
    const eventRef = ref("events", c.documentId(eventId)), initial = await eventRef.get();
    if (!initial.exists || initial.data().kind !== "general" || initial.data().status !== "pending") return { created: 0 };
    const event = initial.data(), state = step(event.fanout);
    const users = await page(db.collection("users"), state, limit);
    let created = 0;
    for (const user of users.docs) {
      const added = await db.runTransaction(async (tx) => {
        const currentEvent = await tx.get(eventRef);
        if (!currentEvent.exists || currentEvent.data().status !== "pending" || !sameStep(step(currentEvent.data().fanout), state)) return false;
        const alert = activeAlert(await tx.get(ref("alerts", event.alertId)));
        if (!alert || !isResident(await tx.get(userRef(user.id)))) return false;
        const original = currentEvent.data().payload;
        if (typeof original?.title !== "string" || typeof original?.content !== "string") throw new Error("Invalid general event payload");
        return record(tx, { residentId: user.id, alert, kind: "general", payloadRevision: currentEvent.data().alertRevision,
          payload: { title: original.title, body: original.content } });
      });
      if (added) created++;
    }
    await db.runTransaction(async (tx) => {
      const saved = await tx.get(eventRef);
      if (!saved.exists || saved.data().status !== "pending" || !sameStep(step(saved.data().fanout), state)) return;
      const active = activeAlert(await tx.get(ref("alerts", event.alertId)));
      if (!active) { tx.update(eventRef, { status: "canceled", canceledAt: FieldValue.serverTimestamp() }); return; }
      // Repeat bounded passes while active: catch Residents created/activated before an earlier cursor.
      tx.update(eventRef, { fanout: nextStep(state, users.docs, limit), lastPreparedAt: FieldValue.serverTimestamp() });
    });
    return { created };
  }
  async function processDevice(installationId, { zones, loadZones = () => zonesService.load(), limit = batchSize } = {}) {
    const initial = await deviceRef(installationId).get(), device = initial.data();
    if (!device?.active) return { created: 0 };
    if (!usableSample(sampleOf(await locationRef(installationId).get(), device), clock())) return { created: 0 };
    const progressRef = ref("cursors", `device_${c.hash([installationId, device.bindingId])}`);
    const progress = await progressRef.get(), state = step(progress.data());
    const alerts = await page(db.collection(WORKER_COLLECTIONS.alerts).where("schemaVersion", "==", 2).where("status", "==", "active"), state, limit);
    if (!zones && alerts.docs.length) zones = await loadZones();
    let created = 0;
    for (const candidate of alerts.docs) {
      const added = await db.runTransaction(async (tx) => {
        const current = (await tx.get(deviceRef(installationId))).data();
        if (!current?.active || current.ownerId !== device.ownerId || current.bindingId !== device.bindingId) return false;
        const savedProgress = await tx.get(progressRef);
        if (!sameStep(step(savedProgress.data()), state)) return false;
        const actor = await tx.get(userRef(current.ownerId)), alert = activeAlert(await tx.get(ref("alerts", candidate.id)));
        const saved = await tx.get(locationRef(installationId));
        if (!alert || !isResident(actor)) return false;
        const evaluation = evaluate(saved, current, alert.id, zones);
        if (!["near", "inside"].includes(evaluation.status)) return false;
        return record(tx, { residentId: current.ownerId, alert, kind: evaluation.status,
          payload: { title: alert.title, body: bodyForLocation(evaluation.status, evaluation.matches) }, context: contextOf(evaluation),
          origin: { installationId, bindingId: current.bindingId, sequence: evaluation.sequence } });
      });
      if (added) created++;
    }
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(deviceRef(installationId))).data(), saved = await tx.get(progressRef);
      if (!current?.active || current.ownerId !== device.ownerId || current.bindingId !== device.bindingId || !sameStep(step(saved.data()), state)) return;
      const data = { ...nextStep(state, alerts.docs, limit), installationId, bindingId: device.bindingId, updatedAt: FieldValue.serverTimestamp() };
      if (saved.exists) tx.update(progressRef, data); else tx.create(progressRef, data);
    });
    return { created };
  }
  async function processLocationEvent(eventId, options = {}) {
    const eventRef = db.collection(D.events).doc(c.documentId(eventId)), initial = await eventRef.get(), event = initial.data();
    if (!event || event.status !== "pending") return { created: 0 };
    const current = (await locationRef(event.installationId).get()).data();
    let result = { created: 0 };
    if (current?.bindingId === event.bindingId && current.ownerId === event.residentId && current.sequence === event.sequence) {
      result = await processDevice(event.installationId, options);
    }
    await db.runTransaction(async (tx) => {
      const saved = await tx.get(eventRef), latest = (await tx.get(locationRef(event.installationId))).data();
      if (!saved.exists || saved.data().status !== "pending") return;
      const same = latest?.bindingId === event.bindingId && latest.ownerId === event.residentId && latest.sequence === event.sequence;
      tx.update(eventRef, { status: same ? "processed" : "superseded", processedAt: FieldValue.serverTimestamp() });
    });
    return result;
  }
  async function cancelDelivery(jobId, { zones, loadZones = () => zonesService.load() } = {}) {
    const jobRef = ref("deliveries", c.documentId(jobId)), initial = await jobRef.get(), original = initial.data();
    if (!original || original.status !== "pending") return { canceled: 0 };
    if (original.kind !== "general" && !zones && activeAlert(await ref("alerts", original.alertId).get())) zones = await loadZones();
    return db.runTransaction(async (tx) => {
      const saved = await tx.get(jobRef), job = saved.data();
      if (!job || job.status !== "pending") return { canceled: 0 };
      const alert = activeAlert(await tx.get(ref("alerts", job.alertId))), actor = await tx.get(userRef(job.residentId));
      let reason = !alert ? "alert_inactive_or_invalid" : !isResident(actor) ? "recipient_ineligible" : null;
      if (!reason && job.kind !== "general") {
        const ledger = (await tx.get(ref("ledger", ledgerId(job.residentId, job.alertId)))).data();
        const origin = job.origin, device = origin && (await tx.get(deviceRef(origin.installationId))).data();
        if (job.kind === "near" && ledger?.inside) reason = "inside_recorded";
        else if (!device?.active || device.ownerId !== job.residentId || device.bindingId !== origin.bindingId) reason = "device_binding_changed";
        else {
          const location = await tx.get(locationRef(origin.installationId));
          const evaluation = evaluate(location, device, job.alertId, zones);
          if (evaluation.status !== job.kind) reason = "location_no_longer_eligible";
          else if (contextOf(evaluation).matchesHash !== job.context?.matchesHash) reason = "matched_regions_changed";
        }
      }
      if (!reason) return { canceled: 0 };
      tx.update(jobRef, { status: "canceled", cancellationReason: reason, canceledAt: FieldValue.serverTimestamp() });
      return { canceled: 1 };
    });
  }
  async function processDeactivatedEvent(eventId, { zones, limit = batchSize } = {}) {
    const eventRef = ref("events", c.documentId(eventId)), initial = await eventRef.get(), event = initial.data();
    if (!event || event.kind !== "deactivated" || event.cancellationComplete === true) return { canceled: 0 };
    const state = step(event.cancellation), jobs = await page(db.collection(WORKER_COLLECTIONS.deliveries).where("alertId", "==", event.alertId), state, limit);
    let canceled = 0;
    for (const job of jobs.docs) canceled += (await cancelDelivery(job.id, { zones })).canceled;
    await db.runTransaction(async (tx) => {
      const saved = await tx.get(eventRef);
      if (!saved.exists || !sameStep(step(saved.data().cancellation), state)) return;
      tx.update(eventRef, { cancellation: nextStep(state, jobs.docs, limit), cancellationComplete: jobs.docs.length < limit,
        ...(jobs.docs.length < limit ? { status: "prepared" } : {}), lastPreparedAt: FieldValue.serverTimestamp() });
    });
    // The control event remains available for a later FCM sender; cancellation is not delivery.
    return { canceled };
  }
  async function scan(name, collection, handler, limit = batchSize) {
    const cursorRef = ref("cursors", `scan_${name}`), previous = await cursorRef.get(), state = step(previous.data());
    const docs = await page(typeof collection === "string" ? db.collection(collection) : collection, state, limit);
    const totals = { created: 0, canceled: 0 };
    for (const doc of docs.docs) {
      const result = await handler(doc); totals.created += result?.created ?? 0; totals.canceled += result?.canceled ?? 0;
    }
    await db.runTransaction(async (tx) => {
      const saved = await tx.get(cursorRef);
      if (!sameStep(step(saved.data()), state)) return;
      const data = { ...nextStep(state, docs.docs, limit), updatedAt: FieldValue.serverTimestamp() };
      if (saved.exists) tx.update(cursorRef, data); else tx.create(cursorRef, data);
    });
    return totals;
  }
  async function tick() {
    let regions;
    const zones = () => (regions ??= zonesService.load());
    const totals = { created: 0, canceled: 0, failedScans: [] };
    const scans = [
      ["events", db.collection(WORKER_COLLECTIONS.events).where("status", "==", "pending"), async (doc) => doc.data().kind === "general" ? processGeneralEvent(doc.id) :
        doc.data().kind === "deactivated" ? processDeactivatedEvent(doc.id) : null],
      ["gps", db.collection(D.events).where("status", "==", "pending"), (doc) => processLocationEvent(doc.id, { loadZones: zones })],
      ["devices", db.collection(D.devices).where("active", "==", true), (doc) => processDevice(doc.id, { loadZones: zones })],
      ["deliveries", db.collection(WORKER_COLLECTIONS.deliveries).where("status", "==", "pending"), (doc) => cancelDelivery(doc.id, { loadZones: zones })],
    ];
    for (const [name, collection, handler] of scans) {
      try { const result = await scan(name, collection, handler); totals.created += result.created; totals.canceled += result.canceled; }
      catch { totals.failedScans.push(name); } // Retain failed cursor; replay prior successful writes safely.
    }
    return totals;
  }
  return { processGeneralEvent, processDevice, processLocationEvent, cancelDelivery, processDeactivatedEvent, tick };
}
module.exports = { WORKER_COLLECTIONS, ledgerId, deliveryId, createWarningV2EventWorker };
