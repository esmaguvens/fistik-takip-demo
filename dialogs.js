// Birden çok ekranda kullanılan pencereler.
'use strict';

window.Dialogs = (() => {
  const { h, field, numberInput, toast, modal, money } = UI;
  const C = window.Calc;

  // Yeni müşteri / müşteri düzenle. Dönüş: müşteri id veya null
  async function customerForm(existing, prefill) {
    const c = existing || {};
    let first = c.first_name || '';
    let last = c.last_name || '';
    if (!existing && prefill) {
      const parts = prefill.trim().split(/\s+/);
      if (parts.length > 1) { last = parts.pop(); first = parts.join(' '); } else first = parts[0] || '';
    }
    const fFirst = h('input', { type: 'text', value: first, maxlength: 60 });
    const fLast = h('input', { type: 'text', value: last, maxlength: 60 });
    const fPhone = h('input', { type: 'tel', value: c.phone || '', maxlength: 30 });
    const fAddr = h('input', { type: 'text', value: c.address || '', maxlength: 120 });
    const fNote = h('textarea', { rows: 2, maxlength: 300 }, c.note || '');
    const read = () => ({ first_name: fFirst.value, last_name: fLast.value, phone: fPhone.value, address: fAddr.value, note: fNote.value });
    const save = async (force) => {
      const data = Object.assign(read(), { force });
      return existing ? UI.api('updateCustomer', existing.id, data) : UI.api('addCustomer', data);
    };
    return modal({
      title: existing ? 'Müşteri bilgilerini düzenle' : 'Yeni müşteri',
      body: h('div', null,
        h('div', { class: 'row' }, field('Adı *', fFirst), field('Soyadı', fLast)),
        h('div', { class: 'row' }, field('Telefon', fPhone), field('Köy / adres', fAddr, 'Fişte isminin altındaki satırda görünür.')),
        field('Not', fNote)),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Kaydet', kind: 'primary',
          onClick: async () => {
            try {
              const id = await save(false);
              toast(existing ? 'Müşteri güncellendi.' : 'Müşteri eklendi.');
              return id;
            } catch (e) {
              if (e.code !== 'AYNI_ISIM') throw e;
              const ok = await UI.confirmBox({ title: 'Aynı isimde müşteri var', message: e.message, okText: 'Evet, kaydet' });
              if (!ok) return false;
              const id = await save(true);
              toast(existing ? 'Müşteri güncellendi.' : 'Müşteri eklendi.');
              return id;
            }
          },
        },
      ],
    });
  }

  // Fiyat güncelle / aynı fiyatı onayla. Dönüş: true / null
  function priceUpdate(p) {
    const input = numberInput({ kind: 'money', value: p.price });
    return modal({
      title: p.name + ' — fiyat',
      body: h('div', null,
        h('div', { class: 'kv', style: { marginBottom: '16px' } },
          h('div', { class: 'k' }, 'Şu anki fiyat'), h('div', { class: 'v' }, money(p.price), ' / kg'),
          h('div', { class: 'k' }, 'Son güncelleme'), h('div', { class: 'v' }, C.formatDateTime(p.price_updated_at))),
        field('Yeni kg fiyatı (TL)', input, 'Fiyat değişmediyse "Fiyat aynı" düğmesine basın; bugünün fiyatı olarak onaylanır.')),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Fiyat aynı', icon: 'check',
          onClick: async () => { await UI.api('updatePrice', p.id, p.price); toast(p.name + ' fiyatı onaylandı.'); return true; },
        },
        {
          label: 'Kaydet', kind: 'primary',
          onClick: async () => {
            const v = input.getValue();
            if (!v || Number.isNaN(v)) { toast('Geçerli bir fiyat yazın.', 'error'); return false; }
            await UI.api('updatePrice', p.id, v);
            toast(p.name + ' fiyatı güncellendi: ' + C.formatMoney(v, true));
            return true;
          },
        },
      ],
    });
  }

  // Fişe ödeme ekle. Dönüş: true / null
  function addPayment(r) {
    const amount = numberInput({ kind: 'money', value: r.remaining });
    const canOffset = r.customer_account > 0;
    let method = 'nakit';
    const note = h('input', { type: 'text', maxlength: 200, placeholder: 'İsteğe bağlı (ör. havale, kime verildi)' });
    const offsetInfo = h('div', { class: 'field-hint' });
    const seg = h('div', { class: 'seg' });
    const draw = () => {
      UI.clear(seg);
      seg.appendChild(h('button', { type: 'button', class: method === 'nakit' ? 'on' : '', onclick: () => { method = 'nakit'; draw(); } }, 'Nakit / havale ile ödedik'));
      seg.appendChild(h('button', { type: 'button', class: method === 'mahsup' ? 'on' : '', disabled: !canOffset,
        onclick: () => { method = 'mahsup'; if ((amount.getValue() || 0) > r.customer_account) amount.setValue(Math.min(r.customer_account, r.remaining)); draw(); } },
      'Üreticinin borcundan düş'));
      offsetInfo.textContent = canOffset
        ? 'Üreticinin bize borcu: ' + C.formatMoney(r.customer_account, true) + '. "Borcundan düş" seçilirse bu tutar hem fişten hem de borcundan düşülür.'
        : 'Üreticinin bize borcu yok; borçtan düşme yapılamaz.';
    };
    draw();
    return modal({
      title: 'Fiş ' + r.id + ' — ödeme ekle',
      body: h('div', null,
        h('div', { class: 'kv', style: { marginBottom: '16px' } },
          h('div', { class: 'k' }, 'Üreticiye ödenecek'), h('div', { class: 'v' }, money(r.payable)),
          h('div', { class: 'k' }, 'Şimdiye kadar ödenen'), h('div', { class: 'v' }, money(r.paid)),
          h('div', { class: 'k' }, 'Kalan'), h('div', { class: 'v big' }, money(r.remaining))),
        field('Ödeme şekli', seg, null), offsetInfo, h('div', { style: { height: '12px' } }),
        field('Ödenen tutar (TL)', amount, 'Kalanın tamamını veya bir kısmını yazabilirsiniz.'),
        field('Not', note)),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Ödemeyi kaydet', kind: 'primary',
          onClick: async () => {
            const v = amount.getValue();
            if (!v || Number.isNaN(v)) { toast('Geçerli bir tutar yazın.', 'error'); return false; }
            await UI.api('addPayment', r.id, { amount: v, method, note: note.value });
            toast('Ödeme kaydedildi.');
            return true;
          },
        },
      ],
    });
  }

  // Müşteri hesabına elle işlem. Dönüş: true / null
  function accountEntry(c, presetType) {
    const types = Object.entries(C.ENTRY_TYPES).filter(([, t]) => t.manual);
    const sel = h('select', null, types.map(([k, t]) => h('option', { value: k, selected: k === presetType }, t.label)));
    const amount = numberInput({ kind: 'money' });
    const date = h('input', { type: 'date', value: C.todayLocal() });
    const note = h('input', { type: 'text', maxlength: 300, placeholder: 'Ör. defterdeki kayıt, açıklama' });
    const explain = h('div', { class: 'notice info', style: { marginTop: '4px' } });
    const texts = {
      acilis_alacak: 'Defterden aktarım: Müşterinin programdan önceki, bize olan borcu.',
      acilis_borc: 'Defterden aktarım: Programdan önce bizim müşteriye olan borcumuz.',
      borc_ekle: 'Fiş kesmeden müşteriye para verdik (borç). Müşterinin bize borcu artar.',
      tahsilat: 'Müşteri bize olan borcunu ödedi. Müşterinin bize borcu azalır.',
      odeme_yaptik: 'Fişe bağlı olmadan müşteriye ödeme yaptık (ör. eski borcumuzu ödedik).',
    };
    const upd = () => { explain.textContent = texts[sel.value]; };
    sel.addEventListener('change', upd);
    upd();
    return modal({
      title: c.full_name + ' — hesaba işlem ekle',
      body: h('div', null, field('İşlem', sel), explain, h('div', { style: { height: '12px' } }),
        h('div', { class: 'row' }, field('Tutar (TL)', amount), field('Tarih', date)), field('Açıklama', note)),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Kaydet', kind: 'primary',
          onClick: async () => {
            const v = amount.getValue();
            if (!v || Number.isNaN(v)) { toast('Geçerli bir tutar yazın.', 'error'); return false; }
            await UI.api('addAccountEntry', c.id, { type: sel.value, amount: v, date: date.value, note: note.value });
            toast('İşlem kaydedildi.');
            return true;
          },
        },
      ],
    });
  }

  // Yazdırmadan önce kâğıt ve yazıcı seçimi. Son seçim hatırlanır.
  // Dönüş: { layout: 'a5' | 'a4' | 'a4x2', printer: ad | null, printerLabel, dialog } veya null (vazgeçildi)
  const PRINT_KEY = 'fh-yazdirma';
  function loadPrintPrefs() {
    try {
      const v = JSON.parse(localStorage.getItem(PRINT_KEY) || '{}');
      return { layout: ['a5', 'a4', 'a4x2'].includes(v.layout) ? v.layout : 'a4', printer: v.printer || null };
    } catch (e) { return { layout: 'a4', printer: null }; }
  }

  async function printOptions(receiptId) {
    const prefs = loadPrintPrefs();
    let layout = prefs.layout;
    let printers = [];
    try { printers = await UI.api('listPrinters'); } catch (e) { printers = []; }
    const pick = printers.find((p) => p.name === prefs.printer) || printers.find((p) => p.isDefault) ||
      printers.find((p) => !/pdf|onenote|xps|fax/i.test(p.name)) || printers[0];

    const group = (title, el) => h('div', { class: 'field' }, h('span', { class: 'field-label' }, title), el);
    const paperSeg = h('div', { class: 'seg seg-wrap' });
    const hint = h('p', { class: 'muted', style: { fontSize: '.88rem', margin: '4px 0 12px' } });
    const printerSel = h('select', null, printers.map((p) => h('option', { value: p.name, selected: !!pick && p.name === pick.name }, p.displayName)));
    const winDialog = h('input', { type: 'checkbox' });
    const HINTS = {
      a4: 'Tepsiye A4 kâğıt koyun. Fiş A4 sayfayı kaplayacak şekilde büyütülür.',
      a5: 'Tepsiye A5 kâğıt dik olarak yerleştirin. Fiş A5 sayfayı kaplar.',
      a4x2: 'Tepsiye A4 kâğıt koyun. Sayfa yatay basılır: aynı fiş A5 boyutunda yan yana iki kez. Ortadaki kesik çizgiden kesin; biri üreticiye, biri size.',
    };
    const draw = () => {
      UI.clear(paperSeg);
      for (const [k, label] of [['a4', 'A4 kâğıt'], ['a5', 'A5 kâğıt'], ['a4x2', 'A4 – 2 fiş yan yana']]) {
        paperSeg.appendChild(h('button', { type: 'button', class: layout === k ? 'on' : '', onclick: () => { layout = k; draw(); } }, label));
      }
      hint.textContent = HINTS[layout];
    };
    draw();
    const body = h('div', null, group('Kâğıt', paperSeg), hint,
      printers.length ? group('Yazıcı', printerSel) : null,
      printers.length ? h('label', { class: 'check', style: { fontWeight: 500, fontSize: '.9rem' } }, winDialog,
        h('span', null, 'Windows yazdırma penceresini de aç (kopya sayısı vb. için). O pencerede kâğıt boyutunu ayrıca seçmeniz gerekir.')) : null);
    return modal({
      title: 'Fiş ' + receiptId + ' — yazdır',
      body,
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Yazdır', kind: 'primary', icon: 'print',
          onClick: () => {
            const printer = printers.length ? printerSel.value : null;
            try { localStorage.setItem(PRINT_KEY, JSON.stringify({ layout, printer })); } catch (e) { /* yoksay */ }
            const chosen = printers.find((p) => p.name === printer);
            return { layout, printer, printerLabel: chosen ? chosen.displayName : '', dialog: !printers.length || winDialog.checked };
          },
        },
      ],
    });
  }

  // Kâğıdı ve yazıcıyı sorup fişi yazdırır
  async function printReceipt(id) {
    const o = await printOptions(id);
    if (!o) return null;
    const res = await UI.api('printReceipt', id, { layout: o.layout, printer: o.dialog ? null : o.printer });
    if (res && res.printed === false) {
      if (/cancel/i.test(res.reason || '')) return res;
      throw new Error('Fiş yazdırılamadı' + (res.reason ? ' (' + res.reason + ')' : '') + '. Yazıcının açık ve bağlı olduğunu, tepside kâğıt bulunduğunu kontrol edin.');
    }
    if (!o.dialog) toast('Fiş yazıcıya gönderildi' + (o.printerLabel ? ': ' + o.printerLabel : '') + '.');
    return res;
  }

  return { customerForm, priceUpdate, addPayment, accountEntry, printOptions, printReceipt };
})();
