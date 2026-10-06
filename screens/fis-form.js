// Yeni fiş / fiş düzeltme. Ekran, kağıt fişin görünümündedir.
'use strict';

(() => {
  const { h, icon, btn, field, numberInput, money, toast } = UI;
  const C = window.Calc;
  const MIN_ROWS = 7;

  async function build(opts) {
    const editing = opts.receipt || null;
    const settings = await UI.api('getSettings');
    let products = [];
    const rate = editing ? editing.commission_rate : settings.commission_rate;
    const fee = editing ? editing.porter_fee : settings.porter_fee;

    async function loadProducts() {
      const all = await UI.api('listProducts', { includeDeleted: !!editing });
      const used = new Set(editing ? editing.items.map((it) => it.product_id) : []);
      products = all.filter((p) => !p.deleted_at || used.has(p.id));
    }
    await loadProducts();
    const productById = (id) => products.find((p) => p.id === Number(id));

    // ---------- durum ----------
    const state = {
      customer: null,
      rows: [],
      payMode: 'odenmedi',
      confirmed: false,
    };
    if (editing) {
      state.rows = editing.items.map((it) => ({ product_id: it.product_id, bags: it.bags, kg: it.kg, orig_price: it.price, orig_product: it.product_id }));
    }
    while (state.rows.length < MIN_ROWS) state.rows.push({ product_id: null, bags: null, kg: null });

    // ---------- müşteri ----------
    const custInfo = h('div', { class: 'cust-info' });
    const custSelect = UI.searchSelect({
      placeholder: 'Müşteri adı yazın ve seçin…',
      load: (q) => UI.api('listCustomers', { q }),
      label: (c) => c.full_name,
      sub: (c) => [c.address, c.phone].filter(Boolean).join(' · ') || ' ',
      createLabel: 'Yeni müşteri ekle',
      onCreate: async (q) => {
        const id = await Dialogs.customerForm(null, q);
        return id ? UI.api('getCustomer', id) : null;
      },
      onSelect: (c) => { state.customer = c; drawCustInfo(); recalc(); },
    });
    function drawCustInfo() {
      UI.clear(custInfo);
      const c = state.customer;
      if (!c) return;
      custInfo.appendChild(h('span', { class: 'muted' }, (c.address ? c.address + ' · ' : '') + 'Hesap durumu: '));
      custInfo.appendChild(UI.netText(c.net));
    }

    // ---------- satırlar ----------
    const tbody = h('tbody');
    const rowEls = [];

    function productOptions(selectedId) {
      return [h('option', { value: '' }, '— seçin —')].concat(products.map((p) =>
        h('option', { value: p.id, selected: p.id === Number(selectedId) }, p.name + (p.deleted_at ? ' (silinmiş)' : ''))));
    }

    function rowPrice(row) {
      if (!row.product_id) return null;
      if (row.orig_price !== undefined && row.orig_price !== null && Number(row.product_id) === row.orig_product) return row.orig_price;
      const p = productById(row.product_id);
      return p ? p.price : null;
    }

    function makeRow(row, idx) {
      const sel = h('select', { 'aria-label': 'Cinsi' }, productOptions(row.product_id));
      const bags = numberInput({ kind: 'int', value: row.bags });
      const kg = numberInput({ kind: 'kg', value: row.kg });
      const priceCell = h('td', { class: 'calc' });
      const amountCell = h('td', { class: 'calc' });
      const rm = h('button', { type: 'button', class: 'icon-btn rm', title: 'Satırı temizle', onclick: () => {
        row.product_id = null; row.bags = null; row.kg = null; delete row.orig_price;
        sel.value = ''; bags.value = ''; kg.value = ''; recalc();
      } }, icon('x', 16));
      sel.addEventListener('change', () => { row.product_id = sel.value ? Number(sel.value) : null; recalc(); });
      bags.addEventListener('input', () => { row.bags = bags.getValue(); recalc(); });
      kg.addEventListener('input', () => { row.kg = kg.getValue(); recalc(); });
      const tr = h('tr', { class: 'item' },
        h('td', null, h('div', { class: 'cinsi-cell' }, sel, rm)),
        h('td', null, bags), h('td', null, kg), priceCell, amountCell);
      rowEls[idx] = { tr, priceCell, amountCell, sel };
      return tr;
    }

    // Toplam satırları
    const comPrice = h('td', { class: 'calc' });
    const comAmount = h('td', { class: 'calc' });
    const porKg = h('td', { class: 'calc' });
    const porPrice = h('td', { class: 'calc' });
    const porAmount = h('td', { class: 'calc' });
    const cashInput = numberInput({ kind: 'money', value: editing && editing.cash_advance ? editing.cash_advance : null, placeholder: '0,00' });
    cashInput.addEventListener('input', () => recalc());
    const totalAmount = h('td', { class: 'calc' });
    const payableAmount = h('td', { class: 'calc' });
    const porterDeducted = editing ? !!editing.porter_deducted : true;

    function drawRows() {
      UI.clear(tbody);
      state.rows.forEach((row, i) => {
        const tr = makeRow(row, i);
        if (i === state.rows.length - 1) tr.classList.add('last-item');
        tbody.appendChild(tr);
      });
      tbody.appendChild(h('tr', { class: 'sum' }, h('td', { class: 'lbl', colspan: 2 }, 'Komisyon'), h('td'), comPrice, comAmount));
      tbody.appendChild(h('tr', { class: 'sum' }, h('td', { class: 'lbl', colspan: 2 }, 'Hamallık'), porKg, porPrice, porAmount));
      tbody.appendChild(h('tr', { class: 'sum' }, h('td', { class: 'lbl', colspan: 2 }, 'Elden'), h('td'), h('td', { class: 'calc' }, h('span', { class: 'sub' }, 'borç')), h('td', null, cashInput)));
      tbody.appendChild(h('tr', { class: 'sum total' }, h('td', { class: 'lbl', colspan: 2 }, 'TOPLAM'), h('td'), h('td'), totalAmount));
      tbody.appendChild(h('tr', { class: 'sum total odenecek' }, h('td', { class: 'lbl', colspan: 2 }, 'ÖDENECEK'), h('td'), h('td'), payableAmount));
      recalc();
    }

    // ---------- yan panel ----------
    const payableBox = h('div', { class: 'payable' });
    const priceBox = h('div', { class: 'price-check' });
    const confirmBox = h('input', { type: 'checkbox' });
    confirmBox.addEventListener('change', () => { state.confirmed = confirmBox.checked; });
    const partialInput = numberInput({ kind: 'money', placeholder: 'Ödenen tutar' });
    const partialField = field('Şimdi ödenen tutar (TL)', partialInput);
    const paySeg = h('div', { class: 'seg' });
    function drawPaySeg() {
      UI.clear(paySeg);
      for (const [k, label] of [['odenmedi', 'Ödenmedi'], ['odendi', 'Ödendi'], ['kismen', 'Kısmen']]) {
        paySeg.appendChild(h('button', { type: 'button', class: state.payMode === k ? 'on' : '', onclick: () => { state.payMode = k; drawPaySeg(); } }, label));
      }
      partialField.hidden = state.payMode !== 'kismen';
    }
    drawPaySeg();

    function currentCalc() {
      const items = state.rows
        .filter((r) => r.product_id && r.bags > 0 && r.kg > 0)
        .map((r) => ({ bags: r.bags, kg: r.kg, price: rowPrice(r) || 0 }));
      const cash = cashInput.getValue();
      return C.computeReceipt({ items, commissionRate: rate, porterFee: fee, cashAdvance: Number.isNaN(cash) ? 0 : cash || 0, porterDeducted });
    }

    function recalc() {
      state.rows.forEach((row, i) => {
        const el = rowEls[i];
        if (!el) return;
        const price = rowPrice(row);
        UI.clear(el.priceCell);
        UI.clear(el.amountCell);
        if (price !== null) el.priceCell.appendChild(document.createTextNode(C.formatMoney(price)));
        if (price !== null && row.kg > 0) el.amountCell.appendChild(document.createTextNode(C.formatMoney(C.computeReceipt({ items: [{ bags: 0, kg: row.kg, price }] }).totalAmount)));
      });
      const c = currentCalc();
      comPrice.textContent = '%' + String(rate).replace('.', ',');
      comAmount.textContent = C.formatMoney(c.commission);
      porKg.textContent = C.formatInt(c.totalBags) + ' çuval';
      porPrice.textContent = C.formatMoney(fee);
      porAmount.textContent = C.formatMoney(c.porterage);
      totalAmount.textContent = C.formatMoney(c.feeTotal);
      payableAmount.textContent = C.formatMoney(c.payable);

      UI.clear(payableBox);
      payableBox.appendChild(h('div', { class: 'k' }, 'ÜRETİCİYE ÖDENECEK'));
      payableBox.appendChild(h('div', { class: 'v' }, C.formatMoney(c.payable), h('small', null, ' TL')));
      payableBox.appendChild(h('div', { class: 'line' }, h('span', null, 'Toplam tutar'), h('span', null, C.formatMoney(c.totalAmount, true))));
      payableBox.appendChild(h('div', { class: 'line' }, h('span', null, '− Komisyon'), h('span', null, C.formatMoney(c.commission, true))));
      if (porterDeducted) payableBox.appendChild(h('div', { class: 'line' }, h('span', null, '− Hamallık'), h('span', null, C.formatMoney(c.porterage, true))));
      payableBox.appendChild(h('div', { class: 'line' }, h('span', null, 'Toplam çuval / kg'), h('span', null, C.formatInt(c.totalBags) + ' / ' + C.formatKg(c.totalKg))));
      if (c.cashAdvance) {
        payableBox.appendChild(h('div', { class: 's', style: { marginTop: '8px' } },
          'Elden ' + C.formatMoney(c.cashAdvance, true) + ' müşterinin bize borcuna eklenecek.'));
      }
      drawPriceBox();
    }

    function drawPriceBox() {
      const used = [];
      const seen = new Set();
      for (const r of state.rows) {
        if (!r.product_id || seen.has(r.product_id)) continue;
        seen.add(r.product_id);
        const p = productById(r.product_id);
        if (p) used.push({ p, kept: r.orig_price !== undefined && r.orig_price !== null && Number(r.product_id) === r.orig_product, price: rowPrice(r) });
      }
      const stale = used.some((u) => !u.kept && u.p.price_stale);
      priceBox.className = 'price-check' + (!stale && used.length ? ' ok' : '');
      UI.clear(priceBox);
      priceBox.appendChild(h('h3', null, icon(stale ? 'alert' : 'tag', 20), 'Fiyat kontrolü'));
      if (!used.length) {
        priceBox.appendChild(h('p', { class: 'muted' }, 'Ürün seçtiğinizde fiyatları burada görürsünüz.'));
      } else {
        priceBox.appendChild(h('ul', { class: 'price-list' }, used.map((u) => h('li', null,
          h('div', null, h('b', null, u.p.name), ' ', C.formatMoney(u.price, true), '/kg',
            h('div', { class: u.kept ? 'muted' : (u.p.price_stale ? 'old' : 'muted'), style: { fontSize: '.8rem' } },
              u.kept ? 'Fişteki eski fiyat korunuyor' : (u.p.price_stale ? 'Fiyat ' + (u.p.price_age_days === Infinity ? 'hiç' : u.p.price_age_days + ' gündür') + ' güncellenmedi!' : 'Bugün güncellendi'))),
          u.kept ? null : btn('Güncelle', { small: true, onClick: async () => {
            if (await Dialogs.priceUpdate(u.p)) { await loadProducts(); recalc(); }
          } })))));
      }
      priceBox.appendChild(h('label', { class: 'check' }, confirmBox, h('span', null, 'Fiyatlar güncel, kontrol ettim.')));
    }

    // ---------- klavye: Enter ile sonraki kutuya ----------
    function onTableKey(e) {
      if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      const all = [...tableEl.querySelectorAll('select, input')];
      const i = all.indexOf(e.target);
      if (i >= 0 && i < all.length - 1) all[i + 1].focus();
    }

    // ---------- kaydet ----------
    function isDirty() {
      if (editing) return true;
      return !!state.customer || state.rows.some((r) => r.product_id || r.bags || r.kg) || !!cashInput.value.trim();
    }
    App.setLeaveGuard(isDirty);

    async function save(after) {
      if (!state.customer) { toast('Müşteri seçin (Sayın …).', 'error'); custSelect.focus(); return; }
      const bad = tableEl.querySelector('input.invalid');
      if (bad || [...tableEl.querySelectorAll('input')].some((i) => !i.isValid || !i.isValid())) {
        toast('Hatalı yazılmış bir sayı var. Kırmızı kutuyu düzeltin.', 'error');
        return;
      }
      if (!state.confirmed) {
        toast('Kaydetmeden önce fiyatları kontrol edip "Fiyatlar güncel" kutusunu işaretleyin.', 'error');
        priceBox.scrollIntoView({ block: 'center' });
        return;
      }
      const cash = cashInput.getValue() || 0;
      const payload = {
        customer_id: state.customer.id,
        priceConfirmed: true,
        cash_advance: cash,
        items: state.rows.filter((r) => r.product_id || r.bags || r.kg).map((r) => ({
          product_id: r.product_id, bags: r.bags, kg: r.kg,
          orig_price: r.orig_price !== undefined && Number(r.product_id) === r.orig_product ? r.orig_price : undefined,
        })),
      };
      let id;
      try {
        if (editing) {
          const ok = await UI.confirmBox({ title: 'Fiş ' + editing.id + ' düzeltilsin mi?', message: 'Değişiklik kayıt geçmişine eski ve yeni haliyle yazılacak.', okText: 'Düzelt ve kaydet', reasonLabel: 'Düzeltme nedeni', reasonPlaceholder: 'Ör. KG yanlış yazılmıştı' });
          if (!ok) return;
          id = await UI.api('updateReceipt', editing.id, payload, ok.reason);
          toast('Fiş ' + id + ' düzeltildi.');
        } else {
          payload.payment = { mode: state.payMode, amount: state.payMode === 'kismen' ? partialInput.getValue() : null };
          id = await UI.api('createReceipt', payload);
          toast('Fiş ' + id + ' kaydedildi.');
        }
      } catch (e) { UI.showError(e); return; }
      App.setLeaveGuard(null);
      try {
        if (after === 'print') await UI.api('printReceipt', id);
        if (after === 'pdf') await UI.fileSaved('PDF kaydedildi', await UI.api('receiptPdf', id));
      } catch (e) { UI.showError(e); }
      App.go('#/fis/' + id);
    }

    // ---------- düzen ----------
    const now = C.nowLocal();
    const addRowBtn = btn('Satır ekle', { small: true, kind: 'ghost', icon: 'plus', onClick: () => {
      state.rows.push({ product_id: null, bags: null, kg: null });
      drawRows();
      rowEls[state.rows.length - 1].sel.focus();
    } });
    const tableEl = h('table', { class: 'fis-in', onkeydown: onTableKey },
      h('colgroup', null, h('col', { style: { width: '27%' } }), h('col', { style: { width: '11%' } }), h('col', { style: { width: '18%' } }), h('col', { style: { width: '17%' } }), h('col', { style: { width: '27%' } })),
      h('thead', null, h('tr', null, ['CİNSİ', 'ADET', 'KG', 'FİYATI', 'TUTARI'].map((t) => h('th', null, t)))),
      tbody);

    const paper = h('div', { class: 'paper' },
      h('div', { class: 'paper-top' },
        h('div', { class: 'paper-firma' }, settings.company_name),
        h('div', { class: 'paper-meta' },
          h('div', null, 'Fiş No: ', h('b', null, editing ? editing.id : 'Yeni')),
          h('div', null, 'Tarih: ', h('b', null, C.formatDate(editing ? editing.created_at : now))),
          h('div', null, 'Saat: ', h('b', null, C.formatTime(editing ? editing.created_at : now))))),
      h('div', { class: 'sayin' }, h('span', { class: 'lbl' }, 'Sayın'), custSelect),
      custInfo,
      tableEl,
      h('div', { class: 'paper-foot' },
        h('span', { class: 'muted', style: { fontSize: '.88rem' } }, 'Kağıda 7 satır sığar; fazlası ikinci sayfaya geçer. Enter tuşu sonraki kutuya geçer.'),
        addRowBtn));

    const side = h('div', { class: 'side-panel' },
      payableBox,
      editing
        ? h('div', { class: 'card' }, h('h3', null, 'Ödeme'), h('p', { class: 'muted' }, 'Ödemeler fiş sayfasından eklenir veya silinir. Bu fişe şimdiye kadar ' + C.formatMoney(editing.paid, true) + ' ödendi.'))
        : h('div', { class: 'card' }, h('h3', { style: { marginBottom: '10px' } }, 'Ödeme durumu'), paySeg, h('div', { style: { height: '12px' } }), partialField),
      priceBox,
      h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        btn(editing ? 'Düzeltmeyi kaydet' : 'Kaydet', { kind: 'primary', big: true, icon: 'save', onClick: () => save(null) }),
        editing ? null : h('div', { class: 'btn-stack' },
          btn('Kaydet + Yazdır', { icon: 'print', onClick: () => save('print') }),
          btn('Kaydet + PDF', { icon: 'file', onClick: () => save('pdf') })),
        editing ? btn('Vazgeç', { onClick: () => { App.setLeaveGuard(null); App.go('#/fis/' + editing.id); } }) : null));

    drawRows();

    if (editing && editing.customer) {
      const c = await UI.api('getCustomer', editing.customer.id);
      custSelect.setValue(c);
    } else if (opts.customerId) {
      try { custSelect.setValue(await UI.api('getCustomer', Number(opts.customerId))); } catch (e) { /* yoksay */ }
    }

    const head = editing
      ? h('div', null, h('button', { class: 'back-link', type: 'button', onclick: () => App.go('#/fis/' + editing.id) }, icon('back', 18), 'Fişe dön'), h('h1', null, 'Fiş ' + editing.id + ' — düzelt'))
      : h('h1', null, 'Yeni Fiş');

    const notices = [];
    if (!products.length) {
      notices.push(h('div', { class: 'notice warn' }, icon('alert', 22), h('div', { class: 'grow' }, 'Henüz ürün eklenmemiş. Fiş kesmek için önce ürün ve fiyat ekleyin.'),
        btn('Ürünlere git', { kind: 'primary', onClick: () => { App.setLeaveGuard(null); App.go('#/urunler'); } })));
    }

    const page = h('div', { class: 'page' }, h('div', { class: 'page-head' }, head), notices, h('div', { class: 'fis-layout' }, paper, side));
    if (!editing && !opts.customerId) custSelect.input.setAttribute('autofocus', '');
    return page;
  }

  window.Screens.fisNew = (customerId) => build({ customerId });
  window.Screens.fisEdit = async (id) => {
    const r = await UI.api('getReceipt', Number(id));
    if (r.cancelled_at) throw new Error('İptal edilmiş fiş düzeltilemez.');
    return build({ receipt: r });
  };
})();
