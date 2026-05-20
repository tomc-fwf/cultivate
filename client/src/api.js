const BASE = '/api';
const getToken = () => localStorage.getItem('cv_token');

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  getUsers: () => req('GET', '/auth/users'),
  login: (user_id, pin) => req('POST', '/auth/login', { user_id, pin }),
  refreshToken: () => req('POST', '/auth/refresh'),

  // Items (reads from farmstock's items table via cultivate's API proxy — routes added in Phase 1)
  getItems: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/items${q ? '?' + q : ''}`);
  },
};
