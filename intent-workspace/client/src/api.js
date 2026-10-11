const j = async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const post = (url, body, ms) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }).then(j);
export const api = {
  data: (client = '') => fetch('/api/data?client=' + encodeURIComponent(client)).then(j),
  intent: (body) => post('/api/intent', body, 120000),
  action: (body) => post('/api/action', body, 20000),
  eval: (mode) => fetch('/api/eval?mode=' + mode, { signal: AbortSignal.timeout(90000) }).then(j)
};
