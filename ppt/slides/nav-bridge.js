// Keyboard navigation bridge: forward arrow/page keys to parent PPT deck
(() => {
  const NAV = new Set(['ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Spacebar']);
  document.addEventListener('keydown', (e) => {
    if (!NAV.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    try { window.parent.postMessage({ type: 'ppt:navigate', key: e.key }, '*'); } catch(_){}
  }, true);
})();
