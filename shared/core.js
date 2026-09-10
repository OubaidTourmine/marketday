import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function database(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  return db;
}
export function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
export async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Send JSON data.');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch { throw new HttpError(400, 'Invalid JSON data.'); }
}
export function text(value, label, min = 1, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `${label} must be ${min}–${max} characters.`);
  }
  return value.trim();
}
export function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export async function authenticate(req) {
  const response = await fetch(`${process.env.USER_SERVICE_URL || 'http://localhost:3001'}/api/auth/me`, {
    headers: { cookie: req.headers.cookie || '' }, signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401) throw new HttpError(401, 'Please sign in to continue.');
  if (!response.ok) throw new HttpError(503, 'Account service is unavailable.');
  return (await response.json()).user;
}
export function requestHandler(handler) {
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') return json(res, 200, { ok: true });
      await handler(req, res, url);
      if (!res.writableEnded) throw new HttpError(404, 'Not found.');
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (!error.status) console.error(error);
      json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
    }
  };
}
export function serve(handler, defaultPort) {
  const server = http.createServer(requestHandler(handler));
  server.requestTimeout = 15_000;
  server.listen(Number(process.env.PORT || defaultPort), process.env.HOST || '0.0.0.0', () => {
    console.log(`Listening on ${server.address().port}`);
  });
  return server;
}
