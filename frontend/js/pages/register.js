/* Registration page (creates Customer accounts through POST /register) */
(() => {
  if (Auth.currentUser()) {
    location.replace('home.html');
    return;
  }

  const form = document.getElementById('register-form');
  const button = form.querySelector('[type=submit]');

  UI.bindPasswordToggles(form);
  form.querySelector('[name=name]').focus();

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
    location.replace('login.html?registered=1&email=' + encodeURIComponent(result.user.email));
  });
})();
