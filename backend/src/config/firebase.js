const path = require("path");
const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");
const {
  getFirestore,
} = require("firebase-admin/firestore");

function loadServiceAccount() {
  const encodedServiceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  // Demo/deployed environment
  if (encodedServiceAccount) {
    try {
      const serviceAccountJson = Buffer.from(
        encodedServiceAccount,
        "base64",
      ).toString("utf8");

      return JSON.parse(serviceAccountJson);
    } catch (error) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_BASE64 is invalid",
      );
    }
  }

  // Local development environment
  const localServiceAccountPath = path.join(
    __dirname,
    "../../serviceAccountKey.json",
  );

  try {
    return require(localServiceAccountPath);
  } catch (error) {
    throw new Error(
      "Firebase service account is not configured",
    );
  }
}

if (getApps().length === 0) {
  const serviceAccount = loadServiceAccount();

  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

module.exports = {
  db,
};
