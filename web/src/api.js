const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message, { code, status, extra } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra || {};
  }
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const qs = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    : '';
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the GigTask API. Check that the server is running on port 4000.', { code: 'NETWORK' });
  }
  let data = null;
  try {
    data = await res.json();
  } catch { /* non-JSON body */ }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.message || `Request failed (${res.status}).`, {
      code: e?.code,
      status: res.status,
      extra: e || {},
    });
  }
  return data;
}
