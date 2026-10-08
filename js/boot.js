/* ═══════════════════════════════════════════════════════════════
   VOYAGER · boot.js  (always the LAST script)
   Starts every registered module, then guards against a stuck
   loader: if the HUD never took ownership of it, enter anyway so
   the content is never trapped behind a dead screen.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function start() {
    const GK = window.GK;
    if (!GK || !GK.boot) return;
    GK.boot();

    setTimeout(function () {
      if (GK.state.entered || GK.loaderReady) return;
      console.warn('[GK] loader was never armed — entering automatically');
      const loader = document.getElementById('loader');
      if (loader) loader.remove();
      GK.bus.emit('enter', { sound: false, auto: true });
    }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
