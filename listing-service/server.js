import { randomUUID } from 'node:crypto';
import { database, serve, authenticate, body, text, json, HttpError } from '../shared/core.js';
import { samples } from './seed.js';

const db = database(process.env.DATA_FILE || './data/listings.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, seller_name TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
  category TEXT NOT NULL, condition TEXT NOT NULL, city TEXT NOT NULL, image TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL, listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,listing_id)
);`);
const categories = ['Home', 'Electronics', 'Fashion', 'Outdoors', 'Books', 'Other'];
const conditions = ['New', 'Like new', 'Good', 'Fair'];
const insert = db.prepare(`INSERT INTO listings (id,seller_id,seller_name,title,description,price,category,condition,city,image)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
if (process.env.SEED_DEMO === 'true' && !db.prepare('SELECT id FROM listings LIMIT 1').get()) {
  for (const [i, [title, price, category, condition, city, description, photo]] of samples.entries()) {
    insert.run(`sample-${i + 1}`, 'demo-seller', 'Marketday Studio', title, description, price * 100, category, condition, city,
      `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=900&q=80`);
  }
}
function getListing(id) {
  const listing = db.prepare('SELECT * FROM listings WHERE id=?').get(id);
  if (!listing) throw new HttpError(404, 'This listing is no longer here.');
  return listing;
}
function validate(input) {
  const title = text(input.title, 'Title', 3, 100);
  const description = text(input.description, 'Description', 10, 3000);
  const city = text(input.city, 'City', 2, 80);
  if (!categories.includes(input.category) || !conditions.includes(input.condition)) throw new HttpError(400, 'Choose a category and condition.');
  if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price < 0 || input.price > 10000000) throw new HttpError(400, 'Enter a valid price.');
  const price = Math.round(input.price * 100);
  const image = typeof input.image === 'string' ? input.image.trim() : '';
  if (image) {
    let url; try { url = new URL(image); } catch { throw new HttpError(400, 'Enter a valid HTTPS image URL.'); }
    if (url.protocol !== 'https:' || image.length > 2000 || url.username || url.password) throw new HttpError(400, 'Use an HTTPS image URL without credentials.');
  }
  return { title, description, city, category: input.category, condition: input.condition, price, image };
}
export const handler = async (req, res, url) => {
  if (req.method === 'GET' && url.pathname === '/api/listings') {
    const clauses = []; const params = [];
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) { clauses.push('(instr(lower(title),lower(?))>0 OR instr(lower(description),lower(?))>0)'); params.push(q, q); }
    for (const key of ['category', 'city', 'status']) {
      if (url.searchParams.get(key)) { clauses.push(`${key}=?`); params.push(url.searchParams.get(key)); }
    }
    if (url.searchParams.get('mine') === 'true') { clauses.push('seller_id=?'); params.push((await authenticate(req)).id); }
    if (url.searchParams.get('saved') === 'true') {
      clauses.push('id IN (SELECT listing_id FROM favorites WHERE user_id=?)'); params.push((await authenticate(req)).id);
    }
    const sort = { newest: 'created_at DESC, rowid DESC', lowest: 'price ASC', highest: 'price DESC' }[url.searchParams.get('sort')] || 'created_at DESC, rowid DESC';
    const listings = db.prepare(`SELECT * FROM listings ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY ${sort} LIMIT 200`).all(...params);
    return json(res, 200, { listings });
  }
  if (req.method === 'GET' && url.pathname === '/api/favorites') {
    const user = await authenticate(req);
    return json(res, 200, { ids: db.prepare('SELECT listing_id FROM favorites WHERE user_id=?').all(user.id).map(r => r.listing_id) });
  }
  if (req.method === 'POST' && url.pathname === '/api/listings') {
    const user = await authenticate(req); const item = validate(await body(req)); const id = randomUUID();
    insert.run(id, user.id, user.name, item.title, item.description, item.price, item.category, item.condition, item.city, item.image);
    return json(res, 201, { listing: getListing(id) });
  }
  const match = url.pathname.match(/^\/api\/listings\/([^/]+)(\/favorite)?$/);
  if (!match) return;
  const listing = getListing(match[1]);
  if (req.method === 'GET' && !match[2]) return json(res, 200, { listing });
  const user = await authenticate(req);
  if (match[2] && ['PUT', 'DELETE'].includes(req.method)) {
    if (req.method === 'PUT') db.prepare('INSERT OR IGNORE INTO favorites VALUES (?,?)').run(user.id, listing.id);
    else db.prepare('DELETE FROM favorites WHERE user_id=? AND listing_id=?').run(user.id, listing.id);
    return json(res, 200, { ok: true });
  }
  if (match[2]) return;
  if (listing.seller_id !== user.id) throw new HttpError(403, 'Only the seller can change this listing.');
  if (req.method === 'DELETE') {
    db.prepare('DELETE FROM listings WHERE id=?').run(listing.id);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'PATCH') {
    const input = await body(req);
    const status = input.status ?? listing.status;
    if (!['available', 'sold'].includes(status)) throw new HttpError(400, 'Invalid listing status.');
    const item = validate({ ...listing, price: listing.price / 100, ...input });
    db.prepare(`UPDATE listings SET title=?,description=?,price=?,category=?,condition=?,city=?,image=?,status=? WHERE id=?`)
      .run(item.title, item.description, item.price, item.category, item.condition, item.city, item.image, status, listing.id);
    return json(res, 200, { listing: getListing(listing.id) });
  }
};
if (process.env.NODE_ENV !== 'test') serve(handler, 3002);
