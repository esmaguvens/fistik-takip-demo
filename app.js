// Uygulama iskeleti: menü, sayfa yönlendirme, otomatik kilit.
'use strict';

const App = (() => {
  const { h, icon, clear } = UI;

  const NAV = [
    { hash: '#/fis/yeni', label: 'Yeni Fiş', icon: 'plus', primary: true },
    { hash: '#/ana', label: 'Ana Sayfa', icon: 'home' },
    { hash: '#/fisler', label: 'Fişler', icon: 'receipt', match: /^#\/fis(ler|\/\d+)/ },
    { hash: '#/musteriler', label: 'Müşteriler', icon: 'users', match: /^#\/musteri/ },
    { hash: '#/urunler', label: 'Ürünler ve Fiyatlar', icon: 'tag' },
    { hash: '#/stok', label: 'Stok', icon: 'box' },
    { sep: true },
    { hash: '#/yedek', label: 'Yedekleme', icon: 'save' },
    { hash: '#/gecmis', label: 'Kayıt Geçmişi', icon: 'history' },
    { hash: '#/ayarlar', label: 'Ayarlar', icon: 'settings' },
  ];

  // [desen, ekran adı]
  const ROUTES = [
    [/^#\/ana$/, 'home'],
    [/^#\/fis\/yeni(?:\/(\d+))?$/, 'fisNew'],
    [/^#\/fis\/(\d+)\/duzelt$/, 'fisEdit'],
    [/^#\/fis\/(\d+)$/, 'fisDetail'],
    [/^#\/fisler$/, 'fisler'],
    [/^#\/musteriler$/, 'musteriler'],
    [/^#\/musteri\/(\d+)$/, 'musteri'],
    [/^#\/urunler$/, 'urunler'],
    [/^#\/stok$/, 'stok'],
    [/^#\/yedek$/, 'yedek'],
    [/^#\/ayarlar$/, 'ayarlar'],
    [/^#\/gecmis$/, 'gecmis'],
  ];

  let settings = {};
  let leaveGuard = null;
  let currentHash = null;
  let ignoreHash = false;
  let lastActivity = Date.now();
  let unlocked = false;

  function buildNav() {
    const nav = document.getElementById('nav');
    clear(nav);
    for (const n of NAV) {
      if (n.sep) { nav.appendChild(h('div', { class: 'sep' })); continue; }
      nav.appendChild(h('a', { href: n.hash, class: n.primary ? 'primary' : '', dataset: { hash: n.hash } }, icon(n.icon, 22), h('span', null, n.label)));
    }
    const lock = document.getElementById('lock-btn');
    clear(lock);
    lock.appendChild(icon('lock', 18));
    lock.appendChild(h('span', null, 'Kilitle'));
    lock.onclick = () => lockNow();
  }

  function markNav(hash) {
    for (const a of document.querySelectorAll('#nav a')) {
      const n = NAV.find((x) => x.hash === a.dataset.hash);
      const on = n.match ? n.match.test(hash) : hash === n.hash || (n.hash === '#/fis/yeni' && /^#\/fis\/yeni/.test(hash));
      a.classList.toggle('active', on);
    }
  }

  async function route() {
    if (!unlocked) return;
    const hash = location.hash || '#/ana';
    if (ignoreHash) { ignoreHash = false; return; }
    if (leaveGuard && currentHash && hash !== currentHash && leaveGuard()) {
      const ok = await UI.confirmBox({ title: 'Kaydedilmemiş fiş', message: 'Fişte kaydedilmemiş bilgiler var. Sayfadan çıkarsanız kaybolacak. Çıkmak istiyor musunuz?', okText: 'Evet, çık', danger: true });
      if (!ok) { ignoreHash = true; location.hash = currentHash; return; }
    }
    leaveGuard = null;
    currentHash = hash;
    markNav(hash);
    const view = document.getElementById('view');
    let name = null;
    let params = [];
    for (const [re, n] of ROUTES) {
      const m = hash.match(re);
      if (m) { name = n; params = m.slice(1); break; }
    }
    if (!name) { location.hash = '#/ana'; return; }
    try {
      const node = await window.Screens[name](...params);
      if (currentHash !== hash) return; // bu arada başka sayfaya geçildi
      clear(view);
      view.appendChild(node);
      view.scrollTop = 0;
      const auto = view.querySelector('[autofocus]');
      if (auto) auto.focus();
    } catch (e) {
      if (e.code === 'KILITLI') return;
      clear(view);
      view.appendChild(UI.page('Bir sorun oluştu', null, h('div', { class: 'notice error' }, icon('alert', 22), h('div', null, e.message))));
    }
  }

  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function reload() {
    currentHash = null;
    route();
  }

  async function loadSettings() {
    settings = await UI.api('getSettings');
    document.getElementById('brand-name').textContent = settings.company_name;
    return settings;
  }

  async function enter(status) {
    unlocked = true;
    document.getElementById('login-root').hidden = true;
    UI.clear(document.getElementById('login-root'));
    document.getElementById('shell').hidden = false;
    document.getElementById('ver').textContent = 'Sürüm ' + (status && status.version ? status.version : '');
    await loadSettings();
    lastActivity = Date.now();
    currentHash = null;
    if (!location.hash || location.hash === '#/') location.hash = '#/ana';
    else route();
    if (status && status.backup && status.backup.externalError) UI.toast('Günlük yedek alındı, fakat ' + status.backup.externalError, 'error', 8000);
  }

  function showLogin() {
    unlocked = false;
    leaveGuard = null;
    document.getElementById('shell').hidden = true;
    UI.clear(document.getElementById('modal-root'));
    const root = document.getElementById('login-root');
    root.hidden = false;
    window.Screens.login(root, enter);
  }

  async function lockNow() {
    if (leaveGuard && leaveGuard()) {
      const ok = await UI.confirmBox({ title: 'Kaydedilmemiş fiş', message: 'Kaydedilmemiş fiş bilgileri kaybolacak. Yine de kilitlensin mi?', okText: 'Kilitle', danger: true });
      if (!ok) return;
    }
    await UI.auth('lock');
    showLogin();
  }

  // Otomatik kilit
  ['mousemove', 'keydown', 'mousedown', 'wheel'].forEach((ev) => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
  setInterval(async () => {
    if (!unlocked) return;
    const min = Number(settings.auto_lock_minutes) || 0;
    if (min > 0 && Date.now() - lastActivity > min * 60000) {
      await UI.auth('lock');
      showLogin();
    }
  }, 20000);

  window.addEventListener('hashchange', route);

  async function start() {
    buildNav();
    showLogin();
  }

  return {
    start, go, reload, showLogin, loadSettings,
    get settings() { return settings; },
    setLeaveGuard(fn) { leaveGuard = fn; },
  };
})();

window.App = App;
App.start();
