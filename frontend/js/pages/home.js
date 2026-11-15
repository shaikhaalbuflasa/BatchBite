/* Home page: role-based landing screen */
(async () => {
  const me = await Auth.requireRole(); // any signed-in role
  if (!me) return;

  UI.renderHeader(me, 'home');

  const role = Auth.ROLES[me.role];
  document.getElementById('welcome-avatar').textContent = UI.initials(me.name);
  document.getElementById('welcome-title').textContent = 'Welcome, ' + me.name.split(' ')[0];
  document.getElementById('welcome-role').innerHTML = UI.roleBadge(me.role) + ' &nbsp;' + UI.escape(role ? role.description : '');

  const grid = document.getElementById('modules');
  grid.innerHTML = Auth.modulesFor(me).map(module => {
    if (module.ready) {
      return '<a class="module" href="' + UI.escape(module.href) + '">' +
               '<h3>' + UI.escape(module.title) + '</h3>' +
               '<p>' + UI.escape(module.text) + '</p>' +
               '<span class="go">Open →</span>' +
             '</a>';
    }
    return '<div class="module disabled" aria-disabled="true">' +
             '<h3>' + UI.escape(module.title) + '</h3>' +
             '<p>' + UI.escape(module.text) + '</p>' +
             '<span class="tag">Being integrated</span>' +
           '</div>';
  }).join('');
})();
