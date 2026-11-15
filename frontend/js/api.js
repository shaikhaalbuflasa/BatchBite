/*
 * BatchBite - API client
 * ----------------------
 * One helper for every request to the backend (server.js).
 * Follows the Frontend Integration Guide, section 3:
 *   - sends JSON bodies
 *   - adds "Authorization: Bearer <token>" for protected routes
 *   - throws an error with .status and the backend's error message
 *
 * Usage:
 *   const users = await Api.request('/users', { token });
 *   await Api.request('/register', { method: 'POST', body: { name, email, password } });
 */
const Api = (() => {
  const BASE = (window.BATCHBITE_CONFIG && window.BATCHBITE_CONFIG.API_BASE) || '/api';

  async function request(path, options) {
    const { method = 'GET', token, body } = options || {};
    let response;
    try {
      response = await fetch(BASE + path, {
        method,
        headers: Object.assign(
          {},
          body !== undefined ? { 'Content-Type': 'application/json' } : {},
          token ? { Authorization: 'Bearer ' + token } : {}
        ),
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (networkError) {
      const error = new Error('Cannot reach the BatchBite server. Please check that the backend is running and try again.');
      error.status = 0;
      throw error;
    }

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (parseError) { data = raw; }

    if (!response.ok) {
      const message = (data && (data.error || data.message)) || ('Request failed (HTTP ' + response.status + ')');
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  return { request, BASE };
})();
