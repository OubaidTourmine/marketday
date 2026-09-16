import { randomUUID } from 'node:crypto';
import { database, serve, authenticate, body, text, json, HttpError } from '../shared/core.js';

const db = database(process.env.DATA_FILE || './data/messages.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, title TEXT NOT NULL,
  buyer_id TEXT NOT NULL, buyer_name TEXT NOT NULL, seller_id TEXT NOT NULL, seller_name TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(listing_id,buyer_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,id);`);
function conversation(id, user) {
  const result = db.prepare('SELECT * FROM conversations WHERE id=? AND (buyer_id=? OR seller_id=?)').get(id, user.id, user.id);
  if (!result) throw new HttpError(404, 'Conversation not found.');
  return result;
}
export const handler = async (req, res, url) => {
  if (!url.pathname.startsWith('/api/conversations')) return;
  const user = await authenticate(req);
  if (req.method === 'GET' && url.pathname === '/api/conversations') {
    const conversations = db.prepare(`SELECT c.*,
      (SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_message
      FROM conversations c WHERE buyer_id=? OR seller_id=? ORDER BY updated_at DESC, rowid DESC`).all(user.id, user.id);
    return json(res, 200, { conversations });
  }
  if (req.method === 'POST' && url.pathname === '/api/conversations') {
    const input = await body(req); const listingId = text(input.listing_id, 'Listing', 1, 80);
    const response = await fetch(`${process.env.LISTING_SERVICE_URL || 'http://localhost:3002'}/api/listings/${encodeURIComponent(listingId)}`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) throw new HttpError(404, 'Listing not found.');
    if (!response.ok) throw new HttpError(503, 'Listing service is unavailable.');
    const { listing } = await response.json();
    if (listing.seller_id === user.id) throw new HttpError(400, 'This is your own listing.');
    if (listing.status === 'sold') throw new HttpError(409, 'This item has already sold.');
    db.prepare(`INSERT OR IGNORE INTO conversations (id,listing_id,title,buyer_id,buyer_name,seller_id,seller_name)
      VALUES (?,?,?,?,?,?,?)`).run(randomUUID(), listing.id, listing.title, user.id, user.name, listing.seller_id, listing.seller_name);
    const item = db.prepare('SELECT * FROM conversations WHERE listing_id=? AND buyer_id=?').get(listing.id, user.id);
    return json(res, 200, { conversation: item });
  }
  const match = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (!match) return;
  const item = conversation(match[1], user);
  if (req.method === 'GET') {
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    return json(res, 200, { messages: db.prepare('SELECT * FROM messages WHERE conversation_id=? AND id>? ORDER BY id LIMIT 500').all(item.id, after) });
  }
  if (req.method === 'POST') {
    const content = text((await body(req)).content, 'Message', 1, 2000);
    const result = db.prepare('INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)').run(item.id, user.id, content);
    db.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(item.id);
    return json(res, 201, { message: db.prepare('SELECT * FROM messages WHERE id=?').get(result.lastInsertRowid) });
  }
};
if (process.env.NODE_ENV !== 'test') serve(handler, 3003);
