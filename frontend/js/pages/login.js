/* Login page */
(() => {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');

  // Only allow redirects to pages inside the app
  function safeNext() {
    return next && /^[\w-]+\.html([?#].*)?$/.test(next) ? next : 'home.html';
  }

  // Already signed in
  if (Auth.currentUser() && !params.has('expired')) {
    location.replace(safeNext());
    return;
  }

  // Fresh install with no Administrator yet: go to first-run setup instead
  Api.request('/setup/status')
    .then(status => { if (status.needsAdministrator) location.replace('setup.html'); })
    .catch(() => { /* server unreachable: the login form shows the error on submit */ });

  const notice = document.getElementById('notice');
  const messages = {
    loggedOut: 'You have been logged out.',
    registered: 'Account created. You can now log in.',
    expired: 'Your session has ended. Please log in again.'
  };
  let shown = false;
  Object.keys(messages).forEach(key => {
    if (params.has(key)) { notice.textContent = messages[key]; notice.hidden = false; shown = true; }
  });
  if (next && !shown) { notice.textContent = 'Please log in to continue.'; notice.hidden = false; }

  const form = document.getElementById('login-form');
  const button = form.querySelector('[type=submit]');
  const emailInput = form.querySelector('[name=email]');
  emailInput.value = params.get('email') || Store.get('lastEmail', '') || '';
  (emailInput.value ? form.querySelector('[name=password]') : emailInput).focus();

  UI.bindPasswordToggles(form);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    UI.clearErrors(form);
    notice.hidden = true;
    UI.setBusy(button, true, 'Logging in...');

    const data = UI.formData(form);
    const result = await Auth.login(data.email, data.password, data.remember);
    if (!result.ok) {
      UI.setBusy(button, false);
      UI.showResultError(form, result);
      return;
    }
    location.replace(safeNext());
  });

  document.getElementById('forgot-btn').addEventListener('click', () => {
    UI.modal({
      title: 'Forgot your password?',
      message: 'Online password reset is not available in this version of BatchBite. Please contact the BatchBite administrator for help with your account.',
      confirmText: 'OK',
      cancelText: 'Close'
    });
  });
})();
