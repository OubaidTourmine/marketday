export async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unexpected response.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}
