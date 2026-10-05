// Giriş ekranı: ilk kurulum, PIN ile giriş, kurtarma kodu, yedekten yükleme.
'use strict';

(() => {
  const { h, clear, btn, icon, toast } = UI;

  // PIN tuş takımı. onDone(pin) -> Promise<string|null> (hata mesajı döndürürse gösterilir)
  function pinPad(opts) {
    let pin = '';
    const dots = h('div', { class: 'pin-dots' });
    const msg = h('div', { class: 'pin-msg' }, opts.message || '');
    const max = 6;

    function draw() {
      clear(dots);
      const n = Math.max(4, pin.length);
      for (let i = 0; i < Math.min(max, n); i++) dots.appendChild(h('span', { class: i < pin.length ? 'on' : '' }));
    }
    async function submit() {
      if (pin.length < 4) { msg.textContent = 'PIN en az 4 rakam olmalı.'; return; }
      const p = pin;
      pin = '';
      draw();
      const err = await opts.onDone(p);
      msg.textContent = err || '';
    }
    function press(k) {
      msg.textContent = '';
      if (k === 'sil') pin = pin.slice(0, -1);
      else if (k === 'tamam') { submit(); return; }
      else if (pin.length < max) pin += k;
      draw();
    }
    const pad = h('div', { class: 'pin-pad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => h('button', { type: 'button', onclick: () => press(d) }, d)),
      h('button', { type: 'button', class: 'fn', onclick: () => press('sil') }, 'Sil'),
      h('button', { type: 'button', onclick: () => press('0') }, '0'),
      h('button', { type: 'button', class: 'go', onclick: () => press('tamam') }, 'Tamam'));
    const el = h('div', null, dots, msg, pad);
    el.onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('sil');
      else if (e.key === 'Enter') press('tamam');
    };
    draw();
    return el;
  }

  window.Screens.login = async function (root, onEnter) {
    let keyHandler = null;
    document.onkeydown = (e) => { if (keyHandler && !document.querySelector('.overlay')) keyHandler(e); };

    function frame(company, ...content) {
      keyHandler = null;
      clear(root);
      root.appendChild(h('div', { class: 'login' }, window.Art.sign(company), content));
    }

    async function enterApp(status) {
      document.onkeydown = null;
      keyHandler = null;
      await onEnter(status);
    }

    let status;
    try { status = await UI.auth('status'); } catch (e) { status = { phase: 'error', note: e.message }; }
    const company = status.company;

    // ---- PIN ile giriş ----
    function showPin() {
      const pad = pinPad({
        message: status.waitSeconds ? `Çok fazla hatalı deneme. ${status.waitSeconds} saniye bekleyin.` : '',
        onDone: async (pin) => {
          try {
            const st = await UI.auth('login', pin);
            await enterApp(st);
            return null;
          } catch (e) { return e.message; }
        },
      });
      frame(company,
        h('div', { class: 'login-box' },
          h('h2', null, 'Giriş'),
          h('p', { class: 'muted' }, 'PIN kodunuzu girin'),
          status.note ? h('div', { class: 'notice warn', style: { textAlign: 'left' } }, icon('alert', 20), h('div', null, status.note)) : null,
          pad));
      keyHandler = pad.onKey;
    }

    // ---- İlk kurulum ----
    async function showSetupIntro() {
      frame(company,
        h('div', { class: 'login-box wide' },
          h('h2', null, 'Hoş geldiniz'),
          h('p', { class: 'lead' }, 'Program bu bilgisayarda ilk kez açılıyor.'),
          h('div', { class: 'row', style: { marginTop: '18px' } },
            btn('Yeni kurulum yap', { kind: 'primary', big: true, icon: 'plus', onClick: showSetupCode }),
            btn('Yedekten geri yükle', { big: true, icon: 'save', onClick: restoreFlow })),
          h('p', { class: 'muted', style: { marginTop: '14px' } },
            'Eski bilgisayardaki kayıtları bu bilgisayara taşıyorsanız "Yedekten geri yükle"yi seçin. Kurtarma kodu gerekir.')));
    }

    async function showSetupCode() {
      let code;
      try { code = (await UI.auth('beginSetup')).code; } catch (e) { UI.showError(e); return; }
      const agree = h('input', { type: 'checkbox' });
      const next = btn('Devam', { kind: 'primary', big: true, disabled: true, onClick: () => showSetupPin(code) });
      agree.addEventListener('change', () => { next.disabled = !agree.checked; });
      frame(company,
        h('div', { class: 'login-box wide' },
          h('div', { class: 'steps' }, h('span', { class: 'on' }), h('span')),
          h('h2', null, '1. Kurtarma kodunuz'),
          h('p', null, 'Kayıtlarınız şifreli tutulur. Bilgisayar bozulursa veya değişirse, yedeklerinizi yeni bilgisayarda ',
            h('b', null, 'sadece bu kodla'), ' açabilirsiniz.'),
          h('div', { class: 'code-box' }, code),
          h('ul', { class: 'hint-list' },
            h('li', null, 'Kodu yazdırın veya bir kağıda yazın.'),
            h('li', null, 'Kağıdı bilgisayarın yanında değil, güvenli bir yerde (kasa, ev) saklayın.'),
            h('li', null, 'Kod kaybolursa yedekler başka bilgisayarda açılamaz.')),
          h('div', { style: { margin: '16px 0' } }, btn('Kodu yazdır', { icon: 'print', onClick: () => UI.auth('printSetupCode').catch(UI.showError) })),
          h('label', { class: 'check', style: { margin: '10px 0 18px' } }, agree, h('span', null, 'Kodu yazdım / yazdırdım ve güvenli bir yere koydum.')),
          h('div', { style: { textAlign: 'right' } }, next)));
    }

    function showSetupPin(code, afterRestore) {
      let first = null;
      const title = h('p', { class: 'muted' }, 'Programa girerken kullanacağınız 4-6 haneli PIN kodunu girin.');
      const pad = pinPad({
        onDone: async (pin) => {
          if (!first) {
            first = pin;
            title.textContent = 'Aynı PIN kodunu tekrar girin.';
            return null;
          }
          if (pin !== first) {
            first = null;
            title.textContent = 'Programa girerken kullanacağınız 4-6 haneli PIN kodunu girin.';
            return 'İki PIN aynı değil. Baştan girin.';
          }
          try {
            const st = await UI.auth(afterRestore ? 'setPinAfterRestore' : 'finishSetup', pin);
            toast('Kurulum tamamlandı.');
            await enterApp(st);
            return null;
          } catch (e) { return e.message; }
        },
      });
      frame(company,
        h('div', { class: 'login-box' },
          afterRestore ? null : h('div', { class: 'steps' }, h('span', { class: 'on' }), h('span', { class: 'on' })),
          h('h2', null, afterRestore ? 'PIN belirleyin' : '2. PIN belirleyin'),
          title, pad));
      keyHandler = pad.onKey;
    }

    // ---- Kurtarma kodu (başka bilgisayar / Windows kullanıcısı) ----
    function codeInput() {
      return h('input', { type: 'text', class: 'code-input', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', maxlength: 29, autocomplete: 'off', spellcheck: 'false' });
    }

    function showRecovery() {
      const input = codeInput();
      const go = async () => {
        try {
          const st = await UI.auth('recover', input.value);
          toast('Kayıtlar açıldı. Şimdi PIN ile giriş yapın.');
          status = st;
          if (st.phase === 'setup-pin') showSetupPin(null, true); else showPin();
        } catch (e) { UI.showError(e); }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      frame(company,
        h('div', { class: 'login-box wide' },
          h('h2', null, 'Kurtarma kodu gerekiyor'),
          h('p', null, 'Kayıtlar bu bilgisayarda veya bu Windows kullanıcısında açılamadı. ' +
            'Bu durum, veriler başka bir bilgisayardan kopyalandığında veya Windows yeniden kurulduğunda olur.'),
          h('p', null, 'Kurulumda verilen kurtarma kodunu girin:'),
          input,
          h('div', { class: 'row', style: { marginTop: '16px' } },
            btn('Aç', { kind: 'primary', big: true, onClick: go }),
            btn('Yedekten geri yükle', { big: true, icon: 'save', onClick: restoreFlow }))));
      setTimeout(() => input.focus(), 50);
    }

    function showNoData() {
      frame(company,
        h('div', { class: 'login-box wide' },
          h('div', { class: 'notice error' }, icon('alert', 22), h('div', null, h('b', null, 'Veri dosyası bulunamadı. '), 'Kayıtlarınızı geri getirmek için en son yedeği yükleyin.')),
          btn('Yedekten geri yükle', { kind: 'primary', big: true, icon: 'save', onClick: restoreFlow })));
    }

    async function restoreFlow() {
      try {
        const res = await UI.auth('restoreFromBackup');
        if (res.cancelled) return;
        const input = codeInput();
        const ok = await UI.modal({
          title: 'Kurtarma kodunu girin',
          body: h('div', null, h('p', null, 'Bu yedek şifrelidir. Yedeğin alındığı bilgisayardaki kurtarma kodunu girin:'), input),
          actions: [
            { label: 'Vazgeç', value: null },
            {
              label: 'Geri yükle', kind: 'primary',
              onClick: async () => {
                const st = await UI.auth('restoreFromBackup', input.value);
                return st;
              },
            },
          ],
        });
        if (!ok) return;
        status = ok;
        toast('Yedek yüklendi. Şimdi yedekteki PIN ile giriş yapın.');
        if (ok.phase === 'setup-pin') showSetupPin(null, true); else showPin();
      } catch (e) { UI.showError(e); }
    }

    switch (status.phase) {
      case 'setup': return showSetupIntro();
      case 'setup-pin': return showSetupPin(null, true);
      case 'locked': return showPin();
      case 'unlocked': return enterApp(status);
      case 'recovery': return showRecovery();
      case 'nodata': return showNoData();
      default:
        return frame(company, h('div', { class: 'login-box wide' },
          h('div', { class: 'notice error' }, icon('alert', 22), h('div', null, status.note || 'Program başlatılamadı.'))));
    }
  };
})();
