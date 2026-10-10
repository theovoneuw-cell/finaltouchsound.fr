// Branchements de la vente. Tant que c'est vide, le site affiche « Bientôt disponible »
// et masque les formulaires. Voir automatisation/LISEZ-MOI.md.
window.FT_CONFIG = {
  // Lien de paiement Lemon Squeezy de la licence (sans code). Le site ajoute LANCEMENT
  // tant qu'il reste des licences de lancement.
  checkout: '',
  // Adresse /exec de l'application Google Apps Script (automatisation/Code.gs).
  api: '',
  lancement: { code: 'LANCEMENT', max: 100 },
  manual: { fr: 'assets/docs/Final-Touch-Mode-d-emploi-FR.pdf', en: 'assets/docs/Final-Touch-Manual-EN.pdf' },
};

// Test en local uniquement : ajoute ?maquette (ou ?maquette=fini) à l'adresse.
(() => {
  const q = new URLSearchParams(location.search);
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !q.has('maquette')) return;
  window.FT_CONFIG.checkout = 'https://exemple.lemonsqueezy.com/buy/maquette';
  window.FT_CONFIG.api = '/__api/' + (q.get('maquette') === 'fini' ? 'fini' : 'normal');
})();
