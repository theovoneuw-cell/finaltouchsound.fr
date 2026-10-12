// Theme clair / sombre. Charge dans le <head> avant la feuille de style : pas d eclair au chargement.
// Sans choix enregistre, le site suit le systeme ; le bouton fixe un choix, garde pour les visites suivantes.
(function () {
  var root = document.documentElement;
  var media = matchMedia('(prefers-color-scheme: dark)');
  var saved = null;
  try { saved = localStorage.getItem('ft-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;

  function current() { return root.dataset.theme || (media.matches ? 'dark' : 'light'); }

  function sync() {
    var dark = current() === 'dark';
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.content = dark ? '#121316' : '#ecebe6'; });
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(dark));
      var fr = (root.lang || 'fr').indexOf('fr') === 0;
      b.setAttribute('aria-label', dark ? (fr ? 'Passer en thème clair' : 'Switch to light theme') : (fr ? 'Passer en thème sombre' : 'Switch to dark theme'));
    });
  }

  function apply(next) {
    root.dataset.theme = next;
    try { localStorage.setItem('ft-theme', next); } catch (e) {}
    sync();
    document.dispatchEvent(new CustomEvent('ft-theme', { detail: next }));
  }

  function toggle(btn) {
    var next = current() === 'dark' ? 'light' : 'dark';
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) { apply(next); return; }
    // Le nouveau theme s ouvre en cercle depuis le bouton.
    var r = btn.getBoundingClientRect();
    root.style.setProperty('--vt-x', (r.left + r.width / 2) + 'px');
    root.style.setProperty('--vt-y', (r.top + r.height / 2) + 'px');
    document.startViewTransition(function () { apply(next); });
  }

  media.addEventListener('change', function () {
    if (root.dataset.theme) return;
    sync();
    document.dispatchEvent(new CustomEvent('ft-theme', { detail: current() }));
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (b) toggle(b);
  });
  document.addEventListener('DOMContentLoaded', sync);
  window.FT_THEME = { sync: sync, current: current };
})();
