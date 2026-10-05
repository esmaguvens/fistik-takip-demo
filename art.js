// Tabeladaki fıstık görseli (çizim) ve tabela bileşeni.
'use strict';

window.Art = (() => {
  function nut(x, y, rot, scale) {
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">
      <ellipse cx="0" cy="0" rx="34" ry="21" fill="#efe3bf" stroke="#b69d63" stroke-width="2"/>
      <path d="M-30 -2 C -12 -12, 14 -12, 31 -3 C 14 3, -12 4, -30 -2 Z" fill="#6f8f2c"/>
      <path d="M-26 -3 C -10 -9, 12 -9, 26 -3 C 12 0, -10 1, -26 -3 Z" fill="#a9c957"/>
      <path d="M-33 1 C -14 10, 16 10, 33 0" fill="none" stroke="#c9b27c" stroke-width="1.6"/>
    </g>`;
  }

  function leaf(x, y, rot) {
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <path d="M0 0 C 14 -16, 42 -18, 58 0 C 42 18, 14 16, 0 0 Z" fill="#7fae3e" stroke="#4f7a22" stroke-width="1.5"/>
      <path d="M2 0 L 55 0" stroke="#4f7a22" stroke-width="1.4"/>
    </g>`;
  }

  const PISTACHIO_SVG = `<svg viewBox="0 0 170 110" width="170" height="110" aria-hidden="true">
    ${leaf(34, 36, -40)}${leaf(70, 26, -70)}${leaf(92, 34, -20)}
    ${nut(62, 58, -8, 1)}${nut(112, 50, 14, .95)}${nut(52, 88, 6, .9)}${nut(110, 86, -4, 1)}
  </svg>`;

  function sign(company) {
    const name = company || 'COŞKUN BAHAR TİCARET';
    const el = document.createElement('div');
    el.className = 'sign';
    el.innerHTML = `<div>${PISTACHIO_SVG}</div>
      <div><div class="sign-name"></div><div class="sign-sub">HER TÜRLÜ FISTIK ALIM SATIMI</div></div>
      <div class="sign-no">No: 37</div>`;
    el.querySelector('.sign-name').textContent = name;
    return el;
  }

  return { sign, PISTACHIO_SVG };
})();
