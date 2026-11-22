const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const h = require('./helpers/sos-test-app');
const { issueCredential, parseSms } = require('../src/services/sos-sms-contract');
const { receiveSms } = require('../src/services/sos-sms.service');
const { createSosWithHistory } = require('../src/services/create-sos.service');
process.env.SOS_SMS_SIGNING_KEY = 'test-signing-key-only-0123456789abcdef';
beforeEach(() => h.reset());
function sms(overrides = {}) {
 const input = { ...h.validBody(), note: 'Cần cứu | gần cầu', clientRequestId: randomUUID() };
 const at = new Date(Date.now() - 3600000).toISOString();
 const body = ['FGSOS1', issueCredential('resident').credential, input.clientRequestId,
  `${input.location.latitude},${input.location.longitude}`, at, input.situations.join(','),
  input.numberOfPeople, input.waterLevel, Buffer.from(input.note).toString('base64url')].join('|');
 return { input, envelope: { messageId: randomUUID(), senderPhone: '+84900000001', receivedAt: new Date().toISOString(), body, ...overrides } };
}
test('parse Unicode note and old captured time; credential is scoped and expiring', () => {
 const { input, envelope } = sms();
 assert.deepEqual(parseSms(envelope.body).input, input);
 const credential = issueCredential('resident', Date.now() - 8 * 86400000).credential;
 assert.throws(() => parseSms(envelope.body.replace(envelope.body.split('|')[1], credential)), { code: 'SMS_CREDENTIAL_EXPIRED' });
 assert.throws(() => parseSms(envelope.body.replace('FGSOS1|', 'FGSOS2|')));
 assert.throws(() => parseSms(envelope.body.replace('16.0544,', '91,')));
 assert.throws(() => parseSms(envelope.body.replace('waist', 'unknown')));
 assert.throws(() => parseSms(envelope.body.replace(envelope.body.split('|')[1], 'forged')));
});
test('SMS creates one resident-owned SOS visible to all roles and completable normally', async () => {
 const { envelope } = sms(); const a = await receiveSms(envelope);
 assert.equal(a.state, 'created');
 const stored = h.records.get(`rescue_requests/${a.requestId}`);
 assert.equal(stored.source, 'sms'); assert.equal(stored.residentId, 'resident');
 assert.equal(stored.smsSenderPhone, envelope.senderPhone);
 assert.ok(Date.parse(stored.locationCapturedAt) < Date.now() - 3000000);
 await h.withApi(async api => {
  for (const actor of ['resident', 'rescue', 'admin']) {
   const r = await api('/api/rescue-requests?state=active', { actor });
   assert.equal(r.status, 200); assert.equal(r.body.data.rescueRequests[0].id, a.requestId);
  }
  const other = await api(`/api/rescue-requests/${a.requestId}`, { actor: 'other' });
  assert.equal(other.status, 403);
  const done = await api(`/api/rescue-requests/${a.requestId}/status`, { actor: 'rescue', method: 'PATCH', body: { status: 'assisted' } });
  assert.equal(done.status, 200); assert.equal(h.count('notifications'), 1);
 });
});
test('parallel receive and repeat after completion keep same ID and single history', async () => {
 const { envelope } = sms();
 const results = await Promise.all([receiveSms(envelope), receiveSms(envelope), receiveSms({ ...envelope, messageId: randomUUID() })]);
 assert.equal(new Set(results.map(r => r.requestId)).size, 1);
 assert.equal(h.count('rescue_requests'), 1); assert.equal(h.count('rescue_request_status_history'), 1);
 await h.withApi(api => api(`/api/rescue-requests/${results[0].requestId}/status`, { actor: 'rescue', method: 'PATCH', body: { status: 'assisted' } }));
 const retry = await receiveSms({ ...envelope, messageId: randomUUID() });
 assert.equal(retry.requestId, results[0].requestId); assert.equal(h.count('rescue_requests'), 1);
});
test('online accepted but response lost then SMS shares ID, preserves newer location', async () => {
 const { input, envelope } = sms();
 const first = await createSosWithHistory('resident', input);
 const next = { latitude: 17, longitude: 109 };
 h.records.get(`rescue_requests/${first.id}`).location = next;
 const result = await receiveSms(envelope);
 assert.equal(result.requestId, first.id); assert.equal(h.count('rescue_requests'), 1);
 assert.deepEqual(h.records.get(`rescue_requests/${first.id}`).location, next);
});
test('SMS first then online retry and parallel cross-channel create both reconcile', async () => {
 const { input, envelope } = sms();
 const [smsResult, online] = await Promise.all([receiveSms(envelope), createSosWithHistory('resident', input)]);
 assert.equal(smsResult.requestId, online.id); assert.equal(h.count('rescue_requests'), 1);
});
test('same reference different content and different reference while active go to review', async () => {
 const { input, envelope } = sms(); await createSosWithHistory('resident', { ...input, note: 'changed' });
 const conflict = await receiveSms(envelope);
 assert.equal(conflict.state, 'needs_review'); assert.equal(conflict.code, 'SOS_SUBMISSION_CONFLICT');
 const other = await receiveSms(sms().envelope);
 assert.equal(other.state, 'needs_review'); assert.equal(other.code, 'DUPLICATE_SOS_REQUEST');
 assert.equal(h.count('rescue_requests'), 1);
});
test('inactive, removed and forged credential preserve inbox without account impersonation', async () => {
 for (const mode of ['inactive', 'removed', 'forged']) {
  h.reset(); const { envelope } = sms();
  if (mode === 'inactive') h.records.get('users/resident').isActive = false;
  if (mode === 'removed') h.records.delete('users/resident');
  if (mode === 'forged') envelope.body = envelope.body.replace(envelope.body.split('|')[1], 'forged');
  const result = await receiveSms(envelope);
  assert.equal(result.state, 'needs_review'); assert.equal(h.count('rescue_requests'), 0);
  assert.equal(h.count('sos_sms_inbox'), 1);
 }
});
test('DB commit failure is retriable; message ID conflict cannot overwrite stored SMS', async () => {
 const { envelope } = sms(); h.failCommit();
 await assert.rejects(receiveSms(envelope)); assert.equal(h.count('rescue_requests'), 0);
 h.failCommit(false); const first = await receiveSms(envelope);
 await assert.rejects(receiveSms({ ...envelope, senderPhone: '+84911111111' }), { code: 'SMS_MESSAGE_CONFLICT' });
 assert.equal((await receiveSms(envelope)).requestId, first.requestId);
});
test('bad multipart/truncated content stays in review; bad envelope rejected', async () => {
 const { envelope } = sms();
 assert.equal((await receiveSms({ ...envelope, body: 'FGSOS1|truncated' })).state, 'needs_review');
 await assert.rejects(receiveSms({ ...envelope, receivedAt: undefined }), { code: 'INVALID_SMS_ENVELOPE' });
});

