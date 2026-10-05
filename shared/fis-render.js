// Fişin kağıt görünümü (A5). Matbu fiş düzeni birebir korunur.
// Yazdırma, PDF ve ekrandaki önizleme aynı HTML'i kullanır.
(function (root, factory) {
  const calc = (typeof module === 'object' && module.exports) ? require('./calc') : root.Calc;
  const api = factory(calc);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FisRender = api;
})(typeof self !== 'undefined' ? self : this, function (Calc) {
  'use strict';

  const ROWS_PER_PAGE = 7;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const CSS = `
  .fis-page{width:148mm;height:210mm;box-sizing:border-box;padding:7mm 7mm 6mm 7mm;
    background:#fff;color:#1a1a1a;font-family:Arial,"Segoe UI",sans-serif;position:relative;
    overflow:hidden;page-break-after:always;break-after:page;}
  .fis-page:last-child{page-break-after:auto;break-after:auto;}
  .fis-page *{box-sizing:border-box;}
  .fis-blue{color:#27318f;}
  .fis-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm;}
  .fis-firma{font-size:17pt;font-weight:800;letter-spacing:.3pt;color:#27318f;line-height:1.1;padding-top:1mm;}
  .fis-meta{text-align:right;font-size:9.5pt;color:#27318f;line-height:1.35;}
  .fis-meta b{font-size:13pt;color:#1a1a1a;}
  .fis-meta .v{color:#1a1a1a;font-weight:600;}
  .fis-durum{display:inline-block;margin-top:1.5mm;border:.6mm solid #1a1a1a;padding:.6mm 2.2mm;
    font-weight:800;font-size:10pt;letter-spacing:.4pt;color:#1a1a1a;}
  .fis-sayin{display:flex;align-items:flex-end;gap:2mm;margin-bottom:3.5mm;}
  .fis-sayin .lbl{font-family:"Times New Roman",serif;font-style:italic;font-weight:700;font-size:15pt;color:#27318f;}
  .fis-dot{flex:1;border-bottom:.35mm dotted #27318f;min-height:6.5mm;font-size:12pt;font-weight:600;padding:0 1mm .5mm;}
  .fis-line2{display:flex;margin-bottom:4mm;}
  .fis-table{width:100%;border-collapse:collapse;table-layout:fixed;border:.5mm solid #27318f;}
  .fis-table td,.fis-table th{border-left:.35mm solid #27318f;border-right:.35mm solid #27318f;
    padding:0 1.6mm;font-size:11pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
  .fis-table th{height:11mm;font-weight:400;font-size:15pt;color:#27318f;border-bottom:.45mm solid #27318f;
    font-family:"Arial Narrow",Arial,sans-serif;letter-spacing:-.3pt;}
  .fis-table tr.item td{height:10.8mm;border-bottom:.3mm dotted #27318f;}
  .fis-table tr.item.last td{border-bottom:.45mm solid #27318f;}
  .fis-table tr.sum td{height:9.2mm;border-bottom:.35mm solid #27318f;}
  .fis-table tr.sum td.lbl{font-size:13pt;color:#27318f;font-family:"Arial Narrow",Arial,sans-serif;}
  .fis-table td.num{text-align:right;}
  .fis-table td.name{font-weight:600;white-space:normal;font-size:10pt;line-height:1.1;word-break:break-word;}
  .fis-alt{display:flex;justify-content:space-between;font-size:8pt;color:#27318f;margin-top:1.5mm;}
  .fis-iptal{position:absolute;left:0;right:0;top:45%;text-align:center;transform:rotate(-24deg);
    font-size:44pt;font-weight:900;color:rgba(190,20,20,.28);letter-spacing:2pt;pointer-events:none;}
  `;

  const PRINT_CSS = '@page{size:A5 portrait;margin:0;}html,body{margin:0;padding:0;background:#fff;}' +
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}';

  function chunk(items) {
    const pages = [];
    for (let i = 0; i < Math.max(items.length, 1); i += ROWS_PER_PAGE) {
      pages.push(items.slice(i, i + ROWS_PER_PAGE));
    }
    return pages;
  }

  function itemRow(it, isLast) {
    const cls = 'item' + (isLast ? ' last' : '');
    if (!it) return `<tr class="${cls}"><td></td><td></td><td></td><td></td><td></td></tr>`;
    return `<tr class="${cls}">` +
      `<td class="name">${esc(it.product_name)}</td>` +
      `<td class="num">${esc(Calc.formatInt(it.bags))}</td>` +
      `<td class="num">${esc(Calc.formatKg(it.kg))}</td>` +
      `<td class="num">${esc(Calc.formatMoney(it.price))}</td>` +
      `<td class="num">${esc(Calc.formatMoney(it.amount))}</td></tr>`;
  }

  function sumRow(label, kgCell, priceCell, amountCell) {
    return `<tr class="sum"><td class="lbl" colspan="2">${esc(label)}</td>` +
      `<td class="num">${esc(kgCell)}</td><td class="num">${esc(priceCell)}</td>` +
      `<td class="num"><b>${esc(amountCell)}</b></td></tr>`;
  }

  // r: fiş kaydı (items dahil), company: firma adı
  function renderPages(r, company) {
    const pages = chunk(r.items || []);
    const status = r.status || Calc.paymentStatus(r.payable, r.paid || 0, !!r.cancelled_at);
    const statusText = Calc.STATUS_PRINT[status] || '';
    return pages.map((rows, pi) => {
      const isLastPage = pi === pages.length - 1;
      let body = '';
      for (let i = 0; i < ROWS_PER_PAGE; i++) body += itemRow(rows[i], i === ROWS_PER_PAGE - 1);
      if (isLastPage) {
        const rate = String(r.commission_rate).replace('.', ',');
        body += sumRow('Komisyon', '', '%' + rate, Calc.formatMoney(r.commission));
        body += sumRow('Hamallık', Calc.formatInt(r.total_bags) + ' çuval',
          Calc.formatMoney(r.porter_fee), Calc.formatMoney(r.porterage));
        body += sumRow('Elden', '', '', r.cash_advance ? Calc.formatMoney(r.cash_advance) : '');
        body += sumRow('TOPLAM', '', '', Calc.formatMoney(r.fee_total));
        body += sumRow('', '', '', '');
      } else {
        body += `<tr class="sum"><td class="lbl" colspan="5" style="text-align:center">Devamı sonraki sayfada</td></tr>`;
      }
      return `<div class="fis-page">
        ${status === 'iptal' ? '<div class="fis-iptal">İPTAL EDİLDİ</div>' : ''}
        <div class="fis-top">
          <div class="fis-firma">${esc(company || '')}</div>
          <div class="fis-meta">
            <div>Fiş No: <b>${esc(r.id)}</b></div>
            <div>Tarih: <span class="v">${esc(Calc.formatDate(r.created_at))}</span></div>
            <div>Saat: <span class="v">${esc(Calc.formatTime(r.created_at))}</span></div>
            ${statusText ? `<div class="fis-durum">${esc(statusText)}</div>` : ''}
          </div>
        </div>
        <div class="fis-sayin"><span class="lbl">Sayın</span><span class="fis-dot">${esc(r.customer_name)}</span></div>
        <div class="fis-line2"><span class="fis-dot">${esc(r.customer_address || '')}</span></div>
        <table class="fis-table">
          <colgroup><col style="width:22%"><col style="width:11%"><col style="width:22%"><col style="width:16%"><col style="width:29%"></colgroup>
          <thead><tr><th>CİNSİ</th><th>ADET</th><th>KG</th><th>FİYATI</th><th>TUTARI</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
        <div class="fis-alt"><span></span><span>${pages.length > 1 ? 'Sayfa ' + (pi + 1) + ' / ' + pages.length : ''}</span></div>
      </div>`;
    }).join('');
  }

  function renderDocument(r, company) {
    return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Fiş ' + esc(r.id) + '</title>' +
      '<style>' + PRINT_CSS + CSS + '</style></head><body>' + renderPages(r, company) + '</body></html>';
  }

  return { CSS, PRINT_CSS, ROWS_PER_PAGE, renderPages, renderDocument, esc };
});
