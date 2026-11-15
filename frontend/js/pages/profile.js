/* My account: details of the signed-in user and session */
(async () => {
  const me = await Auth.requireRole();
  if (!me) return;

  UI.renderHeader(me, 'profile');

  const role = Auth.ROLES[me.role] || { label: me.role, description: '' };
  const session = Store.get('session', {});

  document.getElementById('p-avatar').textContent = UI.initials(me.name);
  document.getElementById('p-name').textContent = me.name;
  document.getElementById('p-role').innerHTML = UI.roleBadge(me.role);
  document.getElementById('p-email').textContent = me.email;
  document.getElementById('p-id').textContent = '#' + me.id;
  document.getElementById('p-status').textContent = me.isActive ? 'Active' : 'Inactive';
  document.getElementById('p-role-text').textContent = role.label + ': ' + role.description;

  document.getElementById('p-modules').innerHTML = Auth.modulesFor(me)
    .filter(m => m.id !== 'account')
    .map(m => '<li><strong>' + UI.escape(m.title) + '</strong> - ' + UI.escape(m.text) + '</li>')
    .join('');

  document.getElementById('p-session').textContent =
    'Signed in on ' + UI.formatDate(session.signedInAt, true) +
    '. For security, the session ends automatically on ' + UI.formatDate(session.expiresAt, true) + '.';

  document.getElementById('logout-here').addEventListener('click', () => {
    document.getElementById('logout-btn').click();
  });
})();