test('HTTP feature flag, gateway secret and credential issuance enforce separate access', async () => {
 const { envelope } = sms();
 process.env.SOS_SMS_ENABLED = 'false';
 process.env.SOS_SMS_GATEWAY_KEY = 'gateway-test-only-0123456789abcdef';
 process.env.SOS_SMS_RECIPIENT = '0900000001';
 await h.withApi(async api => {
  assert.equal((await api('/api/sos-sms/inbound', { method: 'POST', body: envelope })).status, 503);
  process.env.SOS_SMS_ENABLED = 'true';
  for (const actor of ['resident', 'rescue', 'admin']) {
   assert.equal((await api('/api/sos-sms/inbound', { actor, method: 'POST', body: envelope })).status, 401);
  }
  for (const actor of ['rescue', 'admin', 'inactive']) {
   assert.equal((await api('/api/sos-sms/credential', { actor, method: 'POST', body: {} })).status, 403);
  }
  assert.equal((await api('/api/sos-sms/credential', { actor: null, method: 'POST', body: {} })).status, 401);
  const credential = await api('/api/sos-sms/credential', { method: 'POST', body: {} });
  assert.equal(credential.status, 200); assert.equal(credential.body.data.recipientPhone, '0900000001');
  const intake = await api('/api/sos-sms/inbound', { actor: null, method: 'POST', body: envelope, extraHeaders: { Authorization: 'Bearer ' + process.env.SOS_SMS_GATEWAY_KEY } });
  assert.equal(intake.status, 200); assert.equal(intake.body.data.state, 'created');
 });
 delete process.env.SOS_SMS_ENABLED;
});
test('HTTP online optional reference retries completed request, rejects changed body', async () => {
 const { input } = sms();
 await h.withApi(async api => {
  const first = await api('/api/rescue-requests', { method: 'POST', body: input });
  const id = first.body.data.rescueRequest.id;
  await api(`/api/rescue-requests/${id}/status`, { actor: 'rescue', method: 'PATCH', body: { status: 'assisted' } });
  const again = await api('/api/rescue-requests', { method: 'POST', body: input });
  assert.equal(again.body.data.rescueRequest.id, id); assert.equal(again.body.data.rescueRequest.state, 'rescued');
  assert.equal((await api('/api/rescue-requests', { method: 'POST', body: { ...input, note: 'different' } })).status, 409);
 });
});
