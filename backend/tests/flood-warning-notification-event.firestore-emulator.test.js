const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-floodguard-ccf148";

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const runId = randomUUID();
const app = initializeApp(
  { projectId: process.env.GCLOUD_PROJECT },
  `ccf150-events-${runId}`,
);
const db = getFirestore(app);

const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

// Audit is mocked; alert and event transactions use real Emulator Firestore.
const auditCalls = [];
const auditPath = require.resolve("../src/services/audit-logging.service");
require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: {
    async logAuditEvent(input) {
      auditCalls.push(input);
    },
  },
};

const {
  createFloodAlertForAdmin,
  updateFloodAlertForAdmin,
} = require("../src/services/admin-flood-alert.service");

const {
  FLOOD_WARNING_EVENTS_COLLECTION,
  stageFloodWarningNotificationEvent,
} = require("../src/services/flood-warning-notification-event.service");

async function runTests() {
  const adminId = `ccf150_admin_${runId}`;
  const residentId = `ccf150_resident_${runId}`;
  const areaId = `ccf150_area_${runId}`;
  const testAreaId = `ccf150_test_area_${runId}`;

  const adminRef = db.collection("users").doc(adminId);
  const residentRef = db.collection("users").doc(residentId);
  const areaRef = db.collection("flood_areas").doc(areaId);
  const testAreaRef = db.collection("flood_areas").doc(testAreaId);
  const alerts = db.collection("flood_alerts");
  const events = db.collection(FLOOD_WARNING_EVENTS_COLLECTION);

  const now = Date.now();
  const body = {
    title: "Flood warning",
    content: "Warning information",
    severity: "high",
    status: "active",
    areaId,
    startAt: new Date(now - 60000).toISOString(),
    endAt: new Date(now + 3600000).toISOString(),
  };

  async function readAlert(id) {
    return (await alerts.doc(id).get()).data();
  }

  async function eventsFor(id) {
    return events.where("alertId", "==", id).get();
  }

  try {
    await Promise.all([
      adminRef.set({ role: "admin", isActive: true }),
      residentRef.set({ role: "resident", isActive: true }),
      areaRef.set({ name: "Monitored area" }),
      testAreaRef.set({ name: "TEST ONLY - simulated area" }),
    ]);

    const created = await createFloodAlertForAdmin(adminId, body);
    const saved = await readAlert(created.id);
    const firstEvents = await eventsFor(created.id);

    assert.equal(firstEvents.size, 1);
    assert.equal(firstEvents.docs[0].id, saved.notificationRevision);
    assert.equal(firstEvents.docs[0].data().status, "pending");
    assert.ok(firstEvents.docs[0].data().availableAt instanceof Timestamp);
    assert.equal(Object.hasOwn(created, "notificationRevision"), false);
    assert.equal(auditCalls.length, 1);
    console.log("PASS 1: Create persists alert and pending event");

    await updateFloodAlertForAdmin(adminId, created.id, {
      title: body.title,
    });

    assert.equal((await eventsFor(created.id)).size, 1);
    assert.equal(
      (await readAlert(created.id)).notificationRevision,
      saved.notificationRevision,
    );
    assert.equal(auditCalls.length, 1);
    console.log("PASS 2: Unchanged update creates no event or audit");

    await updateFloodAlertForAdmin(adminId, created.id, {
      severity: "critical",
    });

    const updated = await readAlert(created.id);
    assert.notEqual(updated.notificationRevision, saved.notificationRevision);
    assert.equal((await eventsFor(created.id)).size, 2);
    assert.equal(auditCalls.length, 2);
    console.log("PASS 3: Real change creates a new revision and event");

    await updateFloodAlertForAdmin(adminId, created.id, {
      status: "inactive",
    });

    const inactiveRevision = (await readAlert(created.id)).notificationRevision;

    assert.notEqual(inactiveRevision, updated.notificationRevision);
    assert.equal((await eventsFor(created.id)).size, 2);
    console.log("PASS 4: Deactivation changes revision without new event");

    await updateFloodAlertForAdmin(adminId, created.id, {
      status: "active",
    });

    assert.equal((await eventsFor(created.id)).size, 3);
    console.log("PASS 5: Reactivation creates a new event");

    const futureStart = now + 86400000;
    const future = await createFloodAlertForAdmin(adminId, {
      ...body,
      startAt: new Date(futureStart).toISOString(),
      endAt: new Date(futureStart + 3600000).toISOString(),
    });

    const futureEvents = await eventsFor(future.id);
    assert.equal(futureEvents.size, 1);
    assert.equal(
      futureEvents.docs[0].data().availableAt.toMillis(),
      futureStart,
    );
    console.log("PASS 6: Future warning event waits until startAt");

    const testWarning = await createFloodAlertForAdmin(adminId, {
      ...body,
      title: "TEST ONLY - simulated warning",
    });
    assert.equal((await eventsFor(testWarning.id)).size, 0);

    const testAreaWarning = await createFloodAlertForAdmin(adminId, {
      ...body,
      areaId: testAreaId,
    });
    assert.equal((await eventsFor(testAreaWarning.id)).size, 0);
    console.log("PASS 7: Test warning and test area create no event");

    const expired = await createFloodAlertForAdmin(adminId, {
      ...body,
      startAt: new Date(now - 120000).toISOString(),
      endAt: new Date(now - 60000).toISOString(),
    });
    assert.equal((await eventsFor(expired.id)).size, 0);
    console.log("PASS 8: Expired warning creates no event");

    await assert.rejects(
      createFloodAlertForAdmin(residentId, body),
      (error) => error.statusCode === 403,
    );
    console.log("PASS 9: Resident cannot create warning");

    // Reusing an existing event ID forces transaction.create to fail.
    // The accompanying alert update must also be rolled back.
    const beforeRollback = await readAlert(created.id);
    const existingRevision = firstEvents.docs[0].id;

    await assert.rejects(
      db.runTransaction(async (transaction) => {
        const alertRef = alerts.doc(created.id);
        const alertDoc = await transaction.get(alertRef);

        transaction.update(alertRef, {
          title: "This update must roll back",
        });

        stageFloodWarningNotificationEvent(
          transaction,
          created.id,
          existingRevision,
          null,
          alertDoc.data(),
          { name: "Monitored area" },
        );
      }),
    );

    assert.equal((await readAlert(created.id)).title, beforeRollback.title);
    assert.equal((await eventsFor(created.id)).size, 3);
    console.log("PASS 10: Event write failure rolls back alert update");

    console.log("All 10 notification event Emulator tests passed");
  } finally {
    try {
      // Locate only alerts belonging to this run's two areas.
      for (const ownAreaId of [areaId, testAreaId]) {
        const ownAlerts = await alerts.where("areaId", "==", ownAreaId).get();

        for (const alertDoc of ownAlerts.docs) {
          const ownEvents = await eventsFor(alertDoc.id);

          for (const eventDoc of ownEvents.docs) {
            await eventDoc.ref.delete();
          }

          await alertDoc.ref.delete();
        }
      }

      await Promise.all([
        adminRef.delete(),
        residentRef.delete(),
        areaRef.delete(),
        testAreaRef.delete(),
      ]);
    } finally {
      await deleteApp(app);
    }
  }
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
