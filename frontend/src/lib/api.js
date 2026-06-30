const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:3000';

function getToken() {
  return sessionStorage.getItem('signal_token');
}

/**
 * Thin fetch wrapper: attaches the bearer token, throws on non-2xx with the
 * server's error message surfaced, and parses JSON. sessionStorage (not
 * localStorage) is a deliberate choice — the throwaway admin account this
 * gets used with doesn't need to persist across browser restarts, and it
 * keeps the token out of long-lived storage.
 */
async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  getInteractions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/interactions${qs ? `?${qs}` : ''}`);
  },
  getStats: () => request('/interactions/stats'),
  getGuilds: () => request('/guilds'),
  createGuild: (payload) => request('/guilds', { method: 'POST', body: payload }),
  deleteGuild: (id) => request(`/guilds/${id}`, { method: 'DELETE' }),
  getCommandConfigs: (guildId) => request(`/command-configs?guild_id=${guildId}`),
  updateCommandConfig: (id, payload) => request(`/command-configs/${id}`, { method: 'PATCH', body: payload }),
};

export function setToken(token) {
  sessionStorage.setItem('signal_token', token);
}

export function clearToken() {
  sessionStorage.removeItem('signal_token');
}

export function hasToken() {
  return Boolean(getToken());
}
