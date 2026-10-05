// Ortak hesaplama ve biçimlendirme fonksiyonları.
// Hem ana süreçte (require) hem de arayüzde (<script>) kullanılır.
// Para her yerde KURUŞ cinsinden tam sayı olarak tutulur (1 TL = 100).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function round(x) {
    return Math.round(Number(Number(x).toFixed(6)));
  }

  // "1.234,50" / "1234,5" / "1234.5" / "1.250" (=1250) gibi girişleri sayıya çevirir.
  function parseNumber(input) {
    if (input === null || input === undefined) return NaN;
    if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
    let s = String(input).trim().replace(/\s|TL|₺/gi, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function toKurus(tl) {
    return round(Number(tl) * 100);
  }

  function roundKg(kg) {
    return Math.round(Number(kg) * 100) / 100;
  }

  function groupDigits(intStr) {
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // 123450 -> "1.234,50"
  function formatMoney(kurus, withUnit) {
    if (kurus === null || kurus === undefined || Number.isNaN(Number(kurus))) return '';
    let k = Math.round(Number(kurus));
    const neg = k < 0;
    k = Math.abs(k);
    const s = groupDigits(String(Math.floor(k / 100))) + ',' + String(k % 100).padStart(2, '0');
    return (neg ? '-' : '') + s + (withUnit ? ' TL' : '');
  }

  // 1250.5 -> "1.250,5"
  function formatKg(kg) {
    if (kg === null || kg === undefined || kg === '' || Number.isNaN(Number(kg))) return '';
    const v = roundKg(kg);
    const neg = v < 0;
    const abs = Math.abs(v);
    const intPart = Math.floor(abs + 1e-9);
    const dec = Math.round((abs - intPart) * 100);
    let s = groupDigits(String(intPart));
    if (dec) s += ',' + String(dec).padStart(2, '0').replace(/0$/, '');
    return (neg ? '-' : '') + s;
  }

  function formatInt(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
    const v = Math.round(Number(n));
    return (v < 0 ? '-' : '') + groupDigits(String(Math.abs(v)));
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // Yerel saatle "YYYY-MM-DD HH:MM:SS"
  function nowLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function todayLocal() {
    return nowLocal().slice(0, 10);
  }

  function formatDate(s) {
    if (!s) return '';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return d + '.' + m + '.' + y;
  }

  function formatTime(s) {
    if (!s || String(s).length < 16) return '';
    return String(s).slice(11, 16);
  }

  function formatDateTime(s) {
    if (!s) return '';
    const t = formatTime(s);
    return formatDate(s) + (t ? ' ' + t : '');
  }

  // Türkçe harf farkı gözetmeyen arama için metni sadeleştirir.
  function normalizeSearch(s) {
    return String(s || '')
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matches(text, query) {
    const q = normalizeSearch(query);
    if (!q) return true;
    const t = normalizeSearch(text);
    return q.split(' ').every((part) => t.includes(part));
  }

  // Fiş hesaplaması.
  // items: [{ bags, kg, price }]  (price: kuruş / kg)
  // Tutar = KG × Fiyat
  // Komisyon = Toplam tutar × oran / 100
  // Hamallık = Toplam adet × hamallık ücreti  (bizim masrafımız, üreticiden kesilmez)
  // TOPLAM = Komisyon + Hamallık
  // Üreticiye borcumuz = Toplam tutar − Komisyon   (Elden ayrı borç olarak tutulur)
  function computeReceipt(input) {
    const rate = Number(input.commissionRate) || 0;
    const fee = Math.round(Number(input.porterFee) || 0);
    const items = (input.items || []).map((it) => {
      const bags = Math.round(Number(it.bags) || 0);
      const kg = roundKg(Number(it.kg) || 0);
      const price = Math.round(Number(it.price) || 0);
      return Object.assign({}, it, { bags, kg, price, amount: round(kg * price) });
    });
    const totalAmount = items.reduce((s, it) => s + it.amount, 0);
    const totalBags = items.reduce((s, it) => s + it.bags, 0);
    const totalKg = roundKg(items.reduce((s, it) => s + it.kg, 0));
    const commission = round((totalAmount * rate) / 100);
    const porterage = totalBags * fee;
    const cashAdvance = Math.max(0, Math.round(Number(input.cashAdvance) || 0));
    return {
      items,
      totalAmount,
      totalBags,
      totalKg,
      commissionRate: rate,
      porterFee: fee,
      commission,
      porterage,
      cashAdvance,
      feeTotal: commission + porterage,
      payable: totalAmount - commission,
    };
  }

  function paymentStatus(payable, paid, cancelled) {
    if (cancelled) return 'iptal';
    if (paid <= 0 && payable > 0) return 'odenmedi';
    if (paid >= payable) return 'odendi';
    return 'kismen';
  }

  const STATUS_LABEL = {
    odenmedi: 'Ödenmedi',
    kismen: 'Kısmen ödendi',
    odendi: 'Ödendi',
    iptal: 'İptal edildi',
  };

  const STATUS_PRINT = {
    odenmedi: 'ÖDENMEDİ',
    kismen: 'KISMEN ÖDENDİ',
    odendi: 'ÖDENDİ',
    iptal: 'İPTAL EDİLDİ',
  };

  // Gün farkı (fiyat güncelliği uyarısı için)
  function daysSince(s, now) {
    if (!s) return Infinity;
    const a = new Date(String(s).slice(0, 10) + 'T00:00:00');
    const b = new Date((now || todayLocal()) + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  // Müşteri hesabı hareket türleri. sign: +1 müşteri bize borçlanır, -1 borcu azalır / biz borçlanırız.
  // manual: kullanıcının elle girebildiği türler.
  const ENTRY_TYPES = {
    acilis_alacak: { sign: 1, manual: true, label: 'Açılış: müşteri bize borçlu', short: 'Açılış (bize borçlu)' },
    acilis_borc: { sign: -1, manual: true, label: 'Açılış: biz müşteriye borçluyuz', short: 'Açılış (biz borçluyuz)' },
    borc_ekle: { sign: 1, manual: true, label: 'Müşteriye borç verdik (fiş dışı)', short: 'Borç verildi' },
    tahsilat: { sign: -1, manual: true, label: 'Müşteri borcunu ödedi (tahsilat)', short: 'Tahsilat' },
    odeme_yaptik: { sign: 1, manual: true, label: 'Müşteriye ödeme yaptık (fiş dışı)', short: 'Fiş dışı ödeme' },
    elden: { sign: 1, manual: false, label: 'Elden (fişten)', short: 'Elden' },
    mahsup: { sign: -1, manual: false, label: 'Borçtan düşüldü (fiş ödemesi)', short: 'Mahsup' },
  };

  return {
    ENTRY_TYPES,
    parseNumber, toKurus, roundKg, formatMoney, formatKg, formatInt,
    nowLocal, todayLocal, formatDate, formatTime, formatDateTime,
    normalizeSearch, matches, computeReceipt, paymentStatus,
    STATUS_LABEL, STATUS_PRINT, daysSince,
  };
});
