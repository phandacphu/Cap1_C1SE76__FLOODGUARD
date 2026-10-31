const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Bat buoc su dung Firestore Emulator, khong dung Firebase that.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const PROJECT_ID = "demo-floodguard-ccf148";
process.env.GCLOUD_PROJECT = PROJECT_ID;

const { initializeApp, deleteApp } = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");

const app = initializeApp(
  { projectId: PROJECT_ID },
  `ccf148-test-${randomUUID()}`,
);

const db = getFirestore(app);

// Thay Firebase config cua du an bang Emulator cho test nay.
const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const {
  createNotification,
  getNotificationById,
  getNotificationsByRecipient,
  markNotificationAsRead,
} = require("../src/services/notification.service");

async function runTests() {
  const createdIds = [];

  const recipientId = `test-${randomUUID()}`;
  const otherRecipientId = `test-${randomUUID()}`;

  const sample = {
    recipientId,
    type: "sos_status",
    title: "TEST ONLY - SOS Notification",
    body: "Thong bao kiem thu Firestore Emulator",
    relatedEntity: {
      type: "rescue_request",
      id: "test_sos_001",
    },
  };

  try {
    // Test 1: Tao thong bao
    const created = await createNotification(sample);
    createdIds.push(created.id);

    assert.ok(created.id);
    assert.equal(created.deliveryStatus, "pending");
    assert.equal(created.retryCount, 0);
    assert.equal(created.readAt, null);
    assert.equal(typeof created.createdAt.toMillis, "function");

    console.log("PASS 1: Tao Notification tren Emulator");

    // Test 2: Doc theo ID
    const found = await getNotificationById(created.id, recipientId);

    assert.equal(found.id, created.id);
    assert.equal(found.title, sample.title);

    console.log("PASS 2: Doc Notification theo ID");

    // Test 3: Danh sach dung nguoi nhan
    const other = await createNotification({
      ...sample,
      recipientId: otherRecipientId,
    });

    createdIds.push(other.id);

    const list = await getNotificationsByRecipient(recipientId);

    assert.equal(list.length, 1);
    assert.equal(list[0].id, created.id);

    console.log("PASS 3: Loc theo nguoi nhan");

    // Test 4: Chan doc thong bao cua nguoi khac
    await assert.rejects(
      () => getNotificationById(created.id, otherRecipientId),
      /Not allowed/,
    );

    console.log("PASS 4: Chan doc trai phep");

    // Test 5: Chan danh dau da doc trai phep
    await assert.rejects(
      () => markNotificationAsRead(created.id, otherRecipientId),
      /Not allowed/,
    );

    console.log("PASS 5: Chan cap nhat trai phep");

    // Test 6: Danh dau da doc
    const read = await markNotificationAsRead(created.id, recipientId);

    assert.equal(typeof read.readAt.toMillis, "function");

    console.log("PASS 6: Danh dau da doc");

    // Test 7: Khong ghi de readAt cu
    const again = await markNotificationAsRead(created.id, recipientId);

    assert.equal(again.readAt.toMillis(), read.readAt.toMillis());

    console.log("PASS 7: Giu nguyen thoi gian da doc");

    // Test 8: Document khong ton tai
    const missing = await getNotificationById("not_found_ccf148", recipientId);

    assert.equal(missing, null);

    console.log("PASS 8: Xu ly document khong ton tai");

    console.log("All Firestore Emulator tests passed");
  } finally {
    // Chi xoa document duoc chinh bai test nay tao ra.
    for (const id of createdIds) {
      await db.collection("notifications").doc(id).delete();
    }

    await deleteApp(app);
  }
}

runTests().catch((error) => {
  console.error("EMULATOR TEST FAILED:", error);
  process.exitCode = 1;
});
