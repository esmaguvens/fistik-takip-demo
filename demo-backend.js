// WEB DEMOSU — tarayıcıda çalışan arka uç.
// Gerçek programda bu işleri Electron ana süreci yapar (src/main/main.js). Demoda aynı iş kuralları
// (src/main/service.js) tarayıcıda çalışır; veriler ziyaretçinin kendi tarayıcısında (localStorage) tutulur.
// Dosya kaydetme, yedekleme ve şifreleme gibi bilgisayara özgü işler demoda taklit edilir.
// Bu dosya scripts/build-demo.js tarafından db.js ve service.js ile birleştirilir (aşağıdaki MODULES yer tutucusuna eklenir).
(function () {
  'use strict';

  // ---------- Node'un crypto / Buffer / path karşılıkları ----------
  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => Uint8Array.from(h.match(/.{2}/g) || [], (x) => parseInt(x, 16));
  function bytes(u8) {
    u8.toString = function (enc) { return enc === 'hex' ? toHex(this) : Array.from(this).join(','); };
    return u8;
  }

  // SHA-256 (eşzamanlı). Sabitler asal sayıların kök kesirlerinden üretilir.
  const sha256 = (() => {
    const primes = [];
    for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) >>> 0;
    const K = primes.map((p) => frac(Math.cbrt(p)));
    const H0 = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    return (msg) => {
      const len = msg.length;
      const total = ((len + 9 + 63) >> 6) << 6;
      const m = new Uint8Array(total);
      m.set(msg);
      m[len] = 0x80;
      const dv = new DataView(m.buffer);
      dv.setUint32(total - 8, Math.floor((len * 8) / 4294967296));
      dv.setUint32(total - 4, (len * 8) >>> 0);
      const h = H0.slice();
      const w = new Uint32Array(64);
      for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          const ch = (e & f) ^ (~e & g);
          const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
          const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const t2 = (S0 + maj) >>> 0;
          hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) >>> 0; });
      }
      const out = new Uint8Array(32);
      const odv = new DataView(out.buffer);
      h.forEach((v, i) => odv.setUint32(i * 4, v));
      return out;
    };
  })();

  const utf8 = (s) => new TextEncoder().encode(String(s));
  const cryptoShim = {
    randomBytes: (n) => bytes(window.crypto.getRandomValues(new Uint8Array(n))),
    createHash: () => {
      const parts = [];
      const api = {
        update: (s) => { parts.push(typeof s === 'string' ? utf8(s) : s); return api; },
        digest: (enc) => {
          const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
          let o = 0;
          for (const p of parts) { all.set(p, o); o += p.length; }
          const d = bytes(sha256(all));
          return enc === 'hex' ? toHex(d) : d;
        },
      };
      return api;
    },
    // Demo: gerçek programdaki scrypt yerine basit özet (demoda korunacak gerçek veri yok)
    scryptSync: (pin, salt) => bytes(sha256(utf8(String(pin) + ':' + toHex(salt)))),
    timingSafeEqual: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
  };
  window.Buffer = window.Buffer || {
    from: (x, enc) => (enc === 'hex' ? bytes(fromHex(x)) : bytes(x instanceof Uint8Array ? x : new Uint8Array(x))),
  };
  const pathShim = { dirname: () => 'vendor', join: (a, b) => a + '/' + b };

  const __mods = {};
  function __require(name) {
    if (name === 'crypto') return cryptoShim;
    if (name === 'path') return pathShim;
    if (name === 'sql.js') return window.initSqlJs;
    if (name.endsWith('shared/calc')) return window.Calc;
    throw new Error('Demo: modül yok: ' + name);
  }
  __require.resolve = () => 'vendor/sql-wasm.js';

  __mods["db"] = (function () { const module = { exports: {} }; (function (module, exports, require) {
// SQLite (sql.js / WebAssembly) veritabanı ve şema.
// sql.js derleme gerektirmez; veritabanı bellekte tutulur ve her değişiklikte
// şifreli dosyaya yazılır (bkz. vault.js).
'use strict';

const path = require('path');
const initSqlJs = require('sql.js');

let SQL = null;

async function loadSql() {
  if (!SQL) {
    const dist = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
    SQL = await initSqlJs({ locateFile: (f) => path.join(dist, f) });
  }
  return SQL;
}

const SCHEMA_VERSION = 1;

const MIGRATIONS = {
  1: `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,          -- kuruş / kg
    price_updated_at TEXT,
    stock INTEGER NOT NULL DEFAULT 0,          -- çuval
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    old_price INTEGER,
    new_price INTEGER NOT NULL,
    at TEXT NOT NULL
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,      -- fiş numarası: 1, 2, 3 ...
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,               -- fiş anındaki ad soyad
    customer_address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT,
    commission_rate REAL NOT NULL,
    porter_fee INTEGER NOT NULL,
    total_bags INTEGER NOT NULL,
    total_kg REAL NOT NULL,
    total_amount INTEGER NOT NULL,
    commission INTEGER NOT NULL,
    porterage INTEGER NOT NULL,
    cash_advance INTEGER NOT NULL DEFAULT 0,
    fee_total INTEGER NOT NULL,
    payable INTEGER NOT NULL,                  -- üreticiye borcumuz = tutar - komisyon
    cancelled_at TEXT,
    cancel_reason TEXT
  );

  CREATE TABLE receipt_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    line_no INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    bags INTEGER NOT NULL,
    kg REAL NOT NULL,
    price INTEGER NOT NULL,
    amount INTEGER NOT NULL
  );
  CREATE INDEX ix_items_receipt ON receipt_items(receipt_id);

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    method TEXT NOT NULL,                      -- 'nakit' | 'mahsup'
    paid_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    delete_reason TEXT
  );
  CREATE INDEX ix_payments_receipt ON payments(receipt_id);

  -- Müşteri hesabı. amount > 0: müşteri bize borçlanır; amount < 0: müşterinin borcu azalır / biz borçlanırız.
  CREATE TABLE account_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    receipt_id INTEGER,
    payment_id INTEGER,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    delete_reason TEXT
  );
  CREATE INDEX ix_entries_customer ON account_entries(customer_id);

  CREATE TABLE stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    change INTEGER NOT NULL,
    stock_after INTEGER NOT NULL,
    type TEXT NOT NULL,                        -- 'fis' | 'fis_duzeltme' | 'fis_iptal' | 'elle' | 'acilis'
    receipt_id INTEGER,
    note TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL
  );
  CREATE INDEX ix_stock_product ON stock_movements(product_id);

  -- Kayıt geçmişi: silinemez; her satır bir öncekinin özetini (hash) taşır, değiştirilirse fark edilir.
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    summary TEXT NOT NULL,
    old_json TEXT,
    new_json TEXT,
    reason TEXT,
    hash TEXT NOT NULL
  );
  `,
};

async function openDatabase(bytes) {
  const S = await loadSql();
  const db = bytes ? new S.Database(new Uint8Array(bytes)) : new S.Database();
  db.run('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function currentVersion(db) {
  const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'");
  if (!r.length) return 0;
  const v = db.exec("SELECT value FROM settings WHERE key='schema_version'");
  return v.length ? Number(v[0].values[0][0]) : 0;
}

function migrate(db) {
  let v = currentVersion(db);
  while (v < SCHEMA_VERSION) {
    v += 1;
    db.run('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.run("INSERT OR REPLACE INTO settings(key, value) VALUES ('schema_version', ?)", [String(v)]);
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
}

module.exports = { openDatabase, loadSql, SCHEMA_VERSION };

})(module, module.exports, __require); return module.exports; })();
__mods["service"] = (function () { const module = { exports: {} }; (function (module, exports, require) {
// İş kuralları. Arayüzden gelen tüm işlemler buradan geçer.
// Her değişiklik tek bir işlem (transaction) içinde yapılır, ardından diske yazılır
// ve kayıt geçmişine (audit_log) eklenir.
'use strict';

const crypto = require('crypto');
const Calc = require('../shared/calc');

const DEFAULT_SETTINGS = {
  company_name: 'COŞKUN BAHAR TİCARET',
  commission_rate: '2',
  porter_fee: '2000', // kuruş: 20,00 TL
  price_warn_days: '1',
  auto_lock_minutes: '15',
  docs_dir: '',
  backup_dir: '',
};
const PUBLIC_SETTINGS = Object.keys(DEFAULT_SETTINGS);

function fail(message, code) {
  const e = new Error(message);
  if (code) e.code = code;
  return e;
}

function need(cond, message) {
  if (!cond) throw fail(message);
}

function cleanText(s, max) {
  return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

function fullName(c) {
  return cleanText((c.first_name || '') + ' ' + (c.last_name || ''));
}

function byName(a, b) {
  return String(a.name).localeCompare(String(b.name), 'tr');
}

class Service {
  constructor(db, persist) {
    this.db = db;
    this.persist = persist || (() => {});
    this.ensureDefaults();
  }

  // ---------- temel yardımcılar ----------
  all(sql, params) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params || []);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally {
      st.free();
    }
  }

  get(sql, params) {
    return this.all(sql, params)[0] || null;
  }

  run(sql, params) {
    this.db.run(sql, params || []);
    return this.db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  }

  tx(fn) {
    this.db.run('BEGIN');
    let result;
    try {
      result = fn();
      this.db.run('COMMIT');
    } catch (e) {
      try { this.db.run('ROLLBACK'); } catch (_) { /* yoksay */ }
      throw e;
    }
    this.persist();
    return result;
  }

  now() {
    return Calc.nowLocal();
  }

  audit(action, entity, entityId, summary, oldObj, newObj, reason) {
    const at = this.now();
    const prev = this.get('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
    const oldJson = oldObj === undefined || oldObj === null ? null : JSON.stringify(oldObj);
    const newJson = newObj === undefined || newObj === null ? null : JSON.stringify(newObj);
    const hash = auditHash(prev ? prev.hash : '', [at, action, entity, entityId, summary, oldJson, newJson, reason || '']);
    this.run('INSERT INTO audit_log(at, action, entity, entity_id, summary, old_json, new_json, reason, hash) VALUES (?,?,?,?,?,?,?,?,?)',
      [at, action, entity, entityId === undefined ? null : entityId, summary, oldJson, newJson, reason || null, hash]);
  }

  // ---------- ayarlar ----------
  ensureDefaults() {
    let changed = false;
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (!this.get('SELECT 1 AS x FROM settings WHERE key=?', [k])) {
        this.db.run('INSERT INTO settings(key, value) VALUES (?, ?)', [k, v]);
        changed = true;
      }
    }
    return changed;
  }

  getSetting(key) {
    const r = this.get('SELECT value FROM settings WHERE key=?', [key]);
    return r ? r.value : null;
  }

  setSettingRaw(key, value) {
    this.db.run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', [key, value === null ? null : String(value)]);
  }

  getSettings() {
    const out = {};
    for (const k of PUBLIC_SETTINGS) out[k] = this.getSetting(k);
    return {
      company_name: out.company_name,
      commission_rate: Number(out.commission_rate),
      porter_fee: Number(out.porter_fee),
      price_warn_days: Number(out.price_warn_days),
      auto_lock_minutes: Number(out.auto_lock_minutes),
      docs_dir: out.docs_dir || '',
      backup_dir: out.backup_dir || '',
    };
  }

  saveSettings(input) {
    const old = this.getSettings();
    const next = Object.assign({}, old);
    if (input.company_name !== undefined) {
      next.company_name = cleanText(input.company_name, 80);
      need(next.company_name, 'Firma adı boş olamaz.');
    }
    if (input.commission_rate !== undefined) {
      const v = Number(input.commission_rate);
      need(Number.isFinite(v) && v >= 0 && v <= 50, 'Komisyon oranı 0 ile 50 arasında olmalı.');
      next.commission_rate = Math.round(v * 100) / 100;
    }
    if (input.porter_fee !== undefined) {
      const v = Math.round(Number(input.porter_fee));
      need(Number.isFinite(v) && v >= 0, 'Hamallık ücreti geçersiz.');
      next.porter_fee = v;
    }
    if (input.price_warn_days !== undefined) {
      const v = Math.round(Number(input.price_warn_days));
      need(v >= 1 && v <= 60, 'Fiyat uyarı süresi 1 ile 60 gün arasında olmalı.');
      next.price_warn_days = v;
    }
    if (input.auto_lock_minutes !== undefined) {
      const v = Math.round(Number(input.auto_lock_minutes));
      need(v >= 0 && v <= 240, 'Otomatik kilit süresi 0 ile 240 dakika arasında olmalı.');
      next.auto_lock_minutes = v;
    }
    if (input.docs_dir !== undefined) next.docs_dir = String(input.docs_dir || '');
    if (input.backup_dir !== undefined) next.backup_dir = String(input.backup_dir || '');

    const changed = PUBLIC_SETTINGS.filter((k) => String(old[k]) !== String(next[k]));
    if (!changed.length) return next;
    return this.tx(() => {
      for (const k of changed) this.setSettingRaw(k, next[k]);
      const o = {}; const n = {};
      for (const k of changed) { o[k] = old[k]; n[k] = next[k]; }
      this.audit('ayar_degisti', 'ayar', null, 'Ayarlar değiştirildi: ' + changed.join(', '), o, n);
      return next;
    });
  }

  // ---------- PIN / kurtarma kodu (şifreli veritabanının içinde saklanır) ----------
  setPin(pin, isFirst) {
    need(/^\d{4,6}$/.test(String(pin)), 'PIN 4 ile 6 rakam arasında olmalı.');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(pin), salt, 32);
    return this.tx(() => {
      this.setSettingRaw('pin_salt', salt.toString('hex'));
      this.setSettingRaw('pin_hash', hash.toString('hex'));
      this.audit(isFirst ? 'kurulum' : 'pin_degisti', 'guvenlik', null, isFirst ? 'Program kuruldu, PIN belirlendi' : 'PIN değiştirildi');
    });
  }

  hasPin() {
    return !!this.getSetting('pin_hash');
  }

  checkPin(pin) {
    const salt = this.getSetting('pin_salt');
    const hash = this.getSetting('pin_hash');
    if (!salt || !hash) return false;
    const test = crypto.scryptSync(String(pin || ''), Buffer.from(salt, 'hex'), 32);
    return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
  }

  setRecoveryCode(code) {
    this.tx(() => this.setSettingRaw('recovery_code', code));
  }

  getRecoveryCode() {
    return this.getSetting('recovery_code');
  }

  // ---------- ürünler ----------
  listProducts(opts) {
    opts = opts || {};
    const rows = this.all('SELECT * FROM products' + (opts.includeDeleted ? '' : ' WHERE deleted_at IS NULL'));
    const warnDays = Number(this.getSetting('price_warn_days')) || 1;
    const today = Calc.todayLocal();
    return rows
      .filter((p) => Calc.matches(p.name, opts.q))
      .map((p) => Object.assign(p, { price_age_days: Calc.daysSince(p.price_updated_at, today), price_stale: Calc.daysSince(p.price_updated_at, today) >= warnDays }))
      .sort(byName);
  }

  getProduct(id) {
    const p = this.get('SELECT * FROM products WHERE id=?', [id]);
    need(p, 'Ürün bulunamadı.');
    return p;
  }

  assertUniqueProductName(name, exceptId) {
    const n = Calc.normalizeSearch(name);
    const clash = this.all('SELECT id, name FROM products WHERE deleted_at IS NULL')
      .find((p) => p.id !== exceptId && Calc.normalizeSearch(p.name) === n);
    need(!clash, `"${name}" adında bir ürün zaten var.`);
  }

  addProduct(input) {
    const name = cleanText(input.name, 60);
    need(name, 'Ürün adı yazın.');
    const price = Math.round(Number(input.price));
    need(Number.isFinite(price) && price > 0, 'Fiyat 0\'dan büyük olmalı.');
    const stock = Math.round(Number(input.stock) || 0);
    need(stock >= 0, 'Stok eksi olamaz.');
    this.assertUniqueProductName(name);
    return this.tx(() => {
      const at = this.now();
      const id = this.run('INSERT INTO products(name, price, price_updated_at, stock, created_at) VALUES (?,?,?,?,?)', [name, price, at, stock, at]);
      this.run('INSERT INTO price_history(product_id, old_price, new_price, at) VALUES (?,?,?,?)', [id, null, price, at]);
      if (stock) this.run('INSERT INTO stock_movements(product_id, change, stock_after, type, note, at) VALUES (?,?,?,?,?,?)', [id, stock, stock, 'acilis', 'Başlangıç stoğu', at]);
      this.audit('urun_eklendi', 'urun', id, `Ürün eklendi: ${name} (${Calc.formatMoney(price, true)}/kg, stok ${stock} çuval)`, null, { name, price, stock });
      return id;
    });
  }

  renameProduct(id, newName) {
    const p = this.getProduct(id);
    const name = cleanText(newName, 60);
    need(name, 'Ürün adı yazın.');
    if (name === p.name) return id;
    this.assertUniqueProductName(name, id);
    return this.tx(() => {
      this.run('UPDATE products SET name=? WHERE id=?', [name, id]);
      this.audit('urun_adi_degisti', 'urun', id, `Ürün adı değişti: ${p.name} → ${name}`, { name: p.name }, { name });
      return id;
    });
  }

  updatePrice(id, newPrice) {
    const p = this.getProduct(id);
    need(!p.deleted_at, 'Silinmiş ürünün fiyatı değiştirilemez.');
    const price = Math.round(Number(newPrice));
    need(Number.isFinite(price) && price > 0, 'Fiyat 0\'dan büyük olmalı.');
    return this.tx(() => {
      const at = this.now();
      this.run('UPDATE products SET price=?, price_updated_at=? WHERE id=?', [price, at, id]);
      this.run('INSERT INTO price_history(product_id, old_price, new_price, at) VALUES (?,?,?,?)', [id, p.price, price, at]);
      const same = price === p.price;
      this.audit('fiyat_guncellendi', 'urun', id,
        same ? `${p.name} fiyatı onaylandı: ${Calc.formatMoney(price, true)}/kg`
          : `${p.name} fiyatı: ${Calc.formatMoney(p.price, true)} → ${Calc.formatMoney(price, true)}/kg`,
        { price: p.price }, { price });
      return id;
    });
  }

  priceHistory(id) {
    return this.all('SELECT * FROM price_history WHERE product_id=? ORDER BY id DESC LIMIT 100', [id]);
  }

  adjustStock(id, input) {
    const p = this.getProduct(id);
    need(!p.deleted_at, 'Silinmiş ürünün stoğu değiştirilemez.');
    const newStock = Math.round(Number(input.newStock));
    need(Number.isFinite(newStock), 'Yeni stok miktarını yazın.');
    const reason = cleanText(input.reason, 200);
    need(reason, 'Stok değişikliği için bir açıklama yazın.');
    const change = newStock - p.stock;
    if (!change) return id;
    return this.tx(() => {
      this.run('UPDATE products SET stock=? WHERE id=?', [newStock, id]);
      this.run('INSERT INTO stock_movements(product_id, change, stock_after, type, note, at) VALUES (?,?,?,?,?,?)', [id, change, newStock, 'elle', reason, this.now()]);
      this.audit('stok_duzeltildi', 'urun', id, `${p.name} stoğu elle değişti: ${p.stock} → ${newStock} çuval`, { stock: p.stock }, { stock: newStock }, reason);
      return id;
    });
  }

  deleteProduct(id, reason) {
    const p = this.getProduct(id);
    need(!p.deleted_at, 'Ürün zaten silinmiş.');
    return this.tx(() => {
      this.run('UPDATE products SET deleted_at=? WHERE id=?', [this.now(), id]);
      this.audit('urun_silindi', 'urun', id, `Ürün silindi: ${p.name} (stok ${p.stock} çuval)`, p, null, cleanText(reason));
      return id;
    });
  }

  // ---------- müşteriler ----------
  customerBalances() {
    const ours = this.all(`SELECT r.customer_id AS cid, SUM(r.payable - COALESCE(p.paid, 0)) AS v
      FROM receipts r LEFT JOIN (SELECT receipt_id, SUM(amount) AS paid FROM payments WHERE deleted_at IS NULL GROUP BY receipt_id) p
      ON p.receipt_id = r.id WHERE r.cancelled_at IS NULL GROUP BY r.customer_id`);
    const theirs = this.all('SELECT customer_id AS cid, SUM(amount) AS v FROM account_entries WHERE deleted_at IS NULL GROUP BY customer_id');
    const last = this.all('SELECT customer_id AS cid, MAX(created_at) AS v FROM receipts WHERE cancelled_at IS NULL GROUP BY customer_id');
    const map = {};
    const slot = (cid) => (map[cid] = map[cid] || { unpaid_receipts: 0, account: 0, last_receipt_at: null });
    for (const r of ours) slot(r.cid).unpaid_receipts = r.v || 0;
    for (const r of theirs) slot(r.cid).account = r.v || 0;
    for (const r of last) slot(r.cid).last_receipt_at = r.v;
    return map;
  }

  withBalance(c, b) {
    b = b || { unpaid_receipts: 0, account: 0, last_receipt_at: null };
    // net > 0: müşteri bize borçlu, net < 0: biz müşteriye borçluyuz
    return Object.assign(c, {
      full_name: fullName(c),
      we_owe: b.unpaid_receipts,
      account: b.account,
      net: b.account - b.unpaid_receipts,
      last_receipt_at: b.last_receipt_at,
    });
  }

  listCustomers(opts) {
    opts = opts || {};
    const balances = this.customerBalances();
    return this.all('SELECT * FROM customers' + (opts.includeDeleted ? '' : ' WHERE deleted_at IS NULL'))
      .filter((c) => Calc.matches(fullName(c) + ' ' + c.phone + ' ' + c.address, opts.q))
      .map((c) => this.withBalance(c, balances[c.id]))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'));
  }

  getCustomerRow(id) {
    const c = this.get('SELECT * FROM customers WHERE id=?', [id]);
    need(c, 'Müşteri bulunamadı.');
    return c;
  }

  getCustomer(id) {
    const c = this.withBalance(this.getCustomerRow(id), this.customerBalances()[id]);
    c.receipts = this.listReceipts({ customerId: id, limit: 1000 });
    c.entries = this.all('SELECT * FROM account_entries WHERE customer_id=? ORDER BY at DESC, id DESC', [id])
      .map((e) => Object.assign(e, { label: (Calc.ENTRY_TYPES[e.type] || {}).label || e.type }));
    return c;
  }

  normalizeCustomerInput(input) {
    const out = {
      first_name: cleanText(input.first_name, 60),
      last_name: cleanText(input.last_name, 60),
      phone: cleanText(input.phone, 30),
      address: cleanText(input.address, 120),
      note: cleanText(input.note, 300),
    };
    need(out.first_name, 'Müşterinin adını yazın.');
    return out;
  }

  findSameName(c, exceptId) {
    const n = Calc.normalizeSearch(fullName(c));
    return this.all('SELECT * FROM customers WHERE deleted_at IS NULL')
      .filter((x) => x.id !== exceptId && Calc.normalizeSearch(fullName(x)) === n);
  }

  addCustomer(input) {
    const c = this.normalizeCustomerInput(input);
    if (!input.force) {
      const same = this.findSameName(c);
      if (same.length) {
        throw fail(`"${fullName(c)}" adında bir müşteri zaten kayıtlı` +
          (same[0].address ? ` (${same[0].address})` : '') + '. Yine de eklensin mi?', 'AYNI_ISIM');
      }
    }
    return this.tx(() => {
      const id = this.run('INSERT INTO customers(first_name, last_name, phone, address, note, created_at) VALUES (?,?,?,?,?,?)',
        [c.first_name, c.last_name, c.phone, c.address, c.note, this.now()]);
      this.audit('musteri_eklendi', 'musteri', id, `Müşteri eklendi: ${fullName(c)}`, null, c);
      return id;
    });
  }

  updateCustomer(id, input) {
    const old = this.getCustomerRow(id);
    const c = this.normalizeCustomerInput(input);
    if (!input.force && Calc.normalizeSearch(fullName(c)) !== Calc.normalizeSearch(fullName(old))) {
      const same = this.findSameName(c, id);
      if (same.length) throw fail(`"${fullName(c)}" adında başka bir müşteri var. Yine de kaydedilsin mi?`, 'AYNI_ISIM');
    }
    return this.tx(() => {
      this.run('UPDATE customers SET first_name=?, last_name=?, phone=?, address=?, note=? WHERE id=?',
        [c.first_name, c.last_name, c.phone, c.address, c.note, id]);
      const o = {}; const n = {};
      for (const k of Object.keys(c)) if (old[k] !== c[k]) { o[k] = old[k]; n[k] = c[k]; }
      this.audit('musteri_duzenlendi', 'musteri', id, `Müşteri bilgisi değişti: ${fullName(c)}`, o, n);
      return id;
    });
  }

  deleteCustomer(id, reason) {
    const c = this.getCustomer(id);
    need(!c.deleted_at, 'Müşteri zaten silinmiş.');
    need(c.we_owe === 0 && c.account === 0,
      'Bu müşterinin açık hesabı var (ödenmemiş fiş veya borç). Hesap kapanmadan silinemez.');
    return this.tx(() => {
      this.run('UPDATE customers SET deleted_at=? WHERE id=?', [this.now(), id]);
      this.audit('musteri_silindi', 'musteri', id, `Müşteri silindi: ${c.full_name}`, { first_name: c.first_name, last_name: c.last_name }, null, cleanText(reason));
      return id;
    });
  }

  addAccountEntry(customerId, input) {
    const c = this.getCustomerRow(customerId);
    need(!c.deleted_at, 'Silinmiş müşteriye işlem yapılamaz.');
    const t = Calc.ENTRY_TYPES[input.type];
    need(t && t.manual, 'İşlem türünü seçin.');
    const amount = Math.round(Number(input.amount));
    need(Number.isFinite(amount) && amount > 0, 'Tutar 0\'dan büyük olmalı.');
    const note = cleanText(input.note, 300);
    const at = input.date ? String(input.date).slice(0, 10) + ' 00:00:00' : this.now();
    if (input.date) need(/^\d{4}-\d{2}-\d{2}$/.test(String(input.date).slice(0, 10)), 'Tarih geçersiz.');
    return this.tx(() => {
      const id = this.run('INSERT INTO account_entries(customer_id, type, amount, at, note, created_at) VALUES (?,?,?,?,?,?)',
        [customerId, input.type, t.sign * amount, at, note, this.now()]);
      this.audit('hesap_hareketi_eklendi', 'musteri', customerId,
        `${fullName(c)}: ${t.label} — ${Calc.formatMoney(amount, true)}`, null, { type: input.type, amount, at, note });
      return id;
    });
  }

  deleteAccountEntry(entryId, reason) {
    const e = this.get('SELECT * FROM account_entries WHERE id=?', [entryId]);
    need(e && !e.deleted_at, 'Hareket bulunamadı.');
    const t = Calc.ENTRY_TYPES[e.type] || {};
    need(t.manual, e.type === 'elden'
      ? 'Elden kaydı fişe bağlıdır. Değiştirmek için fişi düzeltin.'
      : 'Bu kayıt bir fiş ödemesine bağlıdır. Silmek için fişteki ödemeyi silin.');
    reason = cleanText(reason, 200);
    need(reason, 'Silme nedeni yazın.');
    const c = this.getCustomerRow(e.customer_id);
    return this.tx(() => {
      this.run('UPDATE account_entries SET deleted_at=?, delete_reason=? WHERE id=?', [this.now(), reason, entryId]);
      this.audit('hesap_hareketi_silindi', 'musteri', e.customer_id,
        `${fullName(c)}: "${t.label}" kaydı silindi — ${Calc.formatMoney(Math.abs(e.amount), true)}`, e, null, reason);
      return entryId;
    });
  }

  // ---------- fişler ----------
  paidMap(ids) {
    const map = {};
    if (!ids.length) return map;
    const rows = this.all(`SELECT receipt_id, SUM(amount) AS paid FROM payments WHERE deleted_at IS NULL AND receipt_id IN (${ids.map(() => '?').join(',')}) GROUP BY receipt_id`, ids);
    for (const r of rows) map[r.receipt_id] = r.paid;
    return map;
  }

  decorateReceipt(r, paid) {
    r.paid = paid || 0;
    r.remaining = r.cancelled_at ? 0 : r.payable - r.paid;
    r.status = Calc.paymentStatus(r.payable, r.paid, !!r.cancelled_at);
    return r;
  }

  listReceipts(opts) {
    opts = opts || {};
    const where = [];
    const params = [];
    if (opts.customerId) { where.push('customer_id=?'); params.push(opts.customerId); }
    if (opts.from) { where.push('created_at >= ?'); params.push(opts.from + ' 00:00:00'); }
    if (opts.to) { where.push('created_at <= ?'); params.push(opts.to + ' 23:59:59'); }
    let rows = this.all('SELECT * FROM receipts' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC', params);
    if (opts.q) {
      const q = String(opts.q).trim();
      rows = rows.filter((r) => String(r.id) === q.replace(/^#/, '') || Calc.matches(r.customer_name, q));
    }
    const paid = this.paidMap(rows.map((r) => r.id));
    rows = rows.map((r) => this.decorateReceipt(r, paid[r.id]));
    if (opts.status && opts.status !== 'hepsi') {
      rows = opts.status === 'acik'
        ? rows.filter((r) => r.status === 'odenmedi' || r.status === 'kismen')
        : rows.filter((r) => r.status === opts.status);
    }
    return rows.slice(0, opts.limit || 500);
  }

  getReceipt(id) {
    const r = this.get('SELECT * FROM receipts WHERE id=?', [id]);
    need(r, `${id} numaralı fiş bulunamadı.`);
    r.items = this.all('SELECT * FROM receipt_items WHERE receipt_id=? ORDER BY line_no', [id]);
    r.payments = this.all('SELECT * FROM payments WHERE receipt_id=? ORDER BY paid_at, id', [id]);
    this.decorateReceipt(r, r.payments.filter((p) => !p.deleted_at).reduce((s, p) => s + p.amount, 0));
    const c = this.get('SELECT * FROM customers WHERE id=?', [r.customer_id]);
    const bal = this.customerBalances()[r.customer_id] || { account: 0 };
    r.customer = c ? { id: c.id, full_name: fullName(c), phone: c.phone, address: c.address, deleted: !!c.deleted_at } : null;
    r.customer_account = bal.account; // müşterinin bize olan borcu (mahsup için)
    return r;
  }

  // items: [{ product_id, bags, kg, orig_price? }]
  buildReceipt(input, original) {
    const customer = this.getCustomerRow(Number(input.customer_id));
    if (!original || original.customer_id !== customer.id) need(!customer.deleted_at, 'Bu müşteri silinmiş.');
    need(input.priceConfirmed === true, 'Kaydetmeden önce fiyatların güncel olduğunu onaylayın.');
    const raw = (input.items || []).filter((it) => it && (it.product_id || it.bags || it.kg));
    need(raw.length > 0, 'Fişe en az bir ürün satırı girin.');
    need(raw.length <= 50, 'Bir fişe en fazla 50 satır girilebilir.');
    const origPrices = {};
    if (original) for (const it of original.items) (origPrices[it.product_id] = origPrices[it.product_id] || []).push(it.price);
    const items = raw.map((it, i) => {
      const row = i + 1;
      need(it.product_id, `${row}. satırda ürün (cinsi) seçin.`);
      const p = this.getProduct(Number(it.product_id));
      const bags = Number(it.bags);
      const kg = Number(it.kg);
      need(Number.isInteger(bags) && bags > 0, `${row}. satırda adet (çuval) tam sayı ve 0'dan büyük olmalı.`);
      need(Number.isFinite(kg) && kg > 0, `${row}. satırda KG 0'dan büyük olmalı.`);
      let price = p.price;
      if (original && it.orig_price !== undefined && it.orig_price !== null) {
        need((origPrices[p.id] || []).includes(Number(it.orig_price)), `${row}. satırın fiyatı geçersiz.`);
        price = Number(it.orig_price);
      } else {
        need(!p.deleted_at, `${row}. satırdaki ürün (${p.name}) silinmiş.`);
      }
      return { product_id: p.id, product_name: p.name, bags, kg: Calc.roundKg(kg), price };
    });
    const cash = Math.round(Number(input.cash_advance) || 0);
    need(cash >= 0, 'Elden tutarı eksi olamaz.');
    const rate = original ? original.commission_rate : Number(this.getSetting('commission_rate'));
    const fee = original ? original.porter_fee : Number(this.getSetting('porter_fee'));
    const calc = Calc.computeReceipt({ items, commissionRate: rate, porterFee: fee, cashAdvance: cash });
    return { customer, calc };
  }

  applyStock(receiptId, deltas, type, note) {
    const at = this.now();
    for (const [pid, change] of Object.entries(deltas)) {
      if (!change) continue;
      const p = this.getProduct(Number(pid));
      const after = p.stock + change;
      this.run('UPDATE products SET stock=? WHERE id=?', [after, p.id]);
      this.run('INSERT INTO stock_movements(product_id, change, stock_after, type, receipt_id, note, at) VALUES (?,?,?,?,?,?,?)',
        [p.id, change, after, type, receiptId, note, at]);
    }
  }

  static bagsByProduct(items, sign) {
    const d = {};
    for (const it of items) d[it.product_id] = (d[it.product_id] || 0) + sign * it.bags;
    return d;
  }

  insertItems(receiptId, items) {
    items.forEach((it, i) => {
      this.run('INSERT INTO receipt_items(receipt_id, line_no, product_id, product_name, bags, kg, price, amount) VALUES (?,?,?,?,?,?,?,?)',
        [receiptId, i + 1, it.product_id, it.product_name, it.bags, it.kg, it.price, it.amount]);
    });
  }

  // payment: { mode: 'odenmedi' | 'odendi' | 'kismen', amount }
  createReceipt(input) {
    const { customer, calc } = this.buildReceipt(input);
    const pay = input.payment || { mode: 'odenmedi' };
    let payAmount = 0;
    if (pay.mode === 'odendi') payAmount = calc.payable;
    else if (pay.mode === 'kismen') {
      payAmount = Math.round(Number(pay.amount));
      need(Number.isFinite(payAmount) && payAmount > 0, 'Kısmi ödeme tutarını yazın.');
      need(payAmount < calc.payable, 'Kısmi ödeme, üreticiye ödenecek tutardan az olmalı. Tamamı ödendiyse "Ödendi" seçin.');
    }
    return this.tx(() => {
      const at = this.now();
      const id = this.run(`INSERT INTO receipts(customer_id, customer_name, customer_address, created_at, commission_rate, porter_fee,
        total_bags, total_kg, total_amount, commission, porterage, cash_advance, fee_total, payable) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [customer.id, fullName(customer), customer.address, at, calc.commissionRate, calc.porterFee, calc.totalBags, calc.totalKg,
        calc.totalAmount, calc.commission, calc.porterage, calc.cashAdvance, calc.feeTotal, calc.payable]);
      this.insertItems(id, calc.items);
      this.applyStock(id, Service.bagsByProduct(calc.items, 1), 'fis', `Fiş ${id}`);
      if (calc.cashAdvance > 0) {
        this.run('INSERT INTO account_entries(customer_id, type, amount, at, note, receipt_id, created_at) VALUES (?,?,?,?,?,?,?)',
          [customer.id, 'elden', calc.cashAdvance, at, `Fiş ${id}`, id, at]);
      }
      if (payAmount > 0) {
        this.run('INSERT INTO payments(receipt_id, customer_id, amount, method, paid_at, note, created_at) VALUES (?,?,?,?,?,?,?)',
          [id, customer.id, payAmount, 'nakit', at, 'Fiş kesilirken', at]);
      }
      this.audit('fis_olusturuldu', 'fis', id,
        `Fiş ${id} kesildi: ${fullName(customer)} — tutar ${Calc.formatMoney(calc.totalAmount, true)}, ${calc.totalBags} çuval` +
        (calc.cashAdvance ? `, elden ${Calc.formatMoney(calc.cashAdvance, true)}` : '') +
        (payAmount ? `, ödenen ${Calc.formatMoney(payAmount, true)}` : ''),
        null, { customer_id: customer.id, items: calc.items, cash_advance: calc.cashAdvance, payment: payAmount });
      return id;
    });
  }

  updateReceipt(id, input, reason) {
    const old = this.getReceipt(id);
    need(!old.cancelled_at, 'İptal edilmiş fiş düzeltilemez.');
    reason = cleanText(reason, 200);
    need(reason, 'Düzeltme nedeni yazın.');
    const { customer, calc } = this.buildReceipt(input, old);
    const activePayments = old.payments.filter((p) => !p.deleted_at);
    if (customer.id !== old.customer_id) need(!activePayments.length, 'Ödemesi olan fişin müşterisi değiştirilemez. Önce ödemeleri silin.');
    need(calc.payable >= old.paid, `Bu fiş için ${Calc.formatMoney(old.paid, true)} ödenmiş. Yeni tutar bundan az olamaz; önce ödemeyi silin.`);
    return this.tx(() => {
      const at = this.now();
      const deltas = Service.bagsByProduct(old.items, -1);
      for (const [pid, d] of Object.entries(Service.bagsByProduct(calc.items, 1))) deltas[pid] = (deltas[pid] || 0) + d;
      this.applyStock(id, deltas, 'fis_duzeltme', `Fiş ${id} düzeltildi`);
      this.run('DELETE FROM receipt_items WHERE receipt_id=?', [id]);
      this.insertItems(id, calc.items);
      this.run(`UPDATE receipts SET customer_id=?, customer_name=?, customer_address=?, updated_at=?, total_bags=?, total_kg=?,
        total_amount=?, commission=?, porterage=?, cash_advance=?, fee_total=?, payable=? WHERE id=?`,
      [customer.id, fullName(customer), customer.address, at, calc.totalBags, calc.totalKg, calc.totalAmount,
        calc.commission, calc.porterage, calc.cashAdvance, calc.feeTotal, calc.payable, id]);
      // Elden kaydını güncelle
      this.run("UPDATE account_entries SET deleted_at=?, delete_reason=? WHERE receipt_id=? AND type='elden' AND deleted_at IS NULL",
        [at, `Fiş ${id} düzeltildi`, id]);
      if (calc.cashAdvance > 0) {
        this.run('INSERT INTO account_entries(customer_id, type, amount, at, note, receipt_id, created_at) VALUES (?,?,?,?,?,?,?)',
          [customer.id, 'elden', calc.cashAdvance, old.created_at, `Fiş ${id}`, id, at]);
      }
      const snap = (r) => ({ customer_id: r.customer_id, items: r.items.map((it) => ({ product_name: it.product_name, bags: it.bags, kg: it.kg, price: it.price, amount: it.amount })), cash_advance: r.cash_advance !== undefined ? r.cash_advance : r.cashAdvance, total_amount: r.total_amount !== undefined ? r.total_amount : r.totalAmount });
      this.audit('fis_duzeltildi', 'fis', id,
        `Fiş ${id} düzeltildi: tutar ${Calc.formatMoney(old.total_amount, true)} → ${Calc.formatMoney(calc.totalAmount, true)}, ` +
        `çuval ${old.total_bags} → ${calc.totalBags}, elden ${Calc.formatMoney(old.cash_advance, true)} → ${Calc.formatMoney(calc.cashAdvance, true)}`,
        snap(old), snap(Object.assign({ customer_id: customer.id }, calc)), reason);
      return id;
    });
  }

  cancelReceipt(id, reason) {
    const r = this.getReceipt(id);
    need(!r.cancelled_at, 'Fiş zaten iptal edilmiş.');
    reason = cleanText(reason, 200);
    need(reason, 'İptal nedeni yazın.');
    need(!r.payments.some((p) => !p.deleted_at), 'Bu fişe ödeme girilmiş. İptal etmeden önce ödemeleri silin.');
    return this.tx(() => {
      const at = this.now();
      this.applyStock(id, Service.bagsByProduct(r.items, -1), 'fis_iptal', `Fiş ${id} iptal edildi`);
      this.run("UPDATE account_entries SET deleted_at=?, delete_reason=? WHERE receipt_id=? AND type='elden' AND deleted_at IS NULL",
        [at, `Fiş ${id} iptal edildi`, id]);
      this.run('UPDATE receipts SET cancelled_at=?, cancel_reason=? WHERE id=?', [at, reason, id]);
      this.audit('fis_iptal', 'fis', id, `Fiş ${id} iptal edildi: ${r.customer_name} — ${Calc.formatMoney(r.total_amount, true)}`, null, null, reason);
      return id;
    });
  }

  // method: 'nakit' (üreticiye para verdik) | 'mahsup' (üreticinin bize olan borcundan düştük)
  addPayment(receiptId, input) {
    const r = this.getReceipt(receiptId);
    need(!r.cancelled_at, 'İptal edilmiş fişe ödeme girilemez.');
    const amount = Math.round(Number(input.amount));
    need(Number.isFinite(amount) && amount > 0, 'Ödeme tutarı 0\'dan büyük olmalı.');
    need(amount <= r.remaining, `Kalan borç ${Calc.formatMoney(r.remaining, true)}. Daha fazlası girilemez.`);
    const method = input.method === 'mahsup' ? 'mahsup' : 'nakit';
    if (method === 'mahsup') {
      need(r.customer_account >= amount, `Üreticinin bize borcu ${Calc.formatMoney(Math.max(0, r.customer_account), true)}. Bundan fazlası düşülemez.`);
    }
    const note = cleanText(input.note, 200);
    return this.tx(() => {
      const at = this.now();
      const pid = this.run('INSERT INTO payments(receipt_id, customer_id, amount, method, paid_at, note, created_at) VALUES (?,?,?,?,?,?,?)',
        [receiptId, r.customer_id, amount, method, at, note, at]);
      if (method === 'mahsup') {
        this.run('INSERT INTO account_entries(customer_id, type, amount, at, note, receipt_id, payment_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
          [r.customer_id, 'mahsup', -amount, at, `Fiş ${receiptId} ödemesinden düşüldü`, receiptId, pid, at]);
      }
      this.audit('odeme_eklendi', 'fis', receiptId,
        `Fiş ${receiptId} ödemesi: ${Calc.formatMoney(amount, true)} (${method === 'mahsup' ? 'borçtan düşüldü' : 'nakit/havale'})`,
        null, { amount, method, note });
      return pid;
    });
  }

  deletePayment(paymentId, reason) {
    const p = this.get('SELECT * FROM payments WHERE id=?', [paymentId]);
    need(p && !p.deleted_at, 'Ödeme bulunamadı.');
    reason = cleanText(reason, 200);
    need(reason, 'Silme nedeni yazın.');
    return this.tx(() => {
      const at = this.now();
      this.run('UPDATE payments SET deleted_at=?, delete_reason=? WHERE id=?', [at, reason, paymentId]);
      this.run('UPDATE account_entries SET deleted_at=?, delete_reason=? WHERE payment_id=? AND deleted_at IS NULL', [at, reason, paymentId]);
      this.audit('odeme_silindi', 'fis', p.receipt_id, `Fiş ${p.receipt_id} ödemesi silindi: ${Calc.formatMoney(p.amount, true)}`, p, null, reason);
      return paymentId;
    });
  }

  // ---------- stok ----------
  stockMovements(opts) {
    opts = opts || {};
    const params = [];
    let sql = 'SELECT m.*, p.name AS product_name FROM stock_movements m JOIN products p ON p.id = m.product_id';
    if (opts.productId) { sql += ' WHERE m.product_id=?'; params.push(opts.productId); }
    sql += ' ORDER BY m.id DESC LIMIT ?';
    params.push(opts.limit || 500);
    return this.all(sql, params);
  }

  // ---------- kayıt geçmişi ----------
  listAudit(opts) {
    opts = opts || {};
    const where = [];
    const params = [];
    if (opts.from) { where.push('at >= ?'); params.push(opts.from + ' 00:00:00'); }
    if (opts.to) { where.push('at <= ?'); params.push(opts.to + ' 23:59:59'); }
    if (opts.entity) { where.push('entity = ?'); params.push(opts.entity); }
    let rows = this.all('SELECT id, at, action, entity, entity_id, summary, reason, old_json, new_json FROM audit_log' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC', params);
    if (opts.q) rows = rows.filter((r) => Calc.matches(r.summary + ' ' + (r.reason || ''), opts.q));
    return rows.slice(0, opts.limit || 500);
  }

  verifyAudit() {
    const rows = this.all('SELECT * FROM audit_log ORDER BY id');
    let prev = '';
    for (const r of rows) {
      const h = auditHash(prev, [r.at, r.action, r.entity, r.entity_id, r.summary, r.old_json, r.new_json, r.reason || '']);
      if (h !== r.hash) return { ok: false, count: rows.length, brokenAt: r.id };
      prev = r.hash;
    }
    return { ok: true, count: rows.length };
  }

  // ---------- ana sayfa özeti ----------
  dashboard() {
    const today = Calc.todayLocal();
    const todays = this.listReceipts({ from: today, to: today }).filter((r) => r.status !== 'iptal');
    const open = this.listReceipts({ status: 'acik', limit: 100000 });
    const balances = this.customerBalances();
    let theyOwe = 0;
    for (const b of Object.values(balances)) if (b.account > 0) theyOwe += b.account;
    const products = this.listProducts();
    const last = this.get('SELECT MAX(id) AS id FROM receipts');
    return {
      today_count: todays.length,
      today_amount: todays.reduce((s, r) => s + r.total_amount, 0),
      today_bags: todays.reduce((s, r) => s + r.total_bags, 0),
      today_commission: todays.reduce((s, r) => s + r.commission, 0),
      open_count: open.length,
      open_amount: open.reduce((s, r) => s + r.remaining, 0),
      they_owe: theyOwe,
      stale_products: products.filter((p) => p.price_stale).map((p) => ({ id: p.id, name: p.name, price_updated_at: p.price_updated_at })),
      product_count: products.length,
      customer_count: this.get('SELECT COUNT(*) AS n FROM customers WHERE deleted_at IS NULL').n,
      last_receipt_id: last ? last.id : null,
      recent: this.listReceipts({ limit: 8 }),
    };
  }

  // ---------- toplu dışa aktarım için ----------
  exportAll() {
    return {
      receipts: this.listReceipts({ limit: 1e9 }).reverse(),
      items: this.all('SELECT * FROM receipt_items ORDER BY receipt_id, line_no'),
      payments: this.all('SELECT * FROM payments ORDER BY id'),
      customers: this.listCustomers({ includeDeleted: true }),
      entries: this.all('SELECT e.*, c.first_name, c.last_name FROM account_entries e JOIN customers c ON c.id = e.customer_id ORDER BY e.at, e.id'),
      products: this.listProducts({ includeDeleted: true }),
      stock: this.all('SELECT m.*, p.name AS product_name FROM stock_movements m JOIN products p ON p.id = m.product_id ORDER BY m.id'),
      audit: this.all('SELECT id, at, action, entity, entity_id, summary, reason FROM audit_log ORDER BY id'),
    };
  }

  exportBytes() {
    return Buffer.from(this.db.export());
  }
}

function auditHash(prev, parts) {
  return crypto.createHash('sha256').update(prev + '|' + parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|')).digest('hex');
}

module.exports = { Service, DEFAULT_SETTINGS, fullName };

})(module, module.exports, __require); return module.exports; })();

  // ---------- demo durumu ----------
  const VERSION = '1.0.1';
  const STORE_KEY = 'fh-demo-db-v1';
  const DEMO_PIN = '1234';
  const Calc = window.Calc;
  let service = null;
  let db = null;
  let phase = 'locked';

  function saveDb() {
    try {
      const u8 = db.export();
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      localStorage.setItem(STORE_KEY, btoa(s));
    } catch (e) { /* depolama kapalıysa veriler yalnızca bu oturumda kalır */ }
  }

  function loadDb() {
    try {
      const b64 = localStorage.getItem(STORE_KEY);
      return b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : null;
    } catch (e) { return null; }
  }

  // Örnek veriler: son bir haftaya yayılmış, gerçek kişi ve kayıt içermez.
  function seed(s) {
    const pad = (n) => String(n).padStart(2, '0');
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    };
    const realNow = s.now;
    const at = (offset, time) => { s.now = () => day(offset) + ' ' + time + ':00'; };
    const fis = (customer, items, extra) => s.createReceipt(Object.assign({ customer_id: customer, priceConfirmed: true, items }, extra || {}));

    at(-6, '08:10');
    s.setPin(DEMO_PIN, true);
    const boz = s.addProduct({ name: 'Boz Fıstık', price: 28000, stock: 0 });
    const kirmizi = s.addProduct({ name: 'Kırmızı', price: 30500, stock: 0 });
    const siirt = s.addProduct({ name: 'Siirt', price: 33500, stock: 12 });
    const ham = s.addProduct({ name: 'Ham (kabuklu)', price: 25000, stock: 0 });
    const mehmet = s.addCustomer({ first_name: 'Mehmet', last_name: 'Kaya', phone: '0500 000 00 01', address: 'Birecik' });
    const ali = s.addCustomer({ first_name: 'Ali', last_name: 'Demir', address: 'Halfeti' });
    const hasan = s.addCustomer({ first_name: 'Hasan', last_name: 'Çelik', address: 'Nizip' });
    const fatma = s.addCustomer({ first_name: 'Fatma', last_name: 'Şahin', address: 'Mezra köyü' });
    const ibrahim = s.addCustomer({ first_name: 'İbrahim', last_name: 'Öztürk', address: 'Birecik' });
    const mustafa = s.addCustomer({ first_name: 'Mustafa', last_name: 'Aydın', address: 'Suruç' });
    s.addAccountEntry(fatma, { type: 'acilis_alacak', amount: 2500000, date: day(-6), note: 'Defterden aktarıldı' });
    s.addAccountEntry(ibrahim, { type: 'acilis_borc', amount: 1250000, date: day(-6), note: 'Defterden aktarıldı' });

    at(-5, '10:20');
    fis(mehmet, [{ product_id: boz, bags: 12, kg: 648 }, { product_id: kirmizi, bags: 6, kg: 310.5 }], { cash_advance: 1500000, payment: { mode: 'kismen', amount: 10000000 } });
    at(-4, '11:45');
    fis(ali, [{ product_id: siirt, bags: 20, kg: 1050 }], { payment: { mode: 'odendi' } });

    at(-3, '08:25');
    s.updatePrice(boz, 28300); s.updatePrice(kirmizi, 30800); s.updatePrice(siirt, 33800); s.updatePrice(ham, 25000);
    at(-3, '14:05');
    const fHasan = fis(hasan, [{ product_id: boz, bags: 8, kg: 420 }]);

    at(-2, '09:40');
    const fMustafa = fis(mustafa, [{ product_id: ham, bags: 15, kg: 790 }, { product_id: boz, bags: 5, kg: 262.5 }], { cash_advance: 500000 });
    s.addAccountEntry(mehmet, { type: 'tahsilat', amount: 500000, date: day(-2), note: 'Elden borcunun bir kısmını ödedi' });

    at(-1, '09:15');
    const fFatma = fis(fatma, [{ product_id: kirmizi, bags: 10, kg: 515 }]);
    s.addPayment(fFatma, { amount: 2500000, method: 'mahsup', note: 'Eski borcundan düşüldü' });
    s.addPayment(fMustafa, { amount: 5000000, method: 'nakit', note: 'Havale' });
    at(-1, '11:30');
    fis(ibrahim, [{ product_id: siirt, bags: 6, kg: 318 }], { payment: { mode: 'odendi' } });
    const fYanlis = fis(ali, [{ product_id: boz, bags: 3, kg: 150 }]);
    s.cancelReceipt(fYanlis, 'Yanlış müşteriye kesildi');
    at(-1, '16:40');
    s.adjustStock(siirt, { newStock: s.getProduct(siirt).stock - 10, reason: 'Satış: Antep\'e gönderildi' });

    at(0, '08:20');
    s.updatePrice(boz, 28500); s.updatePrice(kirmizi, 31000); s.updatePrice(siirt, 34000); // Ham bilerek güncellenmedi: fiyat uyarısı görünsün
    at(0, '09:05');
    fis(mehmet, [{ product_id: boz, bags: 9, kg: 486 }]);
    at(0, '10:30');
    fis(hasan, [{ product_id: kirmizi, bags: 4, kg: 208 }], { payment: { mode: 'kismen', amount: 2000000 } });
    s.addPayment(fHasan, { amount: 6000000, method: 'nakit', note: '' });

    s.now = realNow;
  }

  const ready = (async () => {
    const { openDatabase } = __mods.db;
    const { Service } = __mods.service;
    try { db = await openDatabase(loadDb()); } catch (e) { db = await openDatabase(null); }
    service = new Service(db, () => {});
    if (!service.hasPin()) seed(service);
    service.persist = saveDb;
    saveDb();
  })();

  // ---------- yazdırma (tarayıcının yazdır / PDF olarak kaydet penceresi) ----------
  // Fiş, sayfaya yalnızca yazdırırken görünen bir bölüm olarak eklenir; sonra tarayıcının yazdır penceresi açılır.
  function printReceipt(r) {
    for (const id of ['demo-print-root', 'demo-print-style']) {
      const old = document.getElementById(id);
      if (old) old.remove();
    }
    const style = document.createElement('style');
    style.id = 'demo-print-style';
    style.textContent = '@media screen{#demo-print-root{display:none}}' +
      '@media print{@page{size:A5 portrait;margin:0}html,body{height:auto!important;background:#fff!important}' +
      'body>*:not(#demo-print-root){display:none!important}#demo-print-root{display:block}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' + window.FisRender.CSS;
    const root = document.createElement('div');
    root.id = 'demo-print-root';
    root.innerHTML = window.FisRender.renderPages(r, company());
    document.head.appendChild(style);
    document.body.appendChild(root);
    setTimeout(() => window.print(), 150);
    return { printed: true };
  }

  const demoOnly = (what) => { throw new Error('Demo: ' + what + ' yalnızca bilgisayara kurulan programda çalışır.'); };
  const company = () => service.getSetting('company_name');
  const fakeFile = (r, ext) => 'Belgeler\\Coşkun Bahar Fişler\\' + String(r.created_at).slice(0, 4) + '\\' + r.id + '_' + r.customer_name + '_fis.' + ext +
    '   (demo: dosya oluşturulmaz, gerçek programda bu adla kaydedilir)';

  const mainApi = {
    appInfo: () => ({ version: VERSION + ' (demo)', dataDir: 'Demo: veriler bu tarayıcıda tutulur', docsDir: 'Belgeler\\Coşkun Bahar Fişler' }),
    printReceipt: (id) => printReceipt(service.getReceipt(id)),
    receiptPdf: (id) => fakeFile(service.getReceipt(id), 'pdf'),
    receiptExcel: (id) => fakeFile(service.getReceipt(id), 'xlsx'),
    exportAllExcel: () => 'Belgeler\\Coşkun Bahar Fişler\\Dokumler\\Tum_Kayitlar.xlsx   (demo: dosya oluşturulmaz)',
    openPath: () => demoOnly('Dosya açma'),
    showInFolder: () => demoOnly('Klasör açma'),
    openDocsDir: () => demoOnly('Klasör açma'),
    chooseFolder: () => demoOnly('Klasör / disk seçme'),
    backupNow: () => ({ name: 'demo', local: 'demo', external: null, externalError: null }),
    backupStatus: () => ({ last_local: Calc.nowLocal(), last_external: null, external_dir: '', external_ready: false, local_dir: '' }),
    listBackups: () => [{ name: 'yedek.fhy', path: '', where: 'Bilgisayar', at: Calc.nowLocal(), size: 81920, tag: '' }],
    restoreBackup: () => demoOnly('Yedekten geri yükleme'),
    changePin: () => demoOnly('PIN değiştirme'),
    showRecoveryCode: (pin) => { if (!service.checkPin(pin)) throw new Error('PIN yanlış.'); return 'DEM01-DEM02-DEM03-DEM04'; },
    printRecoveryCode: () => demoOnly('Kurtarma kodu yazdırma'),
  };

  const SERVICE_METHODS = new Set([
    'listProducts', 'getProduct', 'addProduct', 'renameProduct', 'updatePrice', 'priceHistory', 'adjustStock', 'deleteProduct',
    'listCustomers', 'getCustomer', 'addCustomer', 'updateCustomer', 'deleteCustomer', 'addAccountEntry', 'deleteAccountEntry',
    'listReceipts', 'getReceipt', 'createReceipt', 'updateReceipt', 'cancelReceipt', 'addPayment', 'deletePayment',
    'stockMovements', 'listAudit', 'verifyAudit', 'dashboard', 'getSettings', 'saveSettings',
  ]);

  const status = () => ({
    phase,
    note: 'Bu bir tanıtım (demo) sürümüdür. Giriş için PIN: ' + DEMO_PIN + '. Görünen kişiler ve rakamlar örnektir.',
    company: service.getSetting('company_name'),
    waitSeconds: 0,
    version: VERSION + ' demo',
  });
  const auth = {
    status,
    login: (pin) => { if (!service.checkPin(pin)) throw new Error('PIN yanlış. Demo PIN: ' + DEMO_PIN); phase = 'unlocked'; return status(); },
    lock: () => { phase = 'locked'; return status(); },
  };

  async function call(fn) {
    try {
      await ready;
      const data = await fn();
      return { ok: true, data: data === undefined ? null : JSON.parse(JSON.stringify(data)) };
    } catch (e) {
      return { ok: false, error: e.message || String(e), code: e.code || null };
    }
  }

  window.fh = {
    auth: (method, ...args) => call(() => {
      if (!Object.prototype.hasOwnProperty.call(auth, method)) throw new Error('Demo: bu işlem kapalı.');
      return auth[method](...args);
    }),
    api: (method, ...args) => call(() => {
      if (phase !== 'unlocked') throw Object.assign(new Error('Program kilitli. Lütfen PIN ile giriş yapın.'), { code: 'KILITLI' });
      if (Object.prototype.hasOwnProperty.call(mainApi, method)) return mainApi[method](...args);
      if (SERVICE_METHODS.has(method)) return service[method](...args);
      throw new Error('Bilinmeyen işlem: ' + method);
    }),
  };

  // "Demo verilerini sıfırla" bağlantısı (menünün altına)
  document.addEventListener('DOMContentLoaded', () => {
    const foot = document.querySelector('.side-foot');
    if (!foot) return;
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'demo-reset';
    a.textContent = 'Demo verilerini sıfırla';
    a.onclick = () => {
      if (!window.confirm('Demo verileri ilk haline dönsün mü? Bu tarayıcıda yaptığınız denemeler silinir.')) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* yoksay */ }
      location.hash = '';
      location.reload();
    };
    foot.appendChild(a);
  });
})();
