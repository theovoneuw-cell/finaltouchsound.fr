// Vente : liens de paiement, compteur des licences de lancement, « Préviens-moi », tarif étudiant.
// Tout passe par FT_CONFIG (js/config.js). Vide = « Bientôt disponible », formulaires masqués.

const cfg = window.FT_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const etat = { restant: null, fini: false };
let T = k => k, langue = () => 'fr';

const prix = (v, l) => (l === 'fr' ? v.replace('.', ',') + ' €' : '€' + v);

export async function initVente(t, getLang) {
  T = t; langue = getLang;
  initPreviens();
  initEtudiant();
  if (cfg.api) {
    try {
      const r = await (await fetch(cfg.api + '?action=compteur')).json();
      if (typeof r.restant === 'number') { etat.restant = r.restant; etat.fini = r.restant <= 0; }
    } catch (e) { /* compteur indisponible : on garde l'affichage de lancement */ }
  }
  appliquerVente();
}

// Appelé après chaque changement de langue.
export function appliquerVente(t, getLang) {
  if (t) { T = t; langue = getLang; }
  const l = langue();
  const ouvert = !!cfg.checkout;

  // Lien de paiement : code de lancement tant qu'il reste des licences.
  const url = ouvert ? cfg.checkout + (cfg.checkout.includes('?') ? '&' : '?') +
    (etat.fini ? '' : 'checkout[discount_code]=' + encodeURIComponent((cfg.lancement && cfg.lancement.code) || 'LANCEMENT') + '&') +
    'checkout[custom][langue]=' + l : '';

  $$('[data-buy="standard"]').forEach(a => {
    if (ouvert) { a.href = url; a.removeAttribute('aria-disabled'); }
    else { a.href = '#prix'; a.setAttribute('aria-disabled', 'true'); a.textContent = T('price.soon'); }
  });
  $$('[data-buy="student"]').forEach(a => {
    if (cfg.api && ouvert) { a.removeAttribute('aria-disabled'); a.href = '#etudiant'; }
    else { a.setAttribute('aria-disabled', 'true'); a.href = '#prix'; a.textContent = T('price.soon'); }
  });
  $$('[data-after]').forEach(el => { el.textContent = T(ouvert ? 'price.after.store' : 'price.after.soon'); });

  // Fin du lancement : tout repasse au prix normal, sans intervention.
  document.documentElement.classList.toggle('lancement-fini', etat.fini);
  if (etat.fini) {
    const normal = prix('29.95', l);
    $$('.offer-main .lt-price').forEach(el => el.setAttribute('data-lt', l === 'fr' ? '29,95' : '29.95'));
    $$('[data-price-now]').forEach(el => { el.textContent = normal; });
    $$('[data-i18n="hero.buy"], [data-i18n="try.ctab"], [data-buy="standard"]').forEach(el => {
      if (ouvert || el.dataset.buy !== 'standard') el.textContent = (l === 'fr' ? 'Acheter ' : 'Buy ') + normal;
    });
    $$('[data-i18n="final.p"]').forEach(el => { el.textContent = T('final.p.full'); });
    $$('[data-i18n="price.std.note"]').forEach(el => { el.textContent = ''; });
    const titre = $('[data-lt-key="lt.price"]');
    if (titre) titre.setAttribute('data-lt', T('lt.price.full'));
  } else if (etat.restant !== null) {
    $$('[data-i18n="price.std.note"]').forEach(el => { el.textContent = T('price.left').replace('{n}', etat.restant); });
  }
  const p = $('.previens');
  if (p) {
    p.hidden = !cfg.api;
    $('.previens-t', p).textContent = T(etat.fini ? 'notify.t.full' : 'notify.t');
  }
}

// ---------------------------------------------------------------- envoi au script
async function envoyer(donnees) {
  const r = await fetch(cfg.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(donnees) });
  return r.json();
}

function initPreviens() {
  const f = $('.previens');
  if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('.previens-msg', f), btn = $('button', f);
    btn.disabled = true; msg.textContent = '';
    try {
      const r = await envoyer({ action: 'previens', email: $('input', f).value, langue: langue() });
      msg.textContent = T(r.ok ? 'notify.ok' : 'form.err.email');
      if (r.ok) $('input', f).value = '';
    } catch { msg.textContent = T('form.err.net'); }
    btn.disabled = false;
  });
}

function initEtudiant() {
  const d = $('#etudiant');
  if (!d) return;
  $$('[data-buy="student"]').forEach(a => a.addEventListener('click', e => {
    if (a.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault();
    $('.etu-msg', d).textContent = '';
    d.showModal();
  }));
  $('.etu-fermer', d).addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  $('form', d).addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('.etu-msg', d), btn = $('button[type=submit]', d);
    const fichier = $('input[type=file]', d).files[0];
    if (fichier && fichier.size > 5e6) { msg.textContent = T('stu.err.size'); return; }
    btn.disabled = true; msg.textContent = T('stu.sending');
    try {
      let carte = null;
      if (fichier) {
        const b64 = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(fichier); });
        carte = { nom: fichier.name, type: fichier.type, donnees: b64 };
      }
      const r = await envoyer({ action: 'etudiant', email: $('input[type=email]', d).value, langue: langue(), carte });
      msg.textContent = !r.ok ? T('form.err.email') : T(r.etat === 'code' ? 'stu.ok.code' : r.etat === 'deja' ? 'stu.ok.deja' : 'stu.ok.verif');
    } catch { msg.textContent = T('form.err.net'); }
    btn.disabled = false;
  });
}
