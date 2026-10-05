// Müşteriler (üreticiler): liste, hesap durumu, geçmiş fişler, borç-alacak hareketleri.
'use strict';

(() => {
  const { h, icon, btn, money, statusBadge, toast } = UI;
  const C = window.Calc;
  let lastQuery = '';

  window.Screens.musteriler = async function () {
    const holder = h('div');
    const search = h('input', { type: 'text', placeholder: 'Ad, soyad, telefon veya köy…', value: lastQuery, autofocus: true });

    async function load() {
      lastQuery = search.value;
      const rows = await UI.api('listCustomers', { q: search.value });
      UI.clear(holder);
      holder.appendChild(UI.table([
        { label: 'Ad Soyad', render: (c) => h('b', null, c.full_name) },
        { label: 'Telefon', key: 'phone' },
        { label: 'Köy / adres', key: 'address' },
        { label: 'Bizim borcumuz', align: 'right', render: (c) => (c.we_owe ? money(c.we_owe) : '—') },
        { label: 'Onun borcu', align: 'right', render: (c) => (c.account > 0 ? money(c.account) : c.account < 0 ? h('span', { class: 'muted' }, '(' + C.formatMoney(-c.account) + ' fazla)') : '—') },
        { label: 'Durum', render: (c) => UI.netText(c.net) },
        { label: 'Son fiş', render: (c) => (c.last_receipt_at ? C.formatDate(c.last_receipt_at) : '—') },
      ], rows, { onRowClick: (c) => App.go('#/musteri/' + c.id), empty: search.value ? 'Bu aramaya uyan müşteri yok.' : 'Henüz müşteri eklenmedi.' }));
    }

    search.addEventListener('input', UI.debounce(load, 200));
    await load();

    return UI.page('Müşteriler', [btn('Yeni müşteri', { kind: 'primary', icon: 'plus', onClick: async () => {
      const id = await Dialogs.customerForm(null, search.value);
      if (id) App.go('#/musteri/' + id);
    } })],
    h('div', { class: 'filters' }, h('div', { class: 'searchbar' }, icon('search', 18), search)),
    holder);
  };

  window.Screens.musteri = async function (idStr) {
    const c = await UI.api('getCustomer', Number(idStr));
    const run = (fn) => async () => { try { await fn(); } catch (e) { UI.showError(e); } };

    const stat = (cls, k, v, s) => h('div', { class: 'stat ' + cls }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), s ? h('div', { class: 's' }, s) : null);
    const netVal = c.net === 0 ? h('span', null, 'Kapalı') : money(Math.abs(c.net));
    const cards = h('div', { class: 'cards' },
      stat('us', 'Biz ona borçluyuz', money(c.we_owe), 'Ödenmemiş fişlerin kalanı'),
      stat('them', 'O bize borçlu', money(Math.max(0, c.account)), c.account < 0 ? 'Ayrıca ' + C.formatMoney(-c.account, true) + ' bizim borcumuz (açılış / fazla ödeme)' : 'Elden ve diğer borçlar'),
      stat(c.net > 0 ? 'them' : c.net < 0 ? 'us' : '', 'Net durum', netVal,
        c.net > 0 ? 'Müşteri bize borçlu' : c.net < 0 ? 'Biz müşteriye borçluyuz' : 'Hesap kapalı'));

    const receipts = UI.table([
      { label: 'Fiş No', render: (r) => h('b', null, r.id) },
      { label: 'Tarih', render: (r) => C.formatDateTime(r.created_at) },
      { label: 'Çuval', align: 'right', render: (r) => C.formatInt(r.total_bags) },
      { label: 'Tutar', align: 'right', render: (r) => money(r.total_amount) },
      { label: 'Ödenecek', align: 'right', render: (r) => money(r.payable) },
      { label: 'Kalan', align: 'right', render: (r) => (r.remaining ? money(r.remaining, 'neg') : '—') },
      { label: 'Durum', render: (r) => statusBadge(r.status) },
    ], c.receipts, { onRowClick: (r) => App.go('#/fis/' + r.id), empty: 'Bu müşteriye henüz fiş kesilmedi.', rowClass: (r) => (r.status === 'iptal' ? 'deleted' : '') });

    const entries = UI.table([
      { label: 'Tarih', render: (e) => C.formatDate(e.at) },
      { label: 'İşlem', render: (e) => h('span', null, e.label, e.receipt_id ? h('a', { class: 'keep', href: '#/fis/' + e.receipt_id, style: { marginLeft: '6px' } }, '(Fiş ' + e.receipt_id + ')') : null) },
      { label: 'Açıklama', render: (e) => (e.deleted_at ? h('span', { class: 'keep muted' }, 'Silindi: ' + (e.delete_reason || '')) : e.note) },
      { label: 'Borcu artan / azalan', align: 'right', render: (e) => h('span', { class: e.amount > 0 ? 'net-them' : 'pos' }, (e.amount > 0 ? '+' : '−') + C.formatMoney(Math.abs(e.amount))) },
      { label: '', render: (e) => (!e.deleted_at && C.ENTRY_TYPES[e.type] && C.ENTRY_TYPES[e.type].manual
        ? h('div', { class: 'cell-actions' }, btn('', { small: true, kind: 'ghost', icon: 'trash', title: 'Sil', onClick: run(async () => {
          const ok = await UI.confirmBox({ title: 'Hareket silinsin mi?', message: '"' + e.label + '" — ' + C.formatMoney(Math.abs(e.amount), true) + ' silinecek. Silinen kayıt listede üstü çizili görünmeye devam eder.', okText: 'Sil', danger: true, reasonLabel: 'Silme nedeni' });
          if (!ok) return;
          await UI.api('deleteAccountEntry', e.id, ok.reason);
          toast('Hareket silindi.');
          App.reload();
        }) }))
        : null) },
    ], c.entries, { compact: true, empty: 'Hesap hareketi yok.', rowClass: (e) => (e.deleted_at ? 'deleted' : '') });

    const info = [c.phone, c.address].filter(Boolean).join(' · ');
    const deleted = !!c.deleted_at;

    return h('div', { class: 'page' },
      h('button', { class: 'back-link', type: 'button', onclick: () => App.go('#/musteriler') }, icon('back', 18), 'Müşteriler'),
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, c.full_name, deleted ? h('span', { class: 'badge gray' }, 'Silinmiş') : null),
          info ? h('div', { class: 'muted' }, info) : null, c.note ? h('div', { class: 'muted' }, 'Not: ' + c.note) : null),
        deleted ? null : h('div', { class: 'page-actions' },
          btn('Yeni fiş kes', { kind: 'primary', icon: 'plus', onClick: () => App.go('#/fis/yeni/' + c.id) }),
          btn('Hesaba işlem ekle', { icon: 'money', onClick: run(async () => { if (await Dialogs.accountEntry(c)) App.reload(); }) }),
          btn('Düzenle', { icon: 'edit', onClick: run(async () => { if (await Dialogs.customerForm(c)) App.reload(); }) }),
          btn('Sil', { kind: 'danger', icon: 'trash', onClick: run(async () => {
            const ok = await UI.confirmBox({ title: c.full_name + ' silinsin mi?', message: 'Müşteri listeden kaldırılır; eski fişleri ve kayıtları saklanır.', okText: 'Sil', danger: true, reasonLabel: 'Silme nedeni' });
            if (!ok) return;
            await UI.api('deleteCustomer', c.id, ok.reason);
            toast('Müşteri silindi.');
            App.go('#/musteriler');
          }) }))),
      cards,
      h('div', { class: 'section-title' }, h('h2', null, 'Hesap hareketleri (borç / alacak)'),
        deleted ? null : h('div', { class: 'page-actions' },
          btn('Açılış borcu (defterden)', { small: true, onClick: run(async () => { if (await Dialogs.accountEntry(c, 'acilis_alacak')) App.reload(); }) }),
          btn('Tahsilat', { small: true, onClick: run(async () => { if (await Dialogs.accountEntry(c, 'tahsilat')) App.reload(); }) }))),
      entries,
      h('div', { class: 'section-title' }, h('h2', null, 'Fişleri (' + c.receipts.length + ')')),
      receipts);
  };
})();
