/*
 * BatchBite - browser storage helper
 * ----------------------------------
 * All business data (users, products, orders...) lives in the backend.
 * The browser only keeps:
 *   batchbite.session        -> signed-in session (token + user), localStorage when
 *                               "Keep me signed in" is ticked, otherwise sessionStorage
 *   batchbite.lastEmail      -> last email used to log in (pre-fills the login form)
 *   batchbite.adminUserView  -> Manage Users filters and sort order
 */
const Store = (() => {
  const PREFIX = 'batchbite.';

  function area(persistent) {
    return persistent ? window.localStorage : window.sessionStorage;
  }

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key) ?? sessionStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function set(key, value, persistent) {
    try {
      remove(key);
      area(persistent !== false).setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('BatchBite: browser storage is unavailable, "' + key + '" was not saved.');
      return false;
    }
  }

  function remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      sessionStorage.removeItem(PREFIX + key);
    } catch (err) { /* storage unavailable */ }
  }

  return { get, set, remove };
})();
