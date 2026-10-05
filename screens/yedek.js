// Yedekleme: yedek durumu, harici disk, geri yükleme, kurtarma kodu, Excel dökümü.
'use strict';

window.Screens.yedek = async function () {
  const { h, icon, btn, toast, field } = UI;
  const C = window.Calc;
  const [st, list, settings] = await Promise.all([UI.api('backupStatus'), UI.api('listBackups'), UI.api('getSettings')]);
  const run = (fn) => async () => { try { await fn(); } catch (e) { UI.showError(e); } };

  const extState = !st.external_dir
    ? h('div', { class: 'notice warn' }, icon('alert', 22), h('div', null, h('b', null, 'Harici yedek seçilmedi. '), 'Bilgisayar bozulur veya çalınırsa kayıtlar kaybolmasın diye bir USB bellek / harici disk takın ve aşağıdan seçin.'))
    : st.external_ready
      ? h('div', { class: 'notice info' }, icon('check', 22), h('div', null, h('b', null, 'Harici disk takılı. '), 'Her yedek hem bilgisayara hem de ', h('b', null, st.external_dir), ' konumuna yazılır.'))
      : h('div', { class: 'notice warn' }, icon('alert', 22), h('div', null, h('b', null, 'Harici disk takılı değil. '), 'Yedekler şimdilik sadece bilgisayara alınıyor. Diski takınca bir sonraki yedek oraya da yazılır.'));

  const pinInput = () => h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: 'PIN', autocomplete: 'off' });

  async function showCode() {
    const pin = pinInput();
    await UI.modal({
      title: 'Kurtarma kodunu göster',
      body: h('div', null, h('p', null, 'Güvenlik için PIN kodunuzu girin.'), field('PIN', pin)),
      actions: [
        { label: 'Vazgeç', value: null },
        { label: 'Yazdır', icon: 'print', onClick: async () => { await UI.api('printRecoveryCode', pin.value); return true; } },
        {
          label: 'Göster', kind: 'primary',
          onClick: async () => {
            const code = await UI.api('showRecoveryCode', pin.value);
            await UI.modal({ title: 'Kurtarma kodu', body: h('div', null, h('div', { class: 'code-box' }, code), h('p', { class: 'muted' }, 'Bu kodu kimseyle paylaşmayın.')), actions: [{ label: 'Kapat', kind: 'primary', value: true }] });
            return true;
          },
        },
      ],
    });
  }

  async function restore() {
    const res = await UI.api('restoreBackup');
    if (res.cancelled) return;
    let code = 'MEVCUT';
    if (res.needCode) {
      const input = h('input', { type: 'text', class: 'code-input', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX' });
      const ok = await UI.modal({ title: 'Kurtarma kodu gerekli', body: h('div', null, h('p', null, 'Bu yedek başka bir kurulumdan alınmış. O kurulumun kurtarma kodunu girin:'), input), actions: [{ label: 'Vazgeç', value: null }, { label: 'Devam', kind: 'primary', onClick: () => input.value }] });
      if (!ok) return;
      code = ok;
    }
    const sure = await UI.confirmBox({
      title: 'Yedek geri yüklensin mi?',
      message: 'Şu anki kayıtların yerine seçilen yedekteki kayıtlar gelecek. Güvenlik için önce şu anki kayıtların yedeği alınacak. Sonra yedekteki PIN ile tekrar giriş yapacaksınız.',
      okText: 'Geri yükle', danger: true,
    });
    if (!sure) return;
    await UI.api('restoreBackup', code);
    toast('Yedek geri yüklendi. Lütfen tekrar giriş yapın.');
    App.showLogin();
  }

  const rows = UI.table([
    { label: 'Tarih', render: (b) => C.formatDateTime(b.at) },
    { label: 'Yer', key: 'where' },
    { label: 'Tür', render: (b) => ({ '': 'Otomatik / elle', 'ilk-kurulum': 'İlk kurulum', 'geri-yukleme-oncesi': 'Geri yükleme öncesi' }[b.tag] || b.tag) },
    { label: 'Boyut', align: 'right', render: (b) => C.formatInt(Math.ceil(b.size / 1024)) + ' KB' },
    { label: '', render: (b) => h('div', { class: 'cell-actions' }, btn('Göster', { small: true, kind: 'ghost', icon: 'folder', onClick: run(() => UI.api('showInFolder', b.path)) })) },
  ], list.slice(0, 40), { compact: true, empty: 'Henüz yedek yok.' });

  return UI.page('Yedekleme', [btn('Şimdi yedekle', { kind: 'primary', big: true, icon: 'save', onClick: run(async () => {
    const r = await UI.api('backupNow');
    if (r.externalError) toast('Bilgisayara yedeklendi. ' + r.externalError, 'error', 8000);
    else toast(r.external ? 'Yedek bilgisayara ve harici diske alındı.' : 'Yedek bilgisayara alındı.');
    App.reload();
  }) })],
  extState,
  h('div', { class: 'cards' },
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Son yedek (bilgisayar)'), h('div', { class: 'v', style: { fontSize: '1.15rem' } }, st.last_local ? C.formatDateTime(st.last_local) : 'Yok')),
    h('div', { class: 'stat ' + (st.external_dir && st.external_ready ? '' : 'warn') }, h('div', { class: 'k' }, 'Son yedek (harici disk)'), h('div', { class: 'v', style: { fontSize: '1.15rem' } }, st.last_external ? C.formatDateTime(st.last_external) : 'Yok'))),
  h('div', { class: 'two-col' },
    h('div', null,
      h('div', { class: 'card' },
        h('h2', null, 'Harici yedek konumu'),
        h('p', { class: 'path' }, settings.backup_dir || 'Seçilmedi'),
        h('div', { class: 'page-actions', style: { marginTop: '10px' } },
          btn('USB / harici disk seç', { kind: 'primary', icon: 'folder', onClick: run(async () => {
            const dir = await UI.api('chooseFolder', 'Harici yedek için USB bellek veya harici diski seçin');
            if (!dir) return;
            await UI.api('saveSettings', { backup_dir: dir });
            await UI.api('backupNow');
            toast('Harici yedek konumu ayarlandı ve ilk yedek alındı.');
            App.reload();
          }) }),
          settings.backup_dir ? btn('Kaldır', { kind: 'ghost', onClick: run(async () => { await UI.api('saveSettings', { backup_dir: '' }); App.reload(); }) }) : null)),
      h('div', { class: 'card' },
        h('h2', null, 'Nasıl çalışır?'),
        h('ul', { class: 'hint-list' },
          h('li', null, 'Program her gün ilk girişte ve kapanırken kendiliğinden yedek alır.'),
          h('li', null, 'Yedekler şifrelidir; başka biri alsa bile açamaz.'),
          h('li', null, 'İki harici disk kullanın: biri dükkânda takılı kalsın, diğerini haftada bir güncelleyip evde saklayın.'),
          h('li', null, 'Bilgisayar değişirse yeni bilgisayarda "Yedekten geri yükle" ile kurtarma kodunu girerek devam edebilirsiniz.')))),
    h('div', null,
      h('div', { class: 'card' },
        h('h2', null, 'Geri yükle ve güvenlik'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
          btn('Yedekten geri yükle', { icon: 'history', onClick: run(restore) }),
          btn('Kurtarma kodunu göster / yazdır', { icon: 'lock', onClick: run(showCode) }),
          btn('Tüm kayıtları Excel\'e aktar', { icon: 'table', onClick: run(async () => UI.fileSaved('Excel dökümü kaydedildi', await UI.api('exportAllExcel'))) })),
        h('p', { class: 'muted', style: { fontSize: '.85rem', marginTop: '10px' } }, 'Excel dökümü şifresizdir; yıl sonu arşivi veya muhasebe için kullanın ve güvenli saklayın.')))),
  h('div', { class: 'section-title' }, h('h2', null, 'Yedekler')),
  rows);
};
