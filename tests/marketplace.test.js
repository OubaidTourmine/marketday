import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { requestHandler } from '../shared/core.js';

// Run the real handlers and SQLite databases without binding network ports.
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO = 'false';
process.env.USER_SERVICE_URL = 'http://users';
process.env.LISTING_SERVICE_URL = 'http://listings';
process.env.MESSAGING_SERVICE_URL = 'http://messages';
const directory = mkdtempSync(join(tmpdir(), 'marketday-test-'));
const handlers = {};
for (const [host, service] of [['users', 'user-service'], ['listings', 'listing-service'], ['messages', 'messaging-service'], ['gateway', 'api-gateway']]) {
  process.env.DATA_FILE = join(directory, host + '.sqlite');
  handlers[host] = requestHandler((await import(`../${service}/server.js`)).handler);
}
async function dispatch(host, path, { method = 'GET', body, headers = {} } = {}) {
  const data = body === undefined ? null : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const req = Readable.from(data === null ? [] : [Buffer.from(data)]);
  req.url = path; req.method = method;
  req.headers = Object.fromEntries(Object.entries({ host: 'localhost:8080', ...(data === null ? {} : { 'content-type': 'application/json' }), ...headers }).map(([key, value]) => [key.toLowerCase(), value]));
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = {
    headers: {}, headersSent: false, writableEnded: false,
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, values) { this.status = status; Object.assign(this.headers, values); this.headersSent = true; },
    end(value) { this.output = value; this.writableEnded = true; },
    destroy() { throw new Error('Unexpected response destruction'); },
  };
  await handlers[host](req, res);
  return new Response(res.output, { status: res.status, headers: Object.entries(res.headers).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(v => [key, String(v)])) });
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  assert.ok(handlers[url.hostname], 'All service requests stay inside the test');
  return dispatch(url.hostname, url.pathname + url.search, options);
};
after(() => { globalThis.fetch = originalFetch; rmSync(directory, { recursive: true, force: true }); });
async function call(path, { cookie, ...options } = {}) {
  const response = await dispatch('gateway', '/api' + path, { ...options, headers: { ...(cookie ? { cookie } : {}), ...options.headers } });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}

