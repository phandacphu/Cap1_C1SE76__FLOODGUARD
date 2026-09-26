const { db } = require("../src/config/firebase");

async function testFirestoreConnection() {
  try {
    const snapshot = await db.collection("users").limit(1).get();

    console.log("Firestore connection successful");
    console.log(`Users found: ${snapshot.size}`);

    process.exit(0);
  } catch (error) {
    console.error("Firestore connection failed");
    console.error(error);

    process.exit(1);
  }
}

testFirestoreConnection();
