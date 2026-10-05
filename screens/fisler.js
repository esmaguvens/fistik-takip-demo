// Fiş listesi ve fiş detay sayfası.
'use strict';

(() => {
  const { h, icon, btn, money, statusBadge, toast } = UI;
  const C = window.Calc;
  const filters = { q: '', status: 'hepsi', from: '', to: '' };

  window.Screens.fisler = async function () {
    const holder = h('div');
    const search = h('input', { type: 'text', placeholder: 'Fiş no veya müşteri adı…', value: filters.q, autofocus: true });
    const from = h('input', { type: 'date', value: filters.from, style: { width: '170px' } });
    const to = h('input', { type: 'date', value: filters.to, style: { width: '170px' } });
    const seg = h('div', { class: 'seg' });

    function drawSeg() {
      UI.clear(seg);
      for (const [k, label] of [['hepsi', 'Tümü'], ['acik', 'Ödenmemiş'], ['odendi', 'Ödendi'], ['iptal', 'İptal']]) {
        seg.appendChild(h('button', { type: 'button', class: filters.status === k ? 'on' : '', onclick: () => { filters.status = k; drawSeg(); load(); } }, label));
      }
    }

    async function load() {
      filters.q = search.value;
      filters.from = from.value;
      filters.to = to.value;
      const rows = await UI.api('listReceipts', filters);
      const live = rows.filter((r) => r.status !== 'iptal');
      const sum = (f) => live.reduce((s, r) => s + f(r), 0);
      UI.clear(holder);
      holder.appendChild(UI.table([
        { label: 'Fiş No', render: (r) => h('b', null, r.id) },
        { label: 'Tarih', render: (r) => C.formatDateTime(r.created_at) },
        { label: 'Müşteri', key: 'customer_name' },
        { label: 'Çuval', align: 'right', render: (r) => C.formatInt(r.total_bags) },
        { label: 'KG', align: 'right', render: (r) => C.formatKg(r.total_kg) },
        { label: 'Tutar', align: 'right', render: (r) => money(r.total_amount) },
        { label: 'Üreticiye ödenecek', align: 'right', render: (r) => money(r.payable) },
        { label: 'Kalan', align: 'right', render: (r) => (r.remaining ? money(r.remaining, 'neg') : '—') },
        { label: 'Durum', render: (r) => statusBadge(r.status) },
      ], rows, {
        onRowClick: (r) => App.go('#/fis/' + r.id),
        empty: 'Bu ölçütlere uyan fiş yok.',
        rowClass: (r) => (r.status === 'iptal' ? 'deleted' : ''),
        foot: rows.length ? [
          { value: rows.length + ' fiş' }, null, null,
          { value: C.formatInt(sum((r) => r.total_bags)), align: 'right' },
          { value: C.formatKg(sum((r) => r.total_kg)), align: 'right' },
          { value: C.formatMoney(sum((r) => r.total_amount)), align: 'right' },
          { value: C.formatMoney(sum((r) => r.payable)), align: 'right' },
          { value: C.formatMoney(sum((r) => r.remaining)), align: 'right' }, null,
        ] : null,
      }));
      if (rows.length >= 500) holder.appendChild(h('p', { class: 'muted' }, 'İlk 500 fiş gösteriliyor. Daha eskileri için tarih seçin.'));
    }

    const deb = UI.debounce(load, 250);
    search.addEventListener('input', deb);
    from.addEventListener('change', load);
    to.addEventListener('change', load);
    drawSeg();
    await load();

    return UI.page('Fişler', [btn('Yeni Fiş', { kind: 'primary', icon: 'plus', onClick: () => App.go('#/fis/yeni') })],
      h('div', { class: 'filters' },
        h('div', { class: 'searchbar' }, icon('search', 18), search),
        seg,
        h('span', { class: 'muted' }, 'Tarih:'), from, h('span', null, '–'), to,
        (filters.from || filters.to) ? btn('Temizle', { small: true, kind: 'ghost', onClick: () => { from.value = ''; to.value = ''; load(); } }) : null),
      holder);
  };

  window.Screens.fisDetail = async function (idStr) {
    const id = Number(idStr);
    const [r, settings] = await Promise.all([UI.api('getReceipt', id), UI.api('getSettings')]);
    const cancelled = !!r.cancelled_at;

    const preview = h('div', { class: 'fis-preview' });
    preview.appendChild(h('style', null, window.FisRender.CSS));
    const pagesHolder = h('div', { html: window.FisRender.renderPages(r, settings.company_name) });
    preview.appendChild(pagesHolder);

    const run = (fn) => async () => { try { await fn(); } catch (e) { UI.showError(e); } };
    const actions = h('div', { class: 'card' },
      h('h3', { style: { marginBottom: '12px' } }, 'Çıktı'),
      h('div', { class: 'btn-col' },
        btn('Yazdır', { kind: 'primary', icon: 'print', onClick: run(() => UI.api('printReceipt', id)) }),
        btn('PDF kaydet', { icon: 'file', onClick: run(async () => UI.fileSaved('PDF kaydedildi', await UI.api('receiptPdf', id))) }),
        btn('Excel kaydet', { icon: 'table', onClick: run(async () => UI.fileSaved('Excel kaydedildi', await UI.api('receiptExcel', id))) }),
        btn('Fiş klasörü', { icon: 'folder', onClick: run(() => UI.api('openDocsDir')) })),
      h('p', { class: 'muted', style: { fontSize: '.85rem', marginTop: '10px' } }, 'Dosya adı: ' + r.id + '_' + r.customer_name + '_fis'));

    const summary = h('div', { class: 'card' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, h('h3', null, 'Hesap'), statusBadge(r.status)),
      h('div', { class: 'kv' },
        h('div', { class: 'k' }, 'Toplam tutar'), h('div', { class: 'v' }, money(r.total_amount)),
        h('div', { class: 'k' }, 'Komisyon (%' + String(r.commission_rate).replace('.', ',') + ')'), h('div', { class: 'v' }, '− ', money(r.commission)),
        h('div', { class: 'sep' }),
        h('div', { class: 'k' }, h('b', null, 'Üreticiye ödenecek')), h('div', { class: 'v big' }, money(r.payable)),
        h('div', { class: 'k' }, 'Ödenen'), h('div', { class: 'v pos' }, money(r.paid)),
        h('div', { class: 'k' }, 'Kalan'), h('div', { class: 'v big ' + (r.remaining ? 'neg' : '') }, money(r.remaining)),
        h('div', { class: 'sep' }),
        h('div', { class: 'k' }, 'Hamallık (bizim masrafımız)'), h('div', { class: 'v' }, money(r.porterage)),
        h('div', { class: 'k' }, 'Elden (müşteri borcuna eklendi)'), h('div', { class: 'v' }, money(r.cash_advance))),
      r.customer ? h('p', { style: { marginTop: '12px' } }, 'Müşteri: ', h('a', { href: '#/musteri/' + r.customer.id }, r.customer.full_name)) : null);

    const payRows = r.payments;
    const payments = h('div', { class: 'card' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
        h('h3', null, 'Ödemeler'),
        !cancelled && r.remaining > 0 ? btn('Ödeme ekle', { kind: 'primary', icon: 'money', onClick: run(async () => { if (await Dialogs.addPayment(r)) App.reload(); }) }) : null),
      payRows.length ? UI.table([
        { label: 'Tarih', render: (p) => C.formatDateTime(p.paid_at) },
        { label: 'Şekli', render: (p) => (p.method === 'mahsup' ? 'Borçtan düşüldü' : 'Nakit / havale') },
        { label: 'Tutar', align: 'right', render: (p) => money(p.amount) },
        { label: '', render: (p) => (p.deleted_at
          ? h('span', { class: 'keep muted', title: p.delete_reason }, 'Silindi: ' + p.delete_reason)
          : h('div', { class: 'cell-actions' }, btn('', { small: true, kind: 'ghost', icon: 'trash', title: 'Ödemeyi sil', onClick: run(async () => {
            const ok = await UI.confirmBox({ title: 'Ödeme silinsin mi?', message: C.formatMoney(p.amount, true) + ' tutarındaki ödeme silinecek. Silinen ödeme kayıt geçmişinde görünür.', okText: 'Sil', danger: true, reasonLabel: 'Silme nedeni' });
            if (!ok) return;
            await UI.api('deletePayment', p.id, ok.reason);
            toast('Ödeme silindi.');
            App.reload();
          }) }))) },
      ], payRows, { compact: true, rowClass: (p) => (p.deleted_at ? 'deleted' : '') })
        : h('p', { class: 'muted' }, 'Henüz ödeme yok.'));

    const manage = cancelled
      ? h('div', { class: 'notice error' }, icon('alert', 22), h('div', null, h('b', null, 'Bu fiş iptal edildi. '), C.formatDateTime(r.cancelled_at) + ' — Neden: ' + r.cancel_reason))
      : h('div', { class: 'card' },
        h('h3', { style: { marginBottom: '12px' } }, 'Fişi değiştir'),
        h('div', { class: 'btn-col' },
          btn('Düzelt', { icon: 'edit', onClick: () => App.go('#/fis/' + id + '/duzelt') }),
          btn('İptal et', { kind: 'danger', icon: 'x', onClick: run(async () => {
            const ok = await UI.confirmBox({ title: 'Fiş ' + id + ' iptal edilsin mi?', message: 'Fiş silinmez, "İptal edildi" olarak işaretlenir. Stok ve elden borcu geri alınır. Fiş numarası boş kalmaz.', okText: 'İptal et', danger: true, reasonLabel: 'İptal nedeni' });
            if (!ok) return;
            await UI.api('cancelReceipt', id, ok.reason);
            toast('Fiş ' + id + ' iptal edildi.');
            App.reload();
          }) })),
        r.updated_at ? h('p', { class: 'muted', style: { fontSize: '.85rem', marginTop: '10px' } }, 'Son düzeltme: ' + C.formatDateTime(r.updated_at)) : null);

    return h('div', { class: 'page' },
      h('button', { class: 'back-link', type: 'button', onclick: () => App.go('#/fisler') }, icon('back', 18), 'Fişler'),
      h('div', { class: 'page-head' }, h('h1', null, 'Fiş ' + r.id, ' ', statusBadge(r.status)),
        h('div', { class: 'page-actions' }, !cancelled && r.customer && !r.customer.deleted ? btn('Bu müşteriye yeni fiş', { icon: 'plus', onClick: () => App.go('#/fis/yeni/' + r.customer.id) }) : null)),
      h('div', { class: 'detail-layout' }, preview, h('div', null, summary, payments, actions, manage)));
  };
})();
