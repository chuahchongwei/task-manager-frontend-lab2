// All communication with the backend API lives in this file.
//
// VITE_API_URL comes from .env.local (local) or from the Amplify console (AWS).
// Vite replaces import.meta.env.VITE_API_URL with the real value at BUILD time.
// Only during local development (npm run dev) do we fall back to localhost.
const configuredUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '');
export const API_URL = configuredUrl.trim().replace(/\/+$/, '');

const NOT_CONFIGURED =
  'VITE_API_URL was not set when this site was built. Add it in Amplify (Hosting → Environment variables) and redeploy.';

// Give up after 15 seconds instead of waiting forever
// (e.g. when port 443 is blocked by the EC2 security group).
const TIMEOUT_MS = 15000;

async function send(path, options = {}) {
  if (!API_URL) throw new Error(NOT_CONFIGURED);
  try {
    return await fetch(`${API_URL}${path}`, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // fetch only throws when the server can't be reached at all
    // (wrong URL, server down, timeout, or blocked by CORS / mixed content).
    if (err.name === 'TimeoutError') {
      throw new Error(`The API at ${API_URL} did not answer within ${TIMEOUT_MS / 1000} seconds.`);
    }
    throw new Error(`Cannot reach the API at ${API_URL}.`);
  }
}

async function request(path, options = {}) {
  const response = await send(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status === 204) return null; // e.g. after DELETE

  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = data?.details?.join(' ') || data?.error || `Request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (data === undefined) {
    // e.g. VITE_API_URL points at a website that answers with an HTML page
    throw new Error(`${API_URL} did not answer like the Task Manager API. Check VITE_API_URL.`);
  }
  return data;
}

export function listTasks(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/tasks${query}`);
}

export function createTask(task) {
  return request('/api/tasks', { method: 'POST', body: JSON.stringify(task) });
}

export function updateTask(id, task) {
  return request(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) });
}

export function deleteTask(id) {
  return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

// Health check used by the connection banner.
// Returns { api, database, detail, unreachable } (unreachable = no answer at all).
export async function checkHealth() {
  let response;
  try {
    response = await send('/api/health');
  } catch (err) {
    return { api: false, database: false, detail: err.message, unreachable: Boolean(API_URL) };
  }

  const data = await response.json().catch(() => null);
  // Our API always answers /api/health with status "ok" or "error".
  // Anything else means VITE_API_URL points at some other website.
  if (!data || !['ok', 'error'].includes(data.status)) {
    return {
      api: false,
      database: false,
      detail: `${API_URL} answered (HTTP ${response.status}), but it is not the Task Manager API. Check VITE_API_URL: it should be the API's base address (e.g. https://…sslip.io or https://…on.aws), without /api at the end.`,
    };
  }
  if (data.database === 'ok') return { api: true, database: true, detail: '' };
  return { api: true, database: false, detail: `Database error: ${data.code || 'UNKNOWN'}. ${data.hint || ''}`.trim() };
}
