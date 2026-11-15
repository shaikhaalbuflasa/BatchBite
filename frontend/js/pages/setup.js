/*
 * BatchBite - first-run setup page
 * Shown only when the database has no Administrator yet (a fresh download).
 * Creates the first Administrator from the browser, then signs them in, so the
 * app is ready to use without any terminal commands.
 *
 * Backend routes used:
 *   GET  /setup/status   - { needsAdministrator: true | false }
 *   POST /setup/admin    - create the first Administrator { name, email, password }
 *   POST /login          - sign the new Administrator in (through Auth.login)
 */
(async () => {
  const form = document.getElementById('setup-form');
  const button = form.querySelector('[type=submit]');

  // Already set up: this page is closed, go to Log in
  try {
    const status = await Api.request('/setup/status');
    if (!status.needsAdministrator) {
      location.replace('login.html');
      return;
    }
  } catch (err) {
    UI.showResultError(form, { ok: false, error: err.message });
    button.disabled = true;
    return;
  }

  UI.bindPasswordToggles(form);
  form.querySelector('[name=name]').focus();

  function validate(data) {
    const name = String(data.name || '').trim();
    if (name.length < 2) return { ok: false, field: 'name', error: 'Enter your full name.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || '').trim())) {
      return { ok: false, field: 'email', error: 'Enter a valid email address, e.g. name@example.com.' };
    }
    if (String(data.password || '').length < 8) return { ok: false, field: 'password', error: 'Password must be at least 8 characters.' };
    if (data.password !== data.confirmPassword) return { ok: false, field: 'confirmPassword', error: 'Passwords do not match.' };
    return { ok: true };
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;                    // ignore double clicks (FR-21)
    UI.clearErrors(form);
    const data = UI.formData(form);
    const check = validate(data);
    if (!check.ok) return UI.showResultError(form, check);

    UI.setBusy(button, true, 'Setting up...');
    try {
      await Api.request('/setup/admin', {
        method: 'POST',
        body: { name: data.name.trim(), email: data.email.trim(), password: data.password }
      });
    } catch (err) {
      UI.setBusy(button, false);
      if (err.status === 403) { location.replace('login.html'); return; }
      return UI.showResultError(form, { ok: false, error: err.message, field: /email/i.test(err.message) ? 'email' : null });
    }

    const login = await Auth.login(data.email, data.password, true);
    if (!login.ok) { location.replace('login.html?email=' + encodeURIComponent(data.email.trim())); return; }
    location.replace('home.html');
  });
})();
