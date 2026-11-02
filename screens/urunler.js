// Ürünler (cinsler) ve stok. Ürünlerin kayıtlı fiyatı yoktur; fiyat her fişe elle yazılır.
'use strict';

(() => {
  const { h, icon, btn, field, numberInput, toast } = UI;
  const C = window.Calc;

  function addProductDialog() {
    const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Ör. Boz fıstık, Kırmızı, Siirt' });
    const stock = numberInput({ kind: 'int', value: 0 });
    return UI.modal({
      title: 'Yeni ürün',
      body: h('div', null, field('Ürün adı (cinsi)', name), field('Mevcut stok (çuval)', stock, 'Fiyat ürüne kaydedilmez; her fişte elle yazılır.')),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Kaydet', kind: 'primary',
          onClick: async () => {
            const s = stock.getValue();
            if (Number.isNaN(s)) { toast('Stok tam sayı olmalı.', 'error'); return false; }
            await UI.api('addProduct', { name: name.value, stock: s || 0 });
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

  // Ürünün fişlere yazılmış son fiyatları (bilgi amaçlı)
  async function historyDialog(p) {
    const rows = await UI.api('productPrices', p.id, 30);
    return UI.modal({
      title: p.name + ' — fişlerdeki son fiyatlar',
      body: UI.table([
        { label: 'Tarih', render: (r) => C.formatDateTime(r.created_at) },
        { label: 'Fiş No', render: (r) => r.receipt_id },
        { label: 'KG', align: 'right', render: (r) => C.formatKg(r.kg) },
        { label: 'Fiyat (kg)', align: 'right', render: (r) => h('b', null, C.formatMoney(r.price)) },
      ], rows, { compact: true, empty: 'Bu ürünle henüz fiş kesilmedi.' }),
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
        { label: 'Fişlerdeki fiyatlar', icon: 'history', onClick: async () => { await historyDialog(p); return false; } },
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

    async function load() {
      const rows = await UI.api('listProducts', { q: search.value });
      const refresh = (fn) => async () => { try { if (await fn()) load(); } catch (e) { UI.showError(e); } };
      UI.clear(holder);
      holder.appendChild(UI.table([
        { label: 'Ürün (cinsi)', render: (p) => h('b', null, p.name) },
        { label: 'Stok', align: 'right', render: (p) => h('span', { class: p.stock < 0 ? 'neg' : '' }, C.formatInt(p.stock) + ' çuval') },
        { label: '', render: (p) => h('div', { class: 'cell-actions' },
          btn('Stok', { small: true, icon: 'box', onClick: refresh(() => stockDialog(p)) }),
          btn('', { small: true, kind: 'ghost', icon: 'edit', title: 'Ad değiştir / sil / fişlerdeki fiyatlar', onClick: refresh(() => moreMenu(p)) })) },
      ], rows, { empty: search.value ? 'Bu aramaya uyan ürün yok.' : 'Henüz ürün eklenmedi. "Yeni ürün" ile başlayın.' }));
    }

    search.addEventListener('input', UI.debounce(load, 200));
    await load();

    return UI.page('Ürünler', [btn('Yeni ürün', { kind: 'primary', icon: 'plus', onClick: async () => { if (await addProductDialog()) load(); } })],
      h('div', { class: 'filters' }, h('div', { class: 'searchbar' }, icon('search', 18), search)),
      holder,
      h('p', { class: 'muted', style: { marginTop: '14px' } }, 'Ürünlerin fiyatı kaydedilmez. Fiyat, her fiş kesilirken satır satır elle yazılır.'));
  };

  window.ProductDialogs = { stockDialog };
})();
