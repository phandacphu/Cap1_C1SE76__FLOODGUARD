// Read-only: no raw SMS body/credential or gateway key is printed.
require('dotenv').config();
const { db } = require('../src/config/firebase');
(async () => {
 const snapshot = await db.collection('sos_sms_inbox').get();
 const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  .filter(item => item.state === 'needs_review' || item.state === 'pending')
  .map(item => ({ inboxId: item.id, state: item.state, code: item.code ?? null,
    requestId: item.requestId ?? null, senderPhone: item.senderPhone, receivedAt: item.receivedAt }));
 console.table(items); console.log(`Pending/review: ${items.length}`);
})().catch(() => { console.error('Unable to inspect SMS inbox'); process.exitCode = 1; });
