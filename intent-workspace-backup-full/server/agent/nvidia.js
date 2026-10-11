// One small helper for every LLM call (NVIDIA, OpenAI-compatible chat completions).
export async function chat(messages, { max_tokens = 900, timeout = 12000, temperature = 0.2 } = {}) {
  const base = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(timeout),
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.NVIDIA_API_KEY },
    body: JSON.stringify({ model: process.env.LLM_MODEL || 'meta/llama-3.3-70b-instruct', max_tokens, temperature, messages })
  });
  if (!res.ok) throw new Error('LLM HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  return String(j.choices?.[0]?.message?.content || '');
}

// Llama sometimes adds text or code fences around the JSON: keep only the object.
export function parseJson(raw) {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON in reply');
  return JSON.parse(raw.slice(a, b + 1));
}
