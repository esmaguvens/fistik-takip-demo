// Komisyon raporu: seçilen dönemde hangi fişten ne kadar komisyon alındığı, aylara göre toplamlar.
'use strict';

(() => {
  const { h, icon, btn, money } = UI;
  const C = window.Calc;
  // Seçimler sayfalar arasında gidip gelince korunur
  const state = { preset: 'ay', from: '', to: '', q: '' };

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const MONTHS = C.MONTHS;

  // Hazır dönemler: [etiket, başlangıç, bitiş]
  function presetRange(key) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (key) {
      case 'bugun': return [ymd(now), ymd(now)];
      case 'ay': return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
      case 'gecen': return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
      case 'yil': return [ymd(new Date(y, 0, 1)), ymd(new Date(y, 11, 31))];
      default: return ['', ''];
    }
  }
  const PRESETS = [['bugun', 'Bugün'], ['ay', 'Bu ay'], ['gecen', 'Geçen ay'], ['yil', 'Bu yıl'], ['tumu', 'Tümü']];

  function rangeLabel(from, to) {
    if (!from && !to) return 'Tüm zamanlar';
    if (from && to && from === to) return C.formatDate(from);
    return (from ? C.formatDate(from) : 'başlangıç') + ' – ' + (to ? C.formatDate(to) : 'bugün');
  }

  window.Screens.komisyon = async function () {
    if (state.preset !== 'ozel') [state.from, state.to] = presetRange(state.preset);

    const seg = h('div', { class: 'seg' });
    const from = h('input', { type: 'date', value: state.from, style: { width: '170px' } });
    const to = h('input', { type: 'date', value: state.to, style: { width: '170px' } });
    const search = h('input', { type: 'text', placeholder: 'Müşteri adıyla süz…', value: state.q });
    const body = h('div');

    function drawSeg() {
      UI.clear(seg);
      for (const [k, label] of PRESETS) {
        seg.appendChild(h('button', {
          type: 'button', class: state.preset === k ? 'on' : '',
          onclick: () => {
            state.preset = k;
            [state.from, state.to] = presetRange(k);
            from.value = state.from;
            to.value = state.to;
            drawSeg();
            load();
          },
        }, label));
      }
    }

    async function load() {
      state.q = search.value;
      const rep = await UI.api('commissionReport', { from: state.from, to: state.to, q: state.q });
      const s = rep.summary;
      UI.clear(body);

      body.appendChild(h('div', { class: 'cards' },
        h('div', { class: 'stat kom' }, h('div', { class: 'k' }, 'Toplam komisyon'), h('div', { class: 'v' }, money(s.commission)),
          h('div', { class: 's' }, rangeLabel(state.from, state.to) + (state.q ? ' · "' + state.q + '"' : ''))),
        h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Fiş sayısı'), h('div', { class: 'v' }, C.formatInt(s.count)),
          h('div', { class: 's' }, C.formatInt(s.bags) + ' çuval · ' + C.formatKg(s.kg) + ' kg')),
        h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Toplam alım tutarı'), h('div', { class: 'v' }, money(s.amount)),
          h('div', { class: 's' }, 'Komisyonun hesaplandığı tutar')),
        h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Fiş başına ortalama'), h('div', { class: 'v' }, money(s.count ? Math.round(s.commission / s.count) : 0)),
          h('div', { class: 's' }, 'Ortalama oran: %' + (s.amount ? (s.commission * 100 / s.amount).toFixed(2).replace('.', ',') : '0')))));

      // Aylara göre
      const maxMonth = Math.max(1, ...rep.months.map((m) => m.commission));
      body.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Aylara göre komisyon')));
      body.appendChild(UI.table([
        { label: 'Ay', render: (m) => h('b', null, MONTHS[Number(m.ym.slice(5, 7)) - 1] + ' ' + m.ym.slice(0, 4)) },
        { label: 'Fiş', align: 'right', render: (m) => C.formatInt(m.count) },
        { label: 'Alım tutarı', align: 'right', render: (m) => money(m.amount) },
        { label: 'Komisyon', align: 'right', render: (m) => h('b', null, money(m.commission)) },
        { label: '', class: 'bar-cell', render: (m) => h('div', { class: 'kom-bar' }, h('span', { style: { width: Math.max(2, Math.round(m.commission * 100 / maxMonth)) + '%' } })) },
      ], rep.months, { compact: true, empty: 'Bu dönemde fiş yok.' }));

      // Fiş fiş
      body.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Fişlere göre komisyon (' + C.formatInt(s.count) + ')')));
      body.appendChild(UI.table([
        { label: 'Fiş No', render: (r) => h('b', null, r.id) },
        { label: 'Tarih', render: (r) => C.formatDateTime(r.created_at) },
        { label: 'Müşteri', key: 'customer_name' },
        { label: 'Çuval', align: 'right', render: (r) => C.formatInt(r.total_bags) },
        { label: 'Tutar', align: 'right', render: (r) => money(r.total_amount) },
        { label: 'Oran', align: 'right', render: (r) => '%' + String(r.commission_rate).replace('.', ',') },
        { label: 'Komisyon', align: 'right', render: (r) => h('b', null, money(r.commission)) },
      ], rep.rows, {
        onRowClick: (r) => App.go('#/fis/' + r.id),
        empty: 'Bu dönemde fiş yok.',
        foot: rep.rows.length ? [{ value: 'Toplam' }, null, null,
          { value: C.formatInt(s.bags), align: 'right' }, { value: C.formatMoney(s.amount), align: 'right' }, null,
          { value: C.formatMoney(s.commission), align: 'right' }] : null,
      }));
      if (rep.truncated) body.appendChild(h('p', { class: 'muted' }, 'Listede son ' + C.formatInt(rep.rows.length) + ' fiş gösteriliyor; toplamlar dönemin tüm fişlerini kapsar.'));
      body.appendChild(h('p', { class: 'muted', style: { marginTop: '10px' } }, 'İptal edilen fişler hesaba katılmaz. Komisyon, fişin kesildiği tarihe göre sayılır.'));
    }

    const onDate = () => {
      state.preset = 'ozel';
      state.from = from.value;
      state.to = to.value;
      drawSeg();
      load();
    };
    from.addEventListener('change', onDate);
    to.addEventListener('change', onDate);
    search.addEventListener('input', UI.debounce(load, 250));
    drawSeg();
    await load();

    return UI.page('Komisyon', [btn('Excel\'e aktar', { icon: 'table', onClick: async () => {
      try {
        UI.fileSaved('Komisyon raporu kaydedildi', await UI.api('commissionExcel', { from: state.from, to: state.to, q: state.q }));
      } catch (e) { UI.showError(e); }
    } })],
    h('div', { class: 'filters' },
      seg,
      h('span', { class: 'muted' }, 'Tarih:'), from, h('span', null, '–'), to,
      h('div', { class: 'searchbar', style: { minWidth: '240px' } }, icon('search', 18), search)),
    body);
  };

})();
