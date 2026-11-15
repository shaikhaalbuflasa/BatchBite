/*
 * BatchBite - frontend configuration
 * ----------------------------------
 * API_BASE is where the frontend sends API requests.
 *
 * "/api" works with dev-server.js, which serves these pages and forwards
 * every /api/... request to the backend (http://localhost:3000 by default).
 * This avoids browser CORS errors without changing the backend.
 *
 * If the backend later serves the frontend itself or enables CORS,
 * change this to the backend address, e.g. "http://localhost:3000".
 */
window.BATCHBITE_CONFIG = {
  API_BASE: '/api'
};
