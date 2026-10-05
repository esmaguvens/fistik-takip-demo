// Kayıt geçmişi: tüm değişikliklerin silinemez listesi.
'use strict';

window.Screens.gecmis = async function () {
  const { h, icon, btn } = UI;
  const C = window.Calc;
  const ENTITIES = { '': 'Tümü', fis: 'Fişler', musteri: 'Müşteriler', urun: 'Ürün / stok / fiyat', ayar: 'Ayarlar', guvenlik: 'Güvenlik' };

  const verify = await UI.api('verifyAudit');
  const search = h('input', { type: 'text', placeholder: 'Ara (ör. müşteri adı, fiş no, "stok")…', autofocus: true });
  const entity = h('select', { style: { width: '220px' } }, Object.entries(ENTITIES).map(([k, v]) => h('option', { value: k }, v)));
  const from = h('input', { type: 'date', style: { width: '170px' } });
  const to = h('input', { type: 'date', style: { width: '170px' } });
  const holder = h('div');

  function detail(r) {
    const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return s; } };
    const o = parse(r.old_json);
    const n = parse(r.new_json);
    return UI.modal({
      title: 'Kayıt #' + r.id,
      width: '720px',
      body: h('div', null,
        h('p', null, h('b', null, C.formatDateTime(r.at)), ' — ', r.summary),
        r.reason ? h('p', null, h('b', null, 'Neden: '), r.reason) : null,
        o ? h('div', null, h('h3', { style: { margin: '10px 0 6px' } }, 'Önceki hali'), h('pre', { class: 'json' }, JSON.stringify(o, null, 2))) : null,
        n ? h('div', null, h('h3', { style: { margin: '10px 0 6px' } }, 'Yeni hali'), h('pre', { class: 'json' }, JSON.stringify(n, null, 2))) : null),
      actions: [{ label: 'Kapat', kind: 'primary', value: true }],
    });
  }

  async function load() {
    const rows = await UI.api('listAudit', { q: search.value, entity: entity.value || null, from: from.value, to: to.value });
    UI.clear(holder);
    holder.appendChild(UI.table([
      { label: 'No', render: (r) => h('span', { class: 'muted' }, r.id) },
      { label: 'Tarih', render: (r) => C.formatDateTime(r.at) },
      { label: 'İşlem', key: 'summary' },
      { label: 'Neden', render: (r) => r.reason || '' },
    ], rows, { compact: true, onRowClick: detail, empty: 'Kayıt yok.' }));
  }
  search.addEventListener('input', UI.debounce(load, 250));
  [entity, from, to].forEach((el) => el.addEventListener('change', load));
  await load();

  return UI.page('Kayıt Geçmişi', null,
    verify.ok
      ? h('div', { class: 'notice info' }, icon('check', 22), h('div', null, h('b', null, 'Kayıtlar sağlam. '), C.formatInt(verify.count) + ' kayıt var; hiçbiri sonradan değiştirilmemiş. Bu liste programdan silinemez.'))
      : h('div', { class: 'notice error' }, icon('alert', 22), h('div', null, h('b', null, 'Dikkat: '), '#' + verify.brokenAt + ' numaralı kayıttan itibaren geçmiş dışarıdan değiştirilmiş görünüyor.')),
    h('div', { class: 'filters' }, h('div', { class: 'searchbar' }, icon('search', 18), search), entity, h('span', { class: 'muted' }, 'Tarih:'), from, h('span', null, '–'), to),
    holder,
    h('p', { class: 'muted', style: { marginTop: '10px' } }, 'Ayrıntı için satıra tıklayın. En son 500 kayıt gösterilir; daha eskisi için tarih seçin.'));
};
