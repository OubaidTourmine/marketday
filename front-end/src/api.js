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
export const categories = ['Home', 'Electronics', 'Fashion', 'Outdoors', 'Books', 'Other'];
export const conditions = ['New', 'Like new', 'Good', 'Fair'];
export const money = cents => new Intl.NumberFormat('en-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export function date(value) {
  return new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
