import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { database, serve, body, text, cookie, json, HttpError } from '../shared/core.js';

const derive = promisify(scrypt);
const db = database(process.env.DATA_FILE || './data/users.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
);`);
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });
const hash = token => createHash('sha256').update(token).digest('hex');
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + Buffer.from(await derive(password, salt, 64)).toString('hex');
}
async function matches(password, stored) {
  const candidate = await passwordHash(password, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(stored));
}
function sessionCookie(token, age = 604800) {
  return `marketday_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`;
}
function currentUser(req) {
  const token = cookie(req, 'marketday_session');
  const user = token && db.prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
    WHERE s.token=? AND s.expires>?`).get(hash(token), Date.now());
  if (!user) throw new HttpError(401, 'Please sign in to continue.');
  return publicUser(user);
}
function signIn(res, user, status = 200) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)').run(hash(token), user.id, Date.now() + 604800000);
  json(res, status, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token) });
}
const attempts = new Map();
function rateLimit(req) {
  const key = req.headers['x-real-ip'] || req.socket.remoteAddress;
  const now = Date.now();
  for (const [ip, entry] of attempts) if (entry.until < now) attempts.delete(ip);
  const entry = attempts.get(key) || { count: 0, until: now + 60000 };
  if (++entry.count > 15) throw new HttpError(429, 'Too many attempts. Try again in a minute.');
  attempts.set(key, entry);
}
if (process.env.SEED_DEMO === 'true' && !db.prepare('SELECT id FROM users WHERE id=?').get('demo-seller')) {
  db.prepare('INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)').run(
    'demo-seller', 'Marketday Studio', 'demo@marketday.local', await passwordHash('MarketdayDemo2026!'));
}
export const handler = async (req, res, url) => {
  if (req.method === 'GET' && url.pathname === '/api/auth/me') return json(res, 200, { user: currentUser(req) });
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    db.prepare('DELETE FROM sessions WHERE token=?').run(hash(cookie(req, 'marketday_session')));
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if (req.method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(url.pathname)) {
    rateLimit(req);
    const input = await body(req);
    const email = text(input.email, 'Email', 3, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = text(input.password, 'Password', 8, 128);
    if (url.pathname.endsWith('/register')) {
      const name = text(input.name, 'Name', 2, 60);
      const encoded = await passwordHash(password);
      const user = { id: randomUUID(), name, email };
      try { db.prepare('INSERT INTO users (id,name,email,password) VALUES (?,?,?,?)').run(user.id, name, email, encoded); }
      catch (error) {
        if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new HttpError(409, 'This email is already registered.');
        throw error;
      }
      return signIn(res, user, 201);
    }
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    // Do the same expensive password work for unknown accounts.
    const stored = user?.password || await passwordHash('invalid-password', '00000000000000000000000000000000');
    const valid = await matches(password, stored);
    if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect.');
    return signIn(res, user);
  }
};
if (process.env.NODE_ENV !== 'test') serve(handler, 3001);
