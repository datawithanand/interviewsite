const API_BASE = '/api';

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getStoredToken() {
  return localStorage.getItem('token');
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

authToken = getStoredToken();

async function request(path, { method = 'GET', body, headers = {}, isForm = false, rawResponse = false } = {}) {
  const finalHeaders = { ...headers };
  if (!isForm) finalHeaders['Content-Type'] = 'application/json';
  if (authToken) finalHeaders.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && onUnauthorized) onUnauthorized();

  if (rawResponse) return res;

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (data && data.error) || `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true }),
  download: (path) => request(path, { rawResponse: true }),
};
