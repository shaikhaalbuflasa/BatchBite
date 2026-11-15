/* Registration page (creates Customer accounts through POST /register) */
(() => {
  // Signed-in users go Home, unless they came from the login page to add
  // another account (the Sign up link carries ?as=Customer or ?as=BusinessOwner)
  if (Auth.currentUser() && !new URLSearchParams(location.search).has('as')) {
    location.replace('home.html');
    return;
  }

  const form = document.getElementById('register-form');
  const button = form.querySelector('[type=submit]');

  UI.bindPasswordToggles(form);
  form.querySelector('[name=name]').focus();

  // Pre-select the account type chosen on the login page (?as=BusinessOwner)
  const as = new URLSearchParams(location.search).get('as');
  const typeRadio = form.querySelector('[name=accountType][value="' + as + '"]');
  if (typeRadio) typeRadio.checked = true;

  // Tell the user straight away if the passwords stop matching
  const confirmInput = form.querySelector('[name=confirmPassword]');
  confirmInput.addEventListener('blur', () => {
    const slot = form.querySelector('[data-error-for=confirmPassword]');
    const mismatch = confirmInput.value && confirmInput.value !== form.querySelector('[name=password]').value;
    slot.textContent = mismatch ? 'Passwords do not match.' : '';
    confirmInput.classList.toggle('invalid', !!mismatch);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;           // ignore double clicks (FR-21)
    UI.clearErrors(form);
    UI.setBusy(button, true, 'Creating account...');

    const result = await Auth.register(UI.formData(form));
    if (!result.ok) {
      UI.setBusy(button, false);
      UI.showResultError(form, result);
      return;
    }
    location.replace('login.html?registered=1&as=' + encodeURIComponent(result.user.role) + '&email=' + encodeURIComponent(result.user.email));
  });
})();
