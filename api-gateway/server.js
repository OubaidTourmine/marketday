import { serve, json, HttpError } from '../shared/core.js';

const routes = [
  ['/api/auth/', process.env.USER_SERVICE_URL || 'http://localhost:3001'],
  ['/api/listings', process.env.LISTING_SERVICE_URL || 'http://localhost:3002'],
  ['/api/favorites', process.env.LISTING_SERVICE_URL || 'http://localhost:3002'],
  ['/api/conversations', process.env.MESSAGING_SERVICE_URL || 'http://localhost:3003'],
];
export const handler = async (req, res, url) => {
  const target = routes.find(([prefix]) => url.pathname.startsWith(prefix));
  if (!target) return json(res, 404, { error: 'API route not found.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw new HttpError(403, 'Invalid request origin.'); }
    if (origin.host !== req.headers.host) throw new HttpError(403, 'Cross-origin request rejected.');
  }
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  let response;
  try {
    response = await fetch(new URL(req.url, target[1]), {
      method: req.method, redirect: 'error',
      headers: { cookie: req.headers.cookie || '', 'content-type': req.headers['content-type'] || '', 'x-real-ip': req.socket.remoteAddress },
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}), signal: AbortSignal.timeout(10000),
    });
  } catch { throw new HttpError(502, 'Service unavailable. Please try again.'); }
  const cookies = response.headers.getSetCookie();
  res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  res.end(await response.text());
};
if (process.env.NODE_ENV !== 'test') serve(handler, 8080);
