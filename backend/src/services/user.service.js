const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const USERS_COLLECTION = "users";

/**
 * Create a new user document in Firestore
 */
async function createUser(userData) {
  const userRef = db.collection(USERS_COLLECTION).doc();

  const newUser = {
    fullName: userData.fullName,
    email: userData.email.toLowerCase(),
    passwordHash: userData.passwordHash,
    phone: userData.phone || null,
    role: userData.role || "resident",
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await userRef.set(newUser);

  const createdUser = await userRef.get();

  return {
    id: createdUser.id,
    ...createdUser.data(),
  };
}

/**
 * Get user by Firestore document ID
 */
async function getUserById(userId) {
  const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();

  if (!userDoc.exists) {
    return null;
  }

  return {
    id: userDoc.id,
    ...userDoc.data(),
  };
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("email", "==", email.toLowerCase())
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const userDoc = snapshot.docs[0];

  return {
    id: userDoc.id,
    ...userDoc.data(),
  };
}

module.exports = {
  createUser,
  getUserById,
  getUserByEmail,
};
