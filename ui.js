// Arayüz yardımcıları: öğe oluşturma, pencereler, bildirimler, arama kutusu, sayı girişi.
'use strict';

const UI = (() => {
  const C = window.Calc;

  // h('div', { class: 'x', onclick: fn }, 'metin', çocuk, [çocuklar])
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'readOnly' || k === 'selected') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  // ---------- simgeler ----------
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6.1 4.6 1.8 5.3 4.9"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    layers: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 4v16"/>',
    save: '<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>',
    file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  };

  function icon(name, size) {
    const s = size || 20;
    const span = document.createElement('span');
    span.className = 'ico';
    span.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return span;
  }

  function btn(label, opts) {
    opts = opts || {};
    return h('button', {
      type: 'button',
      class: 'btn ' + (opts.kind || '') + (opts.big ? ' big' : '') + (opts.small ? ' small' : ''),
      onclick: opts.onClick,
      disabled: opts.disabled,
      title: opts.title,
    }, opts.icon ? icon(opts.icon, opts.big ? 24 : 18) : null, label ? h('span', null, label) : null);
  }

  // ---------- ana süreçle konuşma ----------
  async function call(channel, method, args) {
    const r = await window.fh[channel](method, ...args);
    if (!r.ok) {
      const e = new Error(r.error);
      e.code = r.code;
      if (r.code === 'KILITLI' && window.App) window.App.showLogin();
      throw e;
    }
    return r.data;
  }
  const api = (method, ...args) => call('api', method, args);
  const auth = (method, ...args) => call('auth', method, args);

  // ---------- bildirimler ----------
  function toast(message, kind, ms) {
    const root = document.getElementById('toasts');
    const el = h('div', { class: 'toast ' + (kind || 'ok') }, icon(kind === 'error' ? 'alert' : 'check', 20), h('span', null, message));
    root.appendChild(el);
    setTimeout(() => el.classList.add('out'), (ms || (kind === 'error' ? 6000 : 3000)));
    setTimeout(() => el.remove(), (ms || (kind === 'error' ? 6000 : 3000)) + 400);
  }

  function showError(e) {
    toast(e && e.message ? e.message : String(e), 'error');
  }

  // ---------- pencereler ----------
  // actions: [{ label, kind, value, onClick(close) }]
  function modal(opts) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      const prevFocus = document.activeElement;
      let done = false;
      const close = (value) => {
        if (done) return;
        done = true;
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(value);
      };
      const footer = h('div', { class: 'modal-actions' });
      for (const a of opts.actions || [{ label: 'Tamam', kind: 'primary', value: true }]) {
        footer.appendChild(btn(a.label, {
          kind: a.kind, icon: a.icon,
          onClick: async () => {
            if (a.onClick) {
              try {
                const res = await a.onClick(close);
                if (res === false) return;
                close(res === undefined ? a.value : res);
              } catch (e) { showError(e); }
            } else close(a.value);
          },
        }));
      }
      const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', style: opts.width ? { width: opts.width } : null },
        h('div', { class: 'modal-head' }, h('h2', null, opts.title || ''), h('button', { class: 'icon-btn', type: 'button', title: 'Kapat', onclick: () => close(null) }, icon('x', 22))),
        h('div', { class: 'modal-body' }, opts.body),
        footer);
      const overlay = h('div', { class: 'overlay' }, box);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      };
      document.addEventListener('keydown', onKey, true);
      root.appendChild(overlay);
      const first = box.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
      setTimeout(() => (first || footer.lastChild).focus(), 30);
      if (opts.onOpen) opts.onOpen(box, close);
    });
  }

  function alertBox(title, message) {
    return modal({ title, body: h('p', { class: 'lead' }, message), actions: [{ label: 'Tamam', kind: 'primary', value: true }] });
  }

  // Onay; reasonLabel verilirse neden yazdırılır (zorunlu). Dönüş: null (vazgeçti) | { reason }
  function confirmBox(opts) {
    const reason = opts.reasonLabel ? h('textarea', { rows: 2, placeholder: opts.reasonPlaceholder || '' }) : null;
    return modal({
      title: opts.title,
      body: h('div', null,
        typeof opts.message === 'string' ? h('p', { class: 'lead' }, opts.message) : opts.message,
        reason ? field(opts.reasonLabel, reason) : null),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: opts.okText || 'Evet', kind: opts.danger ? 'danger' : 'primary',
          onClick: () => {
            if (reason && !reason.value.trim()) { toast('Lütfen nedenini yazın.', 'error'); reason.focus(); return false; }
            return { reason: reason ? reason.value.trim() : '' };
          },
        },
      ],
    });
  }

  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
  }

  // ---------- sayı girişleri ----------
  // kind: 'money' (TL, kuruş döner) | 'kg' | 'int' | 'percent'
  function numberInput(opts) {
    opts = opts || {};
    const kind = opts.kind || 'money';
    const input = h('input', { type: 'text', inputmode: 'decimal', class: 'num-input ' + (opts.class || ''), placeholder: opts.placeholder || '', autocomplete: 'off' });
    const fmt = (v) => {
      if (v === null || v === undefined || v === '' || Number.isNaN(v)) return '';
      if (kind === 'money') return C.formatMoney(v);
      if (kind === 'kg') return C.formatKg(v);
      if (kind === 'int') return C.formatInt(v);
      return String(v).replace('.', ',');
    };
    input.getValue = () => {
      const n = C.parseNumber(input.value);
      if (Number.isNaN(n)) return input.value.trim() ? NaN : null;
      if (kind === 'money') return C.toKurus(n);
      if (kind === 'int') return Number.isInteger(n) ? n : NaN;
      if (kind === 'kg') return C.roundKg(n);
      return n;
    };
    input.setValue = (v) => { input.value = fmt(v); };
    input.isValid = () => !Number.isNaN(input.getValue());
    input.addEventListener('blur', () => {
      const v = input.getValue();
      if (v === null) input.classList.remove('invalid');
      else if (Number.isNaN(v)) input.classList.add('invalid');
      else { input.classList.remove('invalid'); input.value = fmt(v); }
    });
    input.addEventListener('input', () => input.classList.remove('invalid'));
    if (opts.value !== undefined && opts.value !== null) input.setValue(opts.value);
    return input;
  }

  // ---------- aramalı seçim kutusu ----------
  // opts: { placeholder, load: async(q) => items, label(item), sub(item), onSelect(item), createLabel, onCreate(q) }
  function searchSelect(opts) {
    const input = h('input', { type: 'text', class: 'ss-input', placeholder: opts.placeholder || 'Aramak için yazın…', autocomplete: 'off' });
    const list = h('div', { class: 'ss-list', role: 'listbox', hidden: true });
    const wrap = h('div', { class: 'ss' }, icon('search', 18), input, list);
    let items = [];
    let active = 0;
    let selected = null;
    let seq = 0;

    async function refresh() {
      const my = ++seq;
      const res = await opts.load(input.value);
      if (my !== seq) return;
      items = res.slice(0, 50);
      active = 0;
      render();
    }

    function render() {
      clear(list);
      items.forEach((it, i) => {
        list.appendChild(h('div', {
          class: 'ss-item' + (i === active ? ' active' : ''), role: 'option',
          onmousedown: (e) => { e.preventDefault(); pick(it); },
        }, h('div', { class: 'ss-main' }, opts.label(it)), opts.sub ? h('div', { class: 'ss-sub' }, opts.sub(it)) : null));
      });
      if (opts.onCreate) {
        list.appendChild(h('div', {
          class: 'ss-item create' + (active === items.length ? ' active' : ''),
          onmousedown: (e) => { e.preventDefault(); create(); },
        }, icon('plus', 18), h('span', null, (opts.createLabel || 'Yeni ekle') + (input.value.trim() ? ': "' + input.value.trim() + '"' : ''))));
      }
      if (!items.length && !opts.onCreate) list.appendChild(h('div', { class: 'ss-empty' }, 'Sonuç yok'));
      list.hidden = false;
      const act = list.querySelector('.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
    }

    async function create() {
      list.hidden = true;
      const it = await opts.onCreate(input.value.trim());
      if (it) pick(it);
    }

    function pick(it) {
      selected = it;
      input.value = opts.label(it);
      list.hidden = true;
      wrap.classList.add('has-value');
      if (opts.onSelect) opts.onSelect(it);
    }

    input.addEventListener('focus', () => { input.select(); refresh(); });
    input.addEventListener('input', () => {
      if (selected) { selected = null; wrap.classList.remove('has-value'); if (opts.onSelect) opts.onSelect(null); }
      refresh();
    });
    input.addEventListener('blur', () => setTimeout(() => {
      list.hidden = true;
      if (selected) input.value = opts.label(selected);
    }, 120));
    input.addEventListener('keydown', (e) => {
      const max = items.length + (opts.onCreate ? 1 : 0) - 1;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(max, active + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if (e.key === 'Enter') {
        if (list.hidden) return;
        e.preventDefault();
        if (active < items.length) pick(items[active]);
        else if (opts.onCreate) create();
      } else if (e.key === 'Escape') { list.hidden = true; }
    });

    wrap.input = input;
    wrap.getValue = () => selected;
    wrap.setValue = (it) => { if (it) pick(it); else { selected = null; input.value = ''; wrap.classList.remove('has-value'); } };
    wrap.focus = () => input.focus();
    return wrap;
  }

  // ---------- tablolar ----------
  // cols: [{ label, render(row) | key, class, align }]
  function table(cols, rows, opts) {
    opts = opts || {};
    const thead = h('thead', null, h('tr', null, cols.map((c) => h('th', { class: (c.align === 'right' ? 'r ' : '') + (c.class || '') }, c.label))));
    const tbody = h('tbody');
    if (!rows.length) {
      tbody.appendChild(h('tr', { class: 'empty' }, h('td', { colspan: cols.length }, opts.empty || 'Kayıt yok')));
    }
    for (const r of rows) {
      const tr = h('tr', {
        class: (opts.onRowClick ? 'click ' : '') + (opts.rowClass ? opts.rowClass(r) || '' : ''),
        onclick: opts.onRowClick ? (e) => { if (!e.target.closest('button')) opts.onRowClick(r); } : null,
      });
      for (const c of cols) {
        const v = c.render ? c.render(r) : r[c.key];
        tr.appendChild(h('td', { class: (c.align === 'right' ? 'r ' : '') + (c.class || '') }, v));
      }
      tbody.appendChild(tr);
    }
    const t = h('table', { class: 'grid' + (opts.compact ? ' compact' : '') }, thead, tbody);
    if (opts.foot) t.appendChild(h('tfoot', null, h('tr', null, opts.foot.map((f) => h('td', { class: f && f.align === 'right' ? 'r' : '', colspan: f && f.colspan }, f ? f.value : '')))));
    return h('div', { class: 'grid-wrap' }, t);
  }

  function statusBadge(status) {
    return h('span', { class: 'badge st-' + status }, C.STATUS_LABEL[status] || status);
  }

  function money(k, cls) {
    return h('span', { class: 'money ' + (cls || '') }, C.formatMoney(k), h('small', null, ' TL'));
  }

  // net > 0: müşteri bize borçlu; net < 0: biz borçluyuz
  function netText(net) {
    if (!net) return h('span', { class: 'muted' }, 'Hesap kapalı');
    if (net > 0) return h('span', { class: 'net-them' }, 'Bize ', money(net), ' borçlu');
    return h('span', { class: 'net-us' }, 'Biz ', money(-net), ' borçluyuz');
  }

  function priceAge(p) {
    const d = p.price_age_days;
    const txt = d <= 0 ? 'Bugün güncellendi' : d === 1 ? 'Dün güncellendi' : d + ' gün önce güncellendi';
    return h('span', { class: 'badge ' + (p.price_stale ? 'warn' : 'fresh') }, txt);
  }

  function page(title, actions, ...content) {
    return h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('h1', null, title), h('div', { class: 'page-actions' }, actions || [])),
      content);
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 200); };
  }

  // Kaydedilen dosya için bildirim + aç düğmeleri
  function fileSaved(title, file) {
    return modal({
      title,
      body: h('div', null, h('p', { class: 'lead' }, 'Dosya kaydedildi:'), h('p', { class: 'path' }, file)),
      actions: [
        { label: 'Klasörü göster', icon: 'folder', onClick: () => api('showInFolder', file) },
        { label: 'Dosyayı aç', icon: 'file', onClick: () => api('openPath', file) },
        { label: 'Tamam', kind: 'primary', value: true },
      ],
    });
  }

  return {
    h, clear, icon, btn, api, auth, toast, showError, modal, alertBox, confirmBox, field,
    numberInput, searchSelect, table, statusBadge, money, netText, priceAge, page, debounce, fileSaved,
  };
})();

window.UI = UI;
window.Screens = {};
