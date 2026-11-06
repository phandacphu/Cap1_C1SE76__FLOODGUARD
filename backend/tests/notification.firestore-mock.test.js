const assert = require("node:assert/strict");

// Firestore giả lập bằng bộ nhớ RAM.
const store = new Map();
const logStore = new Map();
let nextId = 0;
let updateCount = 0;

function getCollectionStore(name) {
  assert.ok(name === "notifications" || name === "notification_delivery_logs");

  return name === "notifications" ? store : logStore;
}

function createDocRef(id, collectionName = "notifications") {
  const collectionStore = getCollectionStore(collectionName);

  return {
    id,
    collectionName,

    async set(data) {
      collectionStore.set(id, { ...data });
    },

    async get() {
      const data = collectionStore.get(id);

      return {
        id,
        exists: data !== undefined,
        data: () => data,
      };
    },
  };
}

const mockDb = {
  collection(name) {
    getCollectionStore(name);

    return {
      doc(id) {
        return createDocRef(id === undefined ? `mock_${++nextId}` : id, name);
      },

      where(field, operator, value) {
        assert.equal(name, "notifications");
        assert.equal(field, "recipientId");
        assert.equal(operator, "==");

        return {
          async get() {
            const docs = [...store.entries()]
              .filter(([, data]) => data.recipientId === value)
              .map(([id, data]) => ({
                id,
                data: () => data,
              }));

            return { docs };
          },
        };
      },
    };
  },

  batch() {
    const writes = [];

    return {
      create(ref, data) {
        writes.push({ ref, data });
        return this;
      },

      async commit() {
        // Kiểm tra toàn bộ trước khi ghi để mô phỏng batch nguyên tử.
        const seen = new Set();

        for (const { ref } of writes) {
          const collectionStore = getCollectionStore(ref.collectionName);
          const key = `${ref.collectionName}/${ref.id}`;

          if (collectionStore.has(ref.id) || seen.has(key)) {
            const error = new Error("Document already exists");
            error.code = 6;
            throw error;
          }

          seen.add(key);
        }

        for (const { ref, data } of writes) {
          getCollectionStore(ref.collectionName).set(ref.id, { ...data });
        }
      },
    };
  },

  async runTransaction(callback) {
    return callback({
      get(ref) {
        return ref.get();
      },

      update(ref, changes) {
        const oldData = store.get(ref.id);

        if (!oldData) {
          throw new Error("Document not found");
        }

        store.set(ref.id, {
          ...oldData,
          ...changes,
        });

        updateCount++;
      },
    });
  },
};

// Chặn Firebase thật trước khi tải Notification Service.
const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db: mockDb },
};

const {
  createNotification,
  getNotificationById,
  getNotificationsByRecipient,
  markNotificationAsRead,
} = require("../src/services/notification.service");

async function runTests() {
  const sample = {
    recipientId: "user_001",
    type: "sos_status",
    title: "Cập nhật SOS",
    body: "Yêu cầu SOS đã được tiếp nhận",
    relatedEntity: {
      type: "rescue_request",
      id: "sos_001",
    },
  };

  // TEST 1: Tạo Notification
  const created = await createNotification(sample);

  assert.ok(created.id);
  assert.ok(created.createdAt);
  assert.equal(created.deliveryStatus, "pending");
  assert.equal(created.retryCount, 0);
  assert.equal(created.readAt, null);

  console.log("PASS 1: Tao Notification");

  // TEST 2: Đọc Notification theo ID
  const found = await getNotificationById(created.id, "user_001");

  assert.equal(found.id, created.id);
  assert.equal(found.title, sample.title);

  console.log("PASS 2: Doc Notification theo ID");

  // TEST 3: Không tìm thấy Notification
  const missing = await getNotificationById("missing_id", "user_001");

  assert.equal(missing, null);

  console.log("PASS 3: Khong tim thay Notification");

  // TEST 4: Chỉ lấy Notification của đúng người nhận
  await createNotification({
    ...sample,
    recipientId: "user_002",
  });

  const list = await getNotificationsByRecipient("user_001");

  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);

  console.log("PASS 4: Loc dung nguoi nhan");

  // TEST 5: Người khác không được đánh dấu đã đọc
  await assert.rejects(
    () => markNotificationAsRead(created.id, "user_002"),
    /Not allowed/,
  );

  console.log("PASS 5: Chan nguoi nhan khac");

  // TEST 6: Đánh dấu đã đọc
  const read = await markNotificationAsRead(created.id, "user_001");

  assert.notEqual(read.readAt, null);
  assert.equal(updateCount, 1);

  console.log("PASS 6: Danh dau da doc");

  // TEST 7: Đánh dấu lại không ghi đè thời gian
  const originalReadAt = read.readAt;

  const again = await markNotificationAsRead(created.id, "user_001");

  assert.equal(again.readAt, originalReadAt);
  assert.equal(updateCount, 1);

  console.log("PASS 7: Khong ghi de readAt");

  // TEST 8: Không đánh dấu document không tồn tại
  const missingRead = await markNotificationAsRead("missing_id", "user_001");

  assert.equal(missingRead, null);

  console.log("PASS 8: Xu ly Notification khong ton tai");

  // TEST 9: Tu choi Firestore Document ID khong hop le
  const invalidIds = [".", "..", "users/123", "__invalid__", "a".repeat(1501)];

  for (const invalidId of invalidIds) {
    await assert.rejects(
      () => getNotificationById(invalidId, "user_001"),
      /Invalid notification ID/,
    );

    await assert.rejects(
      () => getNotificationsByRecipient(invalidId),
      /Invalid notification recipientId/,
    );

    await assert.rejects(
      () => markNotificationAsRead(invalidId, "user_001"),
      /Invalid notification ID or recipient ID/,
    );

    await assert.rejects(
      () => markNotificationAsRead(created.id, invalidId),
      /Invalid notification ID or recipient ID/,
    );
  }

  console.log("PASS 9: Chan ID khong hop le khi doc va cap nhat");

  // TEST 10: Chan doc Notification cua nguoi khac
  await assert.rejects(
    () => getNotificationById(created.id, "user_002"),
    /Not allowed to read this notification/,
  );

  console.log("PASS 10: Chan doc Notification cua nguoi khac");

  console.log("All Firestore mock tests passed");
}

runTests().catch((error) => {
  console.error("TEST FAILED:", error);
  process.exitCode = 1;
});
