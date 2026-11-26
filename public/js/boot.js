(function () {
  'use strict';
  const SL = window.SL;
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  (async function start() {
    document.documentElement.lang = SL.state.lang === 'ta' ? 'ta' : 'en';
    try {
      const me = await SL.api('GET', '/api/auth/me', undefined, { quiet: true });
      SL.state.user = me.user; SL.state.csrf = me.csrf;
      if (!SL.tabMarked() && navigator.onLine) {      // new tab, but this browser is already signed in
        const h = SL.h, t = SL.t;
        document.getElementById('root').replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card stack' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'S'), 'SnackLedger'),
          h('p', {}, t('This browser is already signed in as') + ' ', h('strong', {}, me.user.name || me.user.username), ' (' + me.user.role + ').'),
          h('button', { class: 'btn primary big', 'data-testid': 'continue-as', onclick: () => { SL.markTab(); location.reload(); } }, t('Continue as') + ' ' + (me.user.name || me.user.username)),
          h('button', { class: 'btn big', onclick: async () => { await SL.logout(); } }, t('Sign out and use another account')),
          h('p', { class: 'muted' }, t('Tip: tabs of one browser share one login. To use two users at the same time, open a private window for the second user.')))));
        return;
      }
      SL.markTab();
      if (SL.offline && SL.offline.onLogin) SL.offline.onSession && SL.offline.onSession(me.user, me.csrf);
      SL.render();
    } catch (e) { SL.showLogin(); }
    if (SL.offline && SL.offline.init) SL.offline.init();
  })();
})();
