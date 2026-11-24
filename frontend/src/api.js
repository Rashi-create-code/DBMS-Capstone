// One place for all server calls. The login token is kept in localStorage.
const KEY = 'smartstay_session';
export const session = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set: (s) => localStorage.setItem(KEY, JSON.stringify(s)),
  clear: () => localStorage.removeItem(KEY)
};

export async function api(method, url, body) {
  const s = session.get();
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && s) { session.clear(); window.location.href = '/login'; }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b);
export const put = (u, b) => api('PUT', u, b);
export const del = (u) => api('DELETE', u);

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined && v !== false) p.set(k, v === true ? '1' : v); });
  const s = p.toString();
  return s ? '?' + s : '';
};

export const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmtDate = (d) => (d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '\u00a0') : '-');
export const fmtMonth = (d) => new Date(d.slice(0, 7) + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
export const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
