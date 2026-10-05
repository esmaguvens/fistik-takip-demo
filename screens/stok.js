// Stok: ürün bazında çuval sayısı ve stok hareketleri.
'use strict';

window.Screens.stok = async function () {
  const { h, btn } = UI;
  const C = window.Calc;
  const TYPES = { fis: 'Fiş (alım)', fis_duzeltme: 'Fiş düzeltme', fis_iptal: 'Fiş iptali', elle: 'Elle düzeltme', acilis: 'Başlangıç stoğu' };

  const products = await UI.api('listProducts', {});
  const sel = h('select', { style: { width: '260px' } }, h('option', { value: '' }, 'Tüm ürünler'), products.map((p) => h('option', { value: p.id }, p.name)));
  const moves = h('div');

  async function loadMoves() {
    const rows = await UI.api('stockMovements', { productId: sel.value ? Number(sel.value) : null });
    UI.clear(moves);
    moves.appendChild(UI.table([
      { label: 'Tarih', render: (m) => C.formatDateTime(m.at) },
      { label: 'Ürün', key: 'product_name' },
      { label: 'Hareket', render: (m) => TYPES[m.type] || m.type },
      { label: 'Değişim', align: 'right', render: (m) => h('b', { class: m.change > 0 ? 'pos' : 'neg' }, (m.change > 0 ? '+' : '') + C.formatInt(m.change)) },
      { label: 'Sonraki stok', align: 'right', render: (m) => C.formatInt(m.stock_after) },
      { label: 'Açıklama', render: (m) => (m.receipt_id ? h('a', { href: '#/fis/' + m.receipt_id }, m.note) : m.note) },
    ], rows, { compact: true, empty: 'Stok hareketi yok.' }));
  }
  sel.addEventListener('change', loadMoves);
  await loadMoves();

  const total = products.reduce((s, p) => s + p.stock, 0);
  const summary = UI.table([
    { label: 'Ürün', render: (p) => h('b', null, p.name) },
    { label: 'Stok', align: 'right', render: (p) => h('span', { class: p.stock < 0 ? 'neg' : '' }, C.formatInt(p.stock) + ' çuval') },
    { label: '', render: (p) => h('div', { class: 'cell-actions' }, btn('Stok düzelt', { small: true, icon: 'box', onClick: async () => {
      try { if (await window.ProductDialogs.stockDialog(p)) App.reload(); } catch (e) { UI.showError(e); }
    } })) },
  ], products, { empty: 'Ürün yok.', foot: products.length ? [{ value: 'Toplam' }, { value: C.formatInt(total) + ' çuval', align: 'right' }, null] : null });

  return UI.page('Stok', null,
    h('div', { class: 'notice info' }, UI.icon('box', 22), h('div', null, 'Stok, fiş kesildikçe çuval sayısı kadar otomatik artar. Fiş düzeltilir veya iptal edilirse otomatik düzelir. Satış / çıkış için şimdilik "Stok düzelt" kullanın.')),
    h('div', { class: 'two-col' },
      h('div', null, h('h2', { style: { marginBottom: '10px' } }, 'Mevcut stok'), summary),
      h('div', null, h('div', { class: 'section-title', style: { marginTop: 0 } }, h('h2', null, 'Stok hareketleri'), sel), moves)));
};
