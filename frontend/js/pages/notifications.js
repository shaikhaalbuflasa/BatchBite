/*
 * BatchBite - Notifications (Aaya)
 * --------------------------------
 * FR-20 Order notifications: confirmed, ready, cancelled and delay notices
 *   GET /notifications              the signed-in user's own notifications
 *   PUT /notifications/:id/read     mark one as read (own notifications only)
 */
(async () => {
  const me = await Auth.requireRole(['Customer', 'BusinessOwner', 'KitchenStaff', 'Administrator']);
  if (!me) return;
  UI.renderHeader(me, '');

  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));

  const TYPES = {
    OrderConfirmed: { label: 'Order confirmed', icon: '✓' },
    OrderReady: { label: 'Ready for pickup', icon: '★' },
    OrderDelayed: { label: 'Order delayed', icon: '!' },
    OrderCancelled: { label: 'Order cancelled', icon: '×' }
  };

  const state = { list: [], filter: 'all' };
  const els = {
    list: document.getElementById('notif-list'),
    summary: document.getElementById('notif-summary'),
    readAll: document.getElementById('read-all-btn'),
    refresh: document.getElementById('refresh-btn')
  };

  async function load() {
    UI.setBusy(els.refresh, true, 'Refreshing...');
    try {
      state.list = await api('/notifications');
      render();
    } catch (err) {
      els.list.innerHTML = '<p class="form-error">' + E(err.message) + '</p>';
    } finally {
      UI.setBusy(els.refresh, false);
    }
  }

  function render() {
    const unread = state.list.filter(n => !n.isRead).length;
    els.summary.textContent = state.list.length
      ? state.list.length + ' notification' + (state.list.length > 1 ? 's' : '') + ', ' + unread + ' unread.'
      : 'Updates about your orders.';
    els.readAll.hidden = unread === 0;

    const shown = state.list
      .filter(n => state.filter === 'all' || !n.isRead)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id);

    if (!shown.length) {
      els.list.innerHTML = '<div class="card empty">' +
        (state.filter === 'unread' ? 'You are all caught up. There are no unread notifications.' : 'No notifications yet. Order updates will appear here.') +
        '</div>';
      return;
    }

    els.list.innerHTML = shown.map(n => {
      const type = TYPES[n.type] || { label: n.type || 'Update', icon: 'i' };
      return '<article class="notif' + (n.isRead ? '' : ' unread') + '" data-id="' + n.id + '">' +
        '<span class="notif-icon ' + E(n.type) + '" aria-hidden="true">' + type.icon + '</span>' +
        '<div class="notif-body">' +
          '<strong>' + E(type.label) + '</strong>' +
          '<p>' + E(n.message) + '</p>' +
          '<div class="notif-meta">' +
            (n.orderId ? '<span>Order #' + E(n.orderId) + '</span>' : '') +
            '<span>' + E(UI.formatDate(n.createdAt, true)) + '</span>' +
            (n.isRead ? '<span>Read</span>' : '<span class="unread-dot">New</span>') +
          '</div>' +
        '</div>' +
        (n.isRead ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-action="read" data-id="' + n.id + '">Mark as read</button>') +
      '</article>';
    }).join('');
  }

  async function markRead(id) {
    await api('/notifications/' + id + '/read', { method: 'PUT' });
    const n = state.list.find(x => x.id === id);
    if (n) n.isRead = true;
  }

  els.list.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action="read"]');
    if (!button || button.disabled) return;
    UI.setBusy(button, true, 'Saving...');
    try {
      await markRead(Number(button.dataset.id));
      render();
    } catch (err) {
      UI.toast(err.message, 'error');
      UI.setBusy(button, false);
    }
  });

  els.readAll.addEventListener('click', async () => {
    UI.setBusy(els.readAll, true, 'Saving...');
    const unread = state.list.filter(n => !n.isRead);
    const results = await Promise.allSettled(unread.map(n => markRead(n.id)));
    const failed = results.filter(r => r.status === 'rejected').length;
    UI.setBusy(els.readAll, false);
    if (failed) UI.toast(failed + ' notification(s) could not be updated.', 'error');
    else UI.toast('All notifications marked as read.');
    render();
  });

  document.querySelectorAll('[data-filter]').forEach(tab => {
    tab.addEventListener('click', () => {
      state.filter = tab.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(t => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      render();
    });
  });

  els.refresh.addEventListener('click', load);
  load();
})();
