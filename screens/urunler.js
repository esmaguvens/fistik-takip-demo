// Ürünler (cinsler): fiyat, fiyat güncelliği, stok.
'use strict';

(() => {
  const { h, icon, btn, money, field, numberInput, toast } = UI;
  const C = window.Calc;

  function addProductDialog() {
    const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Ör. Boz fıstık, Kırmızı, Siirt' });
    const price = numberInput({ kind: 'money' });
    const stock = numberInput({ kind: 'int', value: 0 });
    return UI.modal({
      title: 'Yeni ürün',
      body: h('div', null, field('Ürün adı (cinsi)', name), h('div', { class: 'row' }, field('Güncel kg fiyatı (TL)', price), field('Mevcut stok (çuval)', stock))),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Kaydet', kind: 'primary',
          onClick: async () => {
            const p = price.getValue();
            const s = stock.getValue();
            if (!p || Number.isNaN(p)) { toast('Geçerli bir fiyat yazın.', 'error'); return false; }
            if (Number.isNaN(s)) { toast('Stok tam sayı olmalı.', 'error'); return false; }
            await UI.api('addProduct', { name: name.value, price: p, stock: s || 0 });
            toast('Ürün eklendi.');
            return true;
          },
        },
      ],
    });
  }

  function stockDialog(p) {
    const val = numberInput({ kind: 'int', value: p.stock });
    const reason = h('input', { type: 'text', maxlength: 200, placeholder: 'Ör. sayım yapıldı, satış yapıldı, fire' });
    return UI.modal({
      title: p.name + ' — stok düzelt',
      body: h('div', null,
        h('p', null, 'Şu anki stok: ', h('b', null, C.formatInt(p.stock) + ' çuval')),
        field('Yeni stok (çuval)', val, 'Depodaki gerçek çuval sayısını yazın.'),
        field('Açıklama (zorunlu)', reason)),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Kaydet', kind: 'primary',
          onClick: async () => {
            const v = val.getValue();
            if (v === null || Number.isNaN(v)) { toast('Stok tam sayı olmalı.', 'error'); return false; }
            await UI.api('adjustStock', p.id, { newStock: v, reason: reason.value });
            toast('Stok güncellendi.');
            return true;
          },
        },
      ],
    });
  }

  async function historyDialog(p) {
    const rows = await UI.api('priceHistory', p.id);
    return UI.modal({
      title: p.name + ' — fiyat geçmişi',
      body: UI.table([
        { label: 'Tarih', render: (r) => C.formatDateTime(r.at) },
        { label: 'Eski', align: 'right', render: (r) => (r.old_price === null ? '—' : C.formatMoney(r.old_price)) },
        { label: 'Yeni', align: 'right', render: (r) => h('b', null, C.formatMoney(r.new_price)) },
      ], rows, { compact: true }),
      actions: [{ label: 'Kapat', kind: 'primary', value: true }],
    });
  }

  async function moreMenu(p) {
    const name = h('input', { type: 'text', value: p.name, maxlength: 60 });
    return UI.modal({
      title: p.name,
      body: h('div', null, field('Ürün adı', name, 'Ad değişikliği eski fişleri etkilemez.')),
      actions: [
        {
          label: 'Ürünü sil', kind: 'danger', icon: 'trash',
          onClick: async () => {
            const ok = await UI.confirmBox({ title: p.name + ' silinsin mi?', message: 'Ürün listeden ve fiş ekranından kalkar. Eski fişler etkilenmez.', okText: 'Sil', danger: true, reasonLabel: 'Silme nedeni' });
            if (!ok) return false;
            await UI.api('deleteProduct', p.id, ok.reason);
            toast('Ürün silindi.');
            return true;
          },
        },
        { label: 'Fiyat geçmişi', icon: 'history', onClick: async () => { await historyDialog(p); return false; } },
        {
          label: 'Adı kaydet', kind: 'primary',
          onClick: async () => { await UI.api('renameProduct', p.id, name.value); toast('Ürün adı değişti.'); return true; },
        },
      ],
    });
  }

  window.Screens.urunler = async function () {
    const holder = h('div');
    const search = h('input', { type: 'text', placeholder: 'Ürün adı ile ara…', autofocus: true });
    const warn = h('div');

    async function load() {
      const rows = await UI.api('listProducts', { q: search.value });
      const stale = rows.filter((p) => p.price_stale);
      UI.clear(warn);
      if (stale.length) {
        warn.appendChild(h('div', { class: 'notice warn' }, icon('alert', 22), h('div', { class: 'grow' },
          h('b', null, stale.length + ' ürünün fiyatı bugün kontrol edilmedi. '),
          'Fiyat değişmediyse "Fiyat" düğmesine basıp "Fiyat aynı" deyin; fiyat bugünün fiyatı olarak onaylanır.')));
      }
      const refresh = (fn) => async () => { try { if (await fn()) load(); } catch (e) { UI.showError(e); } };
      UI.clear(holder);
      holder.appendChild(UI.table([
        { label: 'Ürün (cinsi)', render: (p) => h('b', null, p.name) },
        { label: 'Güncel fiyat', align: 'right', render: (p) => h('span', null, money(p.price), h('span', { class: 'muted' }, ' / kg')) },
        { label: 'Fiyat durumu', render: (p) => UI.priceAge(p) },
        { label: 'Stok', align: 'right', render: (p) => h('span', { class: p.stock < 0 ? 'neg' : '' }, C.formatInt(p.stock) + ' çuval') },
        { label: '', render: (p) => h('div', { class: 'cell-actions' },
          btn('Fiyat', { small: true, kind: p.price_stale ? 'primary' : '', icon: 'tag', onClick: refresh(() => Dialogs.priceUpdate(p)) }),
          btn('Stok', { small: true, icon: 'box', onClick: refresh(() => stockDialog(p)) }),
          btn('', { small: true, kind: 'ghost', icon: 'edit', title: 'Ad değiştir / sil / fiyat geçmişi', onClick: refresh(() => moreMenu(p)) })) },
      ], rows, { empty: search.value ? 'Bu aramaya uyan ürün yok.' : 'Henüz ürün eklenmedi. "Yeni ürün" ile başlayın.' }));
    }

    search.addEventListener('input', UI.debounce(load, 200));
    await load();

    return UI.page('Ürünler ve Fiyatlar', [btn('Yeni ürün', { kind: 'primary', icon: 'plus', onClick: async () => { if (await addProductDialog()) load(); } })],
      h('div', { class: 'filters' }, h('div', { class: 'searchbar' }, icon('search', 18), search)),
      warn, holder,
      h('p', { class: 'muted', style: { marginTop: '14px' } }, 'Fiyatlar yalnızca bu sayfadan değişir. Fiyat değişince eski fişler değişmez; yeni fişler güncel fiyatla kesilir.'));
  };

  window.ProductDialogs = { stockDialog };
})();