test('complete marketplace journey and access controls', async t => {
  let seller, buyer, stranger, listingId, conversationId;
  await t.test('registers accounts, hashes passwords, and forwards HttpOnly cookies', async () => {
    for (const name of ['seller', 'buyer', 'stranger']) {
      const response = await call('/auth/register', { method: 'POST', body: { name, email: `${name}@example.com`, password: 'correct-password' } });
      assert.equal(response.status, 201); assert.ok(response.cookie);
      assert.match(response.headers.get('set-cookie'), /HttpOnly/);
      assert.equal(response.data.user.password, undefined);
      if (name === 'seller') seller = response.cookie;
      if (name === 'buyer') buyer = response.cookie;
      if (name === 'stranger') stranger = response.cookie;
    }
    const db = new DatabaseSync(join(directory, 'users.sqlite'));
    assert.notEqual(db.prepare('SELECT password FROM users LIMIT 1').get().password, 'correct-password'); db.close();
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'seller@example.com', password: 'wrong-password' } })).status, 401);
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'seller@example.com', password: 'correct-password' } })).status, 200);
    assert.equal((await call('/auth/register', { method: 'POST', body: { name: 'seller', email: 'seller@example.com', password: 'correct-password' } })).status, 409);
  });
  const draft = { title: 'Oak desk', description: 'A solid oak desk in excellent condition.', price: 250.75, category: 'Home', condition: 'Good', city: 'Rabat', image: '' };
  await t.test('requires authentication, validates fields, and creates a listing', async () => {
    assert.equal((await call('/listings', { method: 'POST', body: draft })).status, 401);
    assert.equal((await call('/listings', { method: 'POST', cookie: seller, body: { ...draft, price: -1 } })).status, 400);
    assert.equal((await call('/listings', { method: 'POST', cookie: seller, body: { ...draft, image: 'javascript:alert(1)' } })).status, 400);
    const response = await call('/listings', { method: 'POST', cookie: seller, body: draft });
    assert.equal(response.status, 201); listingId = response.data.listing.id;
    assert.equal(response.data.listing.price, 25075);
  });
  await t.test('search, category, city, ownership and favorites work', async () => {
    const response = await call('/listings?q=oak&category=Home&city=Rabat');
    assert.equal(response.data.listings.length, 1);
    assert.equal((await call('/listings?q=missing')).data.listings.length, 0);
    assert.equal((await call('/listings?mine=true', { cookie: buyer })).data.listings.length, 0);
    assert.equal((await call('/listings?mine=true', { cookie: seller })).data.listings.length, 1);
    assert.equal((await call(`/listings/${listingId}/favorite`, { method: 'PUT', cookie: buyer })).status, 200);
    assert.deepEqual((await call('/favorites', { cookie: buyer })).data.ids, [listingId]);
    assert.equal((await call('/listings?saved=true', { cookie: buyer })).data.listings.length, 1);
    assert.equal((await call(`/listings/${listingId}`, { method: 'PATCH', cookie: buyer, body: { title: 'Stolen' } })).status, 403);
    assert.equal((await call(`/listings/${listingId}`, { method: 'DELETE', cookie: buyer })).status, 403);
  });
  await t.test('only participants can read and send messages', async () => {
    const response = await call('/conversations', { method: 'POST', cookie: buyer, body: { listing_id: listingId } });
    assert.equal(response.status, 200); conversationId = response.data.conversation.id;
    assert.equal((await call('/conversations', { method: 'POST', cookie: buyer, body: { listing_id: listingId } })).data.conversation.id, conversationId);
    const message = await call(`/conversations/${conversationId}/messages`, { method: 'POST', cookie: buyer, body: { content: 'Is this available?' } });
    assert.equal(message.status, 201);
    assert.equal((await call(`/conversations/${conversationId}/messages`, { cookie: seller })).data.messages[0].content, 'Is this available?');
    assert.equal((await call(`/conversations/${conversationId}/messages`, { cookie: stranger })).status, 404);
    assert.equal((await call(`/conversations/${conversationId}/messages`, { method: 'POST', cookie: stranger, body: { content: 'Intrusion' } })).status, 404);
    assert.equal((await call('/conversations', { cookie: seller })).data.conversations.length, 1);
    assert.equal((await call('/conversations', { cookie: stranger })).data.conversations.length, 0);
  });
  await t.test('edits, marks sold, removes favorites and deletes without changing other records', async () => {
    assert.equal((await call(`/listings/${listingId}`, { method: 'PATCH', cookie: seller, body: { title: 'Oak writing desk', status: 'sold' } })).status, 200);
    assert.equal((await call('/listings?status=available')).data.listings.length, 0);
    assert.equal((await call('/conversations', { method: 'POST', cookie: stranger, body: { listing_id: listingId } })).status, 409);
    assert.equal((await call(`/listings/${listingId}/favorite`, { method: 'DELETE', cookie: buyer })).status, 200);
    assert.deepEqual((await call('/favorites', { cookie: buyer })).data.ids, []);
    await call(`/listings/${listingId}/favorite`, { method: 'PUT', cookie: buyer });
    assert.equal((await call(`/listings/${listingId}`, { method: 'DELETE', cookie: seller })).status, 200);
    assert.equal((await call(`/listings/${listingId}`)).status, 404);
    assert.deepEqual((await call('/favorites', { cookie: buyer })).data.ids, []);
    assert.equal((await call(`/conversations/${conversationId}/messages`, { cookie: buyer })).data.messages.length, 1);
  });
  await t.test('rejects cross-origin mutations, malformed and oversized requests', async () => {
    assert.equal((await call('/auth/logout', { method: 'POST', cookie: seller, headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call('/listings', { method: 'POST', cookie: seller, body: '{' })).status, 400);
    assert.equal((await call('/listings', { method: 'POST', cookie: seller, body: 'x'.repeat(33000) })).status, 413);
    assert.equal((await call('/unknown')).status, 404);
  });
  await t.test('logout revokes the session for every service', async () => {
    assert.equal((await call('/auth/me', { cookie: seller })).status, 200);
    assert.equal((await call('/auth/logout', { method: 'POST', cookie: seller })).status, 200);
    assert.equal((await call('/auth/me', { cookie: seller })).status, 401);
    assert.equal((await call('/listings', { method: 'POST', cookie: seller, body: draft })).status, 401);
  });
});
