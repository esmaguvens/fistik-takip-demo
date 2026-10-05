// Ayarlar: firma adı, komisyon, hamallık, fiyat uyarısı, otomatik kilit, klasörler, PIN.
'use strict';

window.Screens.ayarlar = async function () {
  const { h, btn, field, numberInput, toast } = UI;
  const [s, info] = await Promise.all([UI.api('getSettings'), UI.api('appInfo')]);
  const run = (fn) => async () => { try { await fn(); } catch (e) { UI.showError(e); } };

  const company = h('input', { type: 'text', value: s.company_name, maxlength: 80 });
  const rate = numberInput({ kind: 'percent', value: s.commission_rate });
  const fee = numberInput({ kind: 'money', value: s.porter_fee });
  const warnDays = numberInput({ kind: 'int', value: s.price_warn_days });
  const lockMin = numberInput({ kind: 'int', value: s.auto_lock_minutes });
  let docsDir = s.docs_dir;
  const docsPath = h('p', { class: 'path' }, docsDir || info.docsDir);

  async function save() {
    const vals = { rate: rate.getValue(), fee: fee.getValue(), warn: warnDays.getValue(), lock: lockMin.getValue() };
    if (Object.values(vals).some((v) => v === null || Number.isNaN(v))) { toast('Tüm sayıları doğru yazın.', 'error'); return; }
    await UI.api('saveSettings', {
      company_name: company.value, commission_rate: vals.rate, porter_fee: vals.fee,
      price_warn_days: vals.warn, auto_lock_minutes: vals.lock, docs_dir: docsDir,
    });
    await App.loadSettings();
    toast('Ayarlar kaydedildi.');
  }

  async function changePin() {
    const pin = () => h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
    const oldP = pin(); const n1 = pin(); const n2 = pin();
    await UI.modal({
      title: 'PIN değiştir',
      body: h('div', null, field('Şu anki PIN', oldP), field('Yeni PIN (4-6 rakam)', n1), field('Yeni PIN (tekrar)', n2)),
      actions: [
        { label: 'Vazgeç', value: null },
        {
          label: 'Değiştir', kind: 'primary',
          onClick: async () => {
            if (n1.value !== n2.value) { toast('Yeni PIN\'ler aynı değil.', 'error'); return false; }
            await UI.api('changePin', oldP.value, n1.value);
            toast('PIN değiştirildi.');
            return true;
          },
        },
      ],
    });
  }

  return UI.page('Ayarlar', [btn('Kaydet', { kind: 'primary', icon: 'save', onClick: run(save) })],
    h('div', { class: 'two-col' },
      h('div', null,
        h('div', { class: 'card' },
          h('h2', null, 'Fiş'),
          field('Firma adı (fişin üstünde yazar)', company),
          h('div', { class: 'row' },
            field('Komisyon oranı (%)', rate, 'Toplam tutar üzerinden'),
            field('Hamallık (TL / çuval)', fee, 'Her adet (çuval) için')),
          h('p', { class: 'muted', style: { fontSize: '.88rem' } }, 'Oran değişiklikleri sadece yeni fişlere uygulanır; eski fişler değişmez.')),
        h('div', { class: 'card' },
          h('h2', null, 'Fiş dosyalarının kaydedileceği klasör'),
          docsPath,
          h('div', { class: 'page-actions', style: { marginTop: '10px' } },
            btn('Klasör seç', { icon: 'folder', onClick: run(async () => {
              const d = await UI.api('chooseFolder', 'PDF ve Excel fişlerinin kaydedileceği klasör');
              if (d) { docsDir = d; docsPath.textContent = d; }
            }) }),
            btn('Klasörü aç', { kind: 'ghost', onClick: run(() => UI.api('openDocsDir')) })),
          h('p', { class: 'muted', style: { fontSize: '.88rem', marginTop: '8px' } }, 'Değişikliği uygulamak için sağ üstteki "Kaydet"e basın. Dosyalar yıl klasörlerine ayrılır.'))),
      h('div', null,
        h('div', { class: 'card' },
          h('h2', null, 'Uyarılar ve güvenlik'),
          field('Fiyat uyarısı (gün)', warnDays, 'Bu kadar gün güncellenmeyen fiyat için uyarı verilir. 1 = her gün kontrol.'),
          field('Otomatik kilit (dakika)', lockMin, 'Bu süre işlem yapılmazsa program kilitlenir. 0 = kapalı.'),
          btn('PIN değiştir', { icon: 'lock', onClick: run(changePin) })),
        h('div', { class: 'card' },
          h('h2', null, 'Program bilgisi'),
          h('div', { class: 'kv' },
            h('div', { class: 'k' }, 'Sürüm'), h('div', { class: 'v' }, info.version),
            h('div', { class: 'k' }, 'Veri klasörü'), h('div', { class: 'v', style: { fontWeight: 400, fontSize: '.85rem', wordBreak: 'break-all' } }, info.dataDir))))));
};
