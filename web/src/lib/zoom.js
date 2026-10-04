// Zoom da página (index.css: 90% no computador). Medidas da tela, como clientX e
// getBoundingClientRect, vêm sem o zoom; divida por este valor antes de usar em CSS.
export function zoomDaPagina() {
  return parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
}
