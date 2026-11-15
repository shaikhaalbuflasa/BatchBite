/* Login page */
(() => {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');

  // Only allow redirects to pages inside the app
  function safeNext() {
    return next && /^[\w-]+\.html([?#].*)?$/.test(next) ? next : 'home.html';
  }

  // Already signed in (unless adding another account from "Switch account")
  if (Auth.currentUser() && !params.has('expired') && !params.has('add') && !params.has('registered')) {
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

  /* ---------- "Who are you?" role choice ---------- */
  const ROLE_INFO = {
    Customer: { hint: 'Browse open batches, order and pick up.', signup: 'Customer' },
    BusinessOwner: { hint: 'Manage products, batches, pickup times, orders and your kitchen team.', signup: 'BusinessOwner' },
    KitchenStaff: { hint: 'Kitchen Staff accounts are created by your Business Owner on their Kitchen Staff page. Use the email and password they gave you.' },
    Administrator: { hint: 'The Administrator account is created the first time BatchBite is opened.' }
  };
  const footer = document.getElementById('auth-footer');
  const signupLink = document.getElementById('signup-link');
  const chosen = params.get('as') || Store.get('lastRole', 'Customer');
  const radio = form.querySelector('[name=as][value="' + chosen + '"]');
  if (radio) radio.checked = true;

  function selectedRole() {
    const r = form.querySelector('[name=as]:checked');
    return r ? r.value : 'Customer';
  }
  function showRole() {
    const info = ROLE_INFO[selectedRole()];
    document.getElementById('role-hint').textContent = info.hint;
    footer.hidden = !info.signup;
    if (info.signup) signupLink.href = 'register.html?as=' + info.signup;
  }
  form.querySelectorAll('[name=as]').forEach(r => r.addEventListener('change', () => { showRole(); UI.clearErrors(form); }));
  showRole();
  const emailInput = form.querySelector('[name=email]');
  emailInput.value = params.get('email') || (params.has('add') ? '' : Store.get('lastEmail', '')) || '';
  (emailInput.value ? form.querySelector('[name=password]') : emailInput).focus();

  UI.bindPasswordToggles(form);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    UI.clearErrors(form);
    notice.hidden = true;
    UI.setBusy(button, true, 'Logging in...');

    const data = UI.formData(form);
    const role = selectedRole();
    const result = await Auth.login(data.email, data.password, data.remember, role);
    if (!result.ok) {
      UI.setBusy(button, false);
      UI.showResultError(form, result);
      return;
    }
    Store.set('lastRole', role, true);
    location.replace(params.has('add') || params.has('registered') ? 'home.html' : safeNext());
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
