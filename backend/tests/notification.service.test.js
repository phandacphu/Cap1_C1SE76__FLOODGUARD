const assert = require("node:assert/strict");

// Giả lập Firebase để không kết nối Firestore thật.
const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: {
      collection() {
        throw new Error("Test must not access real Firestore");
      },
    },
  },
};

const {
  normalizeNotificationData,
  createNotification,
  getNotificationById,
  getNotificationsByRecipient,
  markNotificationAsRead,
} = require("../src/services/notification.service");

// Dữ liệu mẫu hợp lệ
const mockNotification = {
  recipientId: "user_001",
  type: "sos_status",
  title: "Cập nhật SOS",
  body: "Yêu cầu SOS đã được tiếp nhận",
  relatedEntity: {
    type: "rescue_request",
    id: "sos_001",
  },
};

// Test 1: Dữ liệu hợp lệ
const result = normalizeNotificationData(mockNotification);

assert.equal(result.recipientId, "user_001");
assert.equal(result.type, "sos_status");
assert.equal(result.relatedEntity.id, "sos_001");

console.log("PASS 1: Dữ liệu Notification hợp lệ");

// Test 2: Thiếu người nhận
assert.throws(() => {
  normalizeNotificationData({
    ...mockNotification,
    recipientId: "",
  });
}, /recipientId is required/);

console.log("PASS 2: Chặn Notification thiếu người nhận");

// Test 3: Loại thông báo không hợp lệ
assert.throws(() => {
  normalizeNotificationData({
    ...mockNotification,
    type: "invalid_type",
  });
}, /Invalid notification type/);

console.log("PASS 3: Chặn loại Notification không hợp lệ");

// Test 4: Liên kết sai loại dữ liệu
assert.throws(() => {
  normalizeNotificationData({
    ...mockNotification,
    relatedEntity: {
      type: "flood_alert",
      id: "sos_001",
    },
  });
}, /Invalid notification relatedEntity/);

console.log("PASS 4: Chặn liên kết Notification sai");

// Test 5: Kiểm tra các hàm được export
for (const fn of [
  createNotification,
  getNotificationById,
  getNotificationsByRecipient,
  markNotificationAsRead,
]) {
  assert.equal(typeof fn, "function");
}

console.log("PASS 5: Các hàm service đã được export");

const invalidRecipientIds = [".", "..", "users/123", "a".repeat(1501)];

for (const invalidId of invalidRecipientIds) {
  assert.throws(
    () =>
      normalizeNotificationData({
        ...mockNotification,
        recipientId: invalidId,
      }),
    /Notification recipientId is required/,
  );
}

console.log("PASS 6: Chan Firestore Document ID khong hop le");

const invalidRelatedEntityIds = ["", ".", "..", "sos/123", "a".repeat(1501)];

for (const invalidId of invalidRelatedEntityIds) {
  assert.throws(
    () =>
      normalizeNotificationData({
        ...mockNotification,
        relatedEntity: {
          type: "rescue_request",
          id: invalidId,
        },
      }),
    /Invalid notification relatedEntity/,
  );
}

console.log("PASS 7: Chan relatedEntity ID khong hop le");

console.log("All notification validation tests passed");
