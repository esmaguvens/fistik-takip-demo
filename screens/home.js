// Ana sayfa: büyük düğmeler, günün özeti, uyarılar.
'use strict';

window.Screens.home = async function () {
  const { h, icon, btn, money, statusBadge } = UI;
  const C = window.Calc;
  const [d, bs] = await Promise.all([UI.api('dashboard'), UI.api('backupStatus')]);

  const tile = (cls, ic, title, desc, hash) => h('button', { type: 'button', class: 'tile ' + cls, onclick: () => App.go(hash) },
    icon(ic, 34), h('div', null, h('div', { class: 't' }, title), h('div', { class: 'd' }, desc)));

  const notices = [];
  if (d.stale_products.length) {
    notices.push(h('div', { class: 'notice warn' }, icon('alert', 24),
      h('div', { class: 'grow' }, h('b', null, 'Fiyat kontrolü: '), 'Şu ürünlerin fiyatı bugün güncellenmedi: ',
        h('b', null, d.stale_products.map((p) => p.name).join(', ')), '.'),
      btn('Fiyatları kontrol et', { kind: 'primary', onClick: () => App.go('#/urunler') })));
  }
  if (!d.product_count) {
    notices.push(h('div', { class: 'notice info' }, icon('tag', 24),
      h('div', { class: 'grow' }, h('b', null, 'Başlarken: '), 'Fiş kesebilmek için önce ürünleri (cinsleri) ve güncel fiyatlarını ekleyin.'),
      btn('Ürün ekle', { kind: 'primary', onClick: () => App.go('#/urunler') })));
  }
  if (!bs.external_dir) {
    notices.push(h('div', { class: 'notice warn' }, icon('save', 24),
      h('div', { class: 'grow' }, h('b', null, 'Harici yedek ayarlanmadı. '), 'Bilgisayar bozulursa kayıtlar kaybolmasın diye bir USB bellek / harici disk seçin.'),
      btn('Yedeklemeye git', { onClick: () => App.go('#/yedek') })));
  } else if (!bs.external_ready) {
    notices.push(h('div', { class: 'notice warn' }, icon('save', 24),
      h('div', { class: 'grow' }, h('b', null, 'Harici yedek diski takılı değil. '),
        'Son harici yedek: ' + (bs.last_external ? C.formatDateTime(bs.last_external) : 'hiç alınmadı') + '.')));
  }

  const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Ana Sayfa'), h('div', { class: 'muted' }, today))),
    notices,
    h('div', { class: 'tiles' },
      tile('main', 'plus', 'Yeni Fiş Kes', 'Üreticiden alım fişi', '#/fis/yeni'),
      tile('', 'receipt', 'Fişler', 'Geçmiş fişler, ödemeler', '#/fisler'),
      tile('', 'users', 'Müşteriler', 'Üreticiler, borç-alacak', '#/musteriler'),
      tile('', 'tag', 'Ürünler ve Fiyatlar', 'Fiyat güncelle, stok', '#/urunler')),
    h('div', { class: 'cards' },
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Bugün kesilen fiş'), h('div', { class: 'v' }, C.formatInt(d.today_count)),
        h('div', { class: 's' }, C.formatInt(d.today_bags) + ' çuval')),
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Bugünkü alım tutarı'), h('div', { class: 'v' }, money(d.today_amount)),
        h('div', { class: 's' }, 'Komisyon: ' + C.formatMoney(d.today_commission, true))),
      h('div', { class: 'stat us' }, h('div', { class: 'k' }, 'Üreticilere borcumuz'), h('div', { class: 'v' }, money(d.open_amount)),
        h('div', { class: 's' }, C.formatInt(d.open_count) + ' fiş ödenmedi / kısmen ödendi')),
      h('div', { class: 'stat them' }, h('div', { class: 'k' }, 'Üreticilerin bize borcu'), h('div', { class: 'v' }, money(d.they_owe)),
        h('div', { class: 's' }, 'Elden ve diğer borçlar'))),
    h('div', { class: 'section-title' }, h('h2', null, 'Son fişler'), btn('Tümünü gör', { onClick: () => App.go('#/fisler') })),
    UI.table([
      { label: 'Fiş No', render: (r) => h('b', null, r.id) },
      { label: 'Tarih', render: (r) => C.formatDateTime(r.created_at) },
      { label: 'Müşteri', key: 'customer_name' },
      { label: 'Çuval', align: 'right', render: (r) => C.formatInt(r.total_bags) },
      { label: 'Tutar', align: 'right', render: (r) => money(r.total_amount) },
      { label: 'Durum', render: (r) => statusBadge(r.status) },
    ], d.recent, { onRowClick: (r) => App.go('#/fis/' + r.id), empty: 'Henüz fiş kesilmedi.' }));
};
