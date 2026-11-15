/*
 * BatchBite - frontend configuration
 * ----------------------------------
 * API_BASE is where the frontend sends API requests.
 *
 * "/api" works with backend/server.js, which serves these pages and the API
 * from one address (npm start -> http://localhost:3000). It also still works
 * with the optional dev-server.js, which forwards /api requests to the backend.
 */
window.BATCHBITE_CONFIG = {
  API_BASE: '/api'
};
