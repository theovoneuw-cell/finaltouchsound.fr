/**
 * Final Touch : automatisation des ventes (Google Apps Script, application web).
 *
 * Ce que fait ce script, sans intervention :
 *   - reçoit les ventes de Lemon Squeezy (webhook « order_created »), les vérifie
 *     auprès de l'API, les inscrit dans le tableur et programme les mails de suivi ;
 *   - envoie les mails après achat (jour même, J+5, J+15) en français ou en anglais ;
 *   - tarif étudiant : adresse d'école reconnue -> code à usage unique créé et envoyé ;
 *     sinon la demande (avec la carte) arrive au propriétaire du script ;
 *   - « Préviens-moi » : garde les mails, prévient quand il reste peu de licences ;
 *   - compteur des licences de lancement pour le site (lu sur Lemon Squeezy).
 *
 * Mise en place : voir LISEZ-MOI.md (fonction installer(), puis déploiement).
 * Aucune adresse perso n'est écrite ici. Les mails partent de l'adresse de la propriété
 * EXPEDITEUR (ex. contact@finaltouchsound.fr, ajoutée dans Gmail comme « Envoyer en tant que »),
 * sinon du compte qui déploie le script.
 */

// ---------------------------------------------------------------- réglages
const CFG = {
  NOM: 'Final Touch',
  SITE: 'https://finaltouchsound.fr',
  LANCEMENT_CODE: 'LANCEMENT',
  LANCEMENT_MAX: 100,
  LANCEMENT_REMISE_CENTIMES: 1500,       // 29,95 € - 15 € = 14,95 €
  ALERTE_RESTANT: 20,                     // « il reste 20 licences » aux inscrits
  PRIX_NORMAL_CENTIMES: 2995,
  PRIX_ETUDIANT_CENTIMES: 1000,
  RELANCES_JOURS: [0, 5, 15],             // mails après achat
  // Domaines d'école reconnus automatiquement (expressions régulières sur la partie après @).
  ECOLES: [
    /(^|\.)edu$/, /(^|\.)ac\.[a-z]{2}$/, /(^|\.)edu\.[a-z]{2}$/,
    /(^|\.)ac-[a-z-]+\.fr$/, /(^|\.)univ-[a-z0-9-]+\.fr$/, /(^|\.)u-[a-z0-9-]+\.fr$/,
    /(^|\.)etu\.[a-z0-9.-]+$/, /(^|\.)etudiant\.[a-z0-9.-]+$/, /(^|\.)student\.[a-z0-9.-]+$/,
    /(^|\.)sorbonne-universite\.fr$/, /(^|\.)unice\.fr$/, /(^|\.)univ-cotedazur\.fr$/,
    /(^|\.)studio-m\.fr$/, /(^|\.)studiom\.fr$/,
  ],
};

const P = PropertiesService.getScriptProperties();
const prop = k => P.getProperty(k) || '';

// ---------------------------------------------------------------- entrées web
function doGet(e) {
  const a = (e.parameter.action || '').toLowerCase();
  if (a === 'compteur') return json(compteur());
  if (a === 'desinscription') return html(desinscrire(e.parameter.email, e.parameter.cle));
  return json({ ok: true });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData && e.postData.contents || '{}'); } catch (err) { body = {}; }

  // Webhook Lemon Squeezy : le jeton est dans l'adresse (Apps Script ne lit pas les en-têtes).
  if (e.parameter.source === 'lemonsqueezy') {
    if (e.parameter.jeton !== prop('WEBHOOK_JETON')) return json({ ok: false });
    return json(recevoirVente(body));
  }
  if (body.action === 'previens') return json(inscrire(body.email, body.langue));
  if (body.action === 'etudiant') return json(demandeEtudiant(body));
  return json({ ok: false, erreur: 'action' });
}

// ---------------------------------------------------------------- Lemon Squeezy
function ls(chemin, methode, charge) {
  const r = UrlFetchApp.fetch('https://api.lemonsqueezy.com/v1' + chemin, {
    method: methode || 'get',
    headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', Authorization: 'Bearer ' + prop('LS_CLE') },
    payload: charge ? JSON.stringify(charge) : undefined,
    muteHttpExceptions: true,
  });
  const code = r.getResponseCode();
  const txt = r.getContentText();
  if (code >= 300) throw new Error('Lemon Squeezy ' + code + ' ' + txt.slice(0, 300));
  return txt ? JSON.parse(txt) : {};
}

function creerRemise(nom, code, montant, type, max) {
  const r = ls('/discounts', 'post', { data: {
    type: 'discounts',
    attributes: { name: nom, code: code, amount: montant, amount_type: type, is_limited_redemptions: true, max_redemptions: max },
    relationships: { store: { data: { type: 'stores', id: String(prop('LS_BOUTIQUE')) } } },
  } });
  return r.data.id;
}

// ---------------------------------------------------------------- compteur
function compteur() {
  const cache = CacheService.getScriptCache();
  const vu = cache.get('compteur');
  if (vu) return JSON.parse(vu);
  let vendues = 0;
  try {
    const r = ls('/discount-redemptions?filter[discount_id]=' + idLancement() + '&page[size]=1');
    vendues = (r.meta && r.meta.page && r.meta.page.total) || 0;
  } catch (err) {
    vendues = feuille('Ventes').getRange('H2:H').getValues().filter(v => v[0] === CFG.LANCEMENT_CODE).length;
  }
  const res = { vendues: vendues, max: CFG.LANCEMENT_MAX, restant: Math.max(0, CFG.LANCEMENT_MAX - vendues) };
  cache.put('compteur', JSON.stringify(res), 300);
  return res;
}

// Identifiant de la remise LANCEMENT, retrouvé par son code (survit à une remise recréée).
function idLancement() {
  const vu = prop('LANCEMENT_ID');
  try { if (vu && ls('/discounts/' + vu).data.attributes.code === CFG.LANCEMENT_CODE) return vu; } catch (err) {}
  const liste = ls('/discounts?filter[store_id]=' + prop('LS_BOUTIQUE') + '&page[size]=100').data || [];
  const d = liste.find(x => x.attributes.code === CFG.LANCEMENT_CODE);
  if (!d) throw new Error('Remise ' + CFG.LANCEMENT_CODE + ' introuvable');
  P.setProperty('LANCEMENT_ID', String(d.id));
  return String(d.id);
}

// ---------------------------------------------------------------- ventes
function recevoirVente(evt) {
  const nom = evt.meta && evt.meta.event_name;
  if (nom !== 'order_created') return { ok: true, ignore: nom };
  const id = evt.data && evt.data.id;
  // On relit la commande à la source : un faux webhook ne passe pas.
  const commande = ls('/orders/' + id).data;
  const a = commande.attributes;
  if (a.status !== 'paid') return { ok: true, statut: a.status };

  const ventes = feuille('Ventes');
  const deja = ventes.getRange('B2:B').getValues().some(v => String(v[0]) === String(id));
  if (deja) return { ok: true, doublon: true };

  let code = '';
  try {
    const red = ls('/orders/' + id + '/discount-redemptions');
    if (red.data && red.data[0]) code = red.data[0].attributes.discount_code || '';
  } catch (err) {}

  const langue = langueDe(a.user_email, evt.meta.custom_data, a);
  ventes.appendRow([new Date(a.created_at), id, a.order_number, a.user_name, a.user_email,
    (a.total || 0) / 100, (a.tax || 0) / 100, code, a.currency, langue,
    a.first_order_item ? a.first_order_item.variant_name : '']);

  const relances = feuille('Relances');
  CFG.RELANCES_JOURS.forEach((j, i) => {
    const quand = new Date(Date.now() + j * 864e5);
    relances.appendRow([quand, a.user_email, a.user_name || '', langue, 'achat' + i, '']);
  });
  CacheService.getScriptCache().remove('compteur');
  try { envoyerRelances(); } catch (err) { noter('Relances', err); }
  try { verifierStock(); } catch (err) { noter('Stock', err); }
  return { ok: true };
}

function langueDe(email, custom, attrs) {
  if (custom && custom.langue) return custom.langue === 'en' ? 'en' : 'fr';
  return /\.(fr|be|ch|ca|lu)$/i.test(email || '') ? 'fr' : 'en';
}

// Tourne toutes les heures (déclencheur créé par installer()).
function envoyerRelances() {
  const f = feuille('Relances');
  const v = f.getDataRange().getValues();
  const maintenant = new Date();
  for (let i = 1; i < v.length; i++) {
    const [quand, email, nom, langue, modele, envoye] = v[i];
    if (envoye || !email || new Date(quand) > maintenant) continue;
    const m = MAILS[langue === 'en' ? 'en' : 'fr'][modele];
    if (!m) continue;
    try {
      envoyer(email, m.sujet, m.texte(prenom(nom)));
      f.getRange(i + 1, 6).setValue(new Date());
    } catch (err) { noter('Relance ' + modele + ' vers ' + email, err); }
  }
}

const prenom = n => String(n || '').trim().split(/\s+/)[0] || '';

// ---------------------------------------------------------------- étudiants
function estEcole(email) {
  const dom = String(email || '').toLowerCase().split('@')[1] || '';
  return CFG.ECOLES.some(re => re.test(dom));
}

function demandeEtudiant(b) {
  const email = String(b.email || '').trim().toLowerCase();
  const langue = b.langue === 'en' ? 'en' : 'fr';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erreur: 'email' };
  const f = feuille('Etudiants');
  const deja = f.getRange('B2:B').getValues().some(v => v[0] === email);
  if (deja) return { ok: true, etat: 'deja' };

  if (estEcole(email)) {
    const code = 'ETU-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    creerRemise('Étudiant ' + email, code, CFG.PRIX_NORMAL_CENTIMES - CFG.PRIX_ETUDIANT_CENTIMES, 'fixed', 1);
    const lien = prop('LIEN_ACHAT') + (prop('LIEN_ACHAT').includes('?') ? '&' : '?') + 'checkout[discount_code]=' + code + '&checkout[email]=' + encodeURIComponent(email);
    const m = MAILS[langue].etudiant;
    envoyer(email, m.sujet, m.texte(code, lien));
    f.appendRow([new Date(), email, 'auto', code, langue]);
    return { ok: true, etat: 'code' };
  }

  // Pas d'adresse d'école : la demande et la carte vont au propriétaire du script.
  let lienCarte = '';
  if (b.carte && b.carte.donnees) {
    const dossier = dossierCartes();
    const blob = Utilities.newBlob(Utilities.base64Decode(b.carte.donnees), b.carte.type || 'application/octet-stream', b.carte.nom || 'carte');
    lienCarte = dossier.createFile(blob).getUrl();
  }
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: '[Final Touch] Demande de tarif étudiant à vérifier : ' + email,
    body: 'Adresse : ' + email + '\nLangue : ' + langue + '\nCarte : ' + (lienCarte || 'aucune') +
      '\n\nPour accepter : ouvre le script et lance accepterEtudiant("' + email + '").',
    name: CFG.NOM,
  });
  f.appendRow([new Date(), email, 'à vérifier', lienCarte, langue]);
  return { ok: true, etat: 'verification' };
}

// À lancer à la main depuis l'éditeur pour une demande vérifiée.
function accepterEtudiant(email) {
  const f = feuille('Etudiants');
  const v = f.getDataRange().getValues();
  const i = v.findIndex(r => r[1] === email);
  const langue = i > 0 ? v[i][4] : 'fr';
  const code = 'ETU-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  creerRemise('Étudiant ' + email, code, CFG.PRIX_NORMAL_CENTIMES - CFG.PRIX_ETUDIANT_CENTIMES, 'fixed', 1);
  const lien = prop('LIEN_ACHAT') + (prop('LIEN_ACHAT').includes('?') ? '&' : '?') + 'checkout[discount_code]=' + code;
  const m = MAILS[langue === 'en' ? 'en' : 'fr'].etudiant;
  envoyer(email, m.sujet, m.texte(code, lien));
  if (i > 0) { f.getRange(i + 1, 3).setValue('accepté'); f.getRange(i + 1, 4).setValue(code); }
}

// Code de classe : à lancer à la main, à distribuer à tes élèves (ex. 30 utilisations).
function creerCodeClasse(nom, utilisations) {
  const code = 'CLASSE-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  creerRemise('Classe ' + (nom || ''), code, CFG.PRIX_NORMAL_CENTIMES - CFG.PRIX_ETUDIANT_CENTIMES, 'fixed', utilisations || 30);
  Logger.log('Code de classe : ' + code);
  return code;
}

function dossierCartes() {
  const id = prop('DOSSIER_CARTES');
  if (id) return DriveApp.getFolderById(id);
  const d = DriveApp.createFolder('Final Touch - cartes étudiantes');
  P.setProperty('DOSSIER_CARTES', d.getId());
  return d;
}

// ---------------------------------------------------------------- « Préviens-moi »
function inscrire(email, langue) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erreur: 'email' };
  const f = feuille('Inscrits');
  const deja = f.getRange('B2:B').getValues().some(v => v[0] === email);
  if (!deja) f.appendRow([new Date(), email, langue === 'en' ? 'en' : 'fr', 'actif']);
  return { ok: true };
}

function cle(email) {
  const sig = Utilities.computeHmacSha256Signature(email, prop('WEBHOOK_JETON'));
  return Utilities.base64EncodeWebSafe(sig).slice(0, 16);
}

function desinscrire(email, c) {
  email = String(email || '').toLowerCase();
  if (!email || c !== cle(email)) return 'Lien invalide.';
  const f = feuille('Inscrits');
  const v = f.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][1] === email) f.getRange(i + 1, 4).setValue('désinscrit');
  return 'C’est fait : tu ne recevras plus de mails de Final Touch. / Done: you won’t get any more emails from Final Touch.';
}

function lienDesinscription(email) {
  return ScriptApp.getService().getUrl() + '?action=desinscription&email=' + encodeURIComponent(email) + '&cle=' + cle(email);
}

// Une seule fois : quand il reste ALERTE_RESTANT licences de lancement.
function verifierStock() {
  if (prop('ALERTE_ENVOYEE')) return;
  const c = compteur();
  if (c.restant > CFG.ALERTE_RESTANT || c.restant === 0) return;
  P.setProperty('ALERTE_ENVOYEE', '1');
  diffuser(l => MAILS[l].stock.sujet(c.restant), (l, email) => MAILS[l].stock.texte(c.restant, lienDesinscription(email)));
}

// À lancer à la main pour annoncer une mise à jour à tous les inscrits.
function annoncerMiseAJour(version, nouveautesFr, nouveautesEn) {
  diffuser(l => MAILS[l].maj.sujet(version), (l, email) => MAILS[l].maj.texte(version, l === 'en' ? nouveautesEn : nouveautesFr, lienDesinscription(email)));
}

function diffuser(sujet, texte) {
  const v = feuille('Inscrits').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    const [, email, langue, etat] = v[i];
    if (etat !== 'actif' || !email) continue;
    const l = langue === 'en' ? 'en' : 'fr';
    envoyer(email, sujet(l), texte(l, email));
  }
}

// Journal des erreurs, dans l'onglet « Journal » du tableur.
function noter(ou, err) {
  feuille('Journal').appendRow([new Date(), ou, String(err && err.stack || err)]);
}

// Adresses « Envoyer en tant que » reconnues par Gmail pour ce compte.
function listerAlias() { Logger.log('Alias Gmail : ' + JSON.stringify(GmailApp.getAliases())); }

// À lancer depuis l'éditeur : envoie un mail d'essai à l'adresse d'expédition.
function testerMail() {
  const de = prop('EXPEDITEUR') || Session.getEffectiveUser().getEmail();
  envoyer(de, 'Final Touch : mail d’essai', 'Si tu lis ceci, les mails automatiques fonctionnent.');
  Logger.log('Mail d’essai envoyé à ' + de);
}

// ---------------------------------------------------------------- mails
function envoyer(to, sujet, corps) {
  const de = prop('EXPEDITEUR');
  if (de) GmailApp.sendEmail(to, sujet, corps, { from: de, name: CFG.NOM, replyTo: de });
  else MailApp.sendEmail({ to: to, subject: sujet, body: corps, name: CFG.NOM });
}

const MAILS = {
  fr: {
    achat0: { sujet: 'Final Touch : installation et premiers pas', texte: p => `Salut${p ? ' ' + p : ''},

Merci pour ton achat. Le lien de téléchargement est dans le mail de Lemon Squeezy (Mac et Windows).

Installation : à la première ouverture, ton ordinateur affiche un message de sécurité, c'est normal.
- Mac : Réglages Système > Confidentialité et sécurité > « Ouvrir quand même ».
- Windows : « Informations complémentaires » > « Exécuter quand même ».

Trois conseils pour bien démarrer :
1. Pose Final Touch en dernier sur le master, et lance la lecture sur un passage plein (le refrain) avant de cliquer sur Listen.
2. Compare avec Before / After : les deux jouent au même volume, fie-toi au son, pas au niveau.
3. Avant d'exporter, vérifie que After est actif et que Monitor est sur Studio.

Le mode d'emploi complet est dans le téléchargement.

Bonne session,
Final Touch` },
    achat1: { sujet: 'Tu peux m’envoyer ton avant/après ?', texte: p => `Salut${p ? ' ' + p : ''},

Ça fait quelques jours que tu as Final Touch. Si tu as un son passé dedans, envoie-moi 20 secondes avant/après en réponse à ce mail (un lien suffit).

Avec ton accord, je le partage sur les réseaux avec ton nom d'artiste.

Final Touch` },
    achat2: { sujet: 'Une phrase sur Final Touch ?', texte: p => `Salut${p ? ' ' + p : ''},

Une dernière chose : en une phrase, qu'est-ce que Final Touch a changé pour toi ? Réponds simplement à ce mail, avec le nom que tu veux voir affiché (prénom, nom d'artiste, studio).

Les meilleures réponses iront sur le site.

Merci,
Final Touch` },
    etudiant: { sujet: 'Ton code étudiant Final Touch', texte: (code, lien) => `Salut,

Voici ton code étudiant, valable une fois : ${code}

Il ramène Final Touch à 10 €. Le lien ci-dessous l'applique directement :
${lien}

Bonne prod,
Final Touch` },
    stock: { sujet: n => `Plus que ${n} licences Final Touch à 14,95 €`, texte: (n, desinscr) => `Salut,

Il reste ${n} licences au prix de lancement (14,95 € au lieu de 29,95 €). Ensuite, le prix repasse à 29,95 €.

${CFG.SITE}

Final Touch

Ne plus recevoir ces mails : ${desinscr}` },
    maj: { sujet: v => `Final Touch ${v} est disponible`, texte: (v, nouveautes, desinscr) => `Salut,

La version ${v} de Final Touch est sortie.

${nouveautes || ''}

${CFG.SITE}

Final Touch

Ne plus recevoir ces mails : ${desinscr}` },
  },
  en: {
    achat0: { sujet: 'Final Touch: install and first steps', texte: p => `Hi${p ? ' ' + p : ''},

Thanks for your purchase. The download link is in the Lemon Squeezy email (Mac and Windows).

Install: the first time, your computer shows a security message. That's expected.
- Mac: System Settings > Privacy & Security > "Open Anyway".
- Windows: "More info" > "Run anyway".

Three tips to get started:
1. Put Final Touch last on the master, and play a full section (the hook) before clicking Listen.
2. Compare with Before / After: both play at the same loudness, so trust the sound, not the level.
3. Before bouncing, check that After is on and Monitor is set to Studio.

The full manual is in the download.

Have a good session,
Final Touch` },
    achat1: { sujet: 'Can you send me your before/after?', texte: p => `Hi${p ? ' ' + p : ''},

You've had Final Touch for a few days. If you've run a track through it, reply with 20 seconds of before/after (a link is fine).

With your permission, I'll share it on social media with your artist name.

Final Touch` },
    achat2: { sujet: 'One sentence about Final Touch?', texte: p => `Hi${p ? ' ' + p : ''},

One last thing: in one sentence, what did Final Touch change for you? Just reply to this email, with the name you'd like shown (first name, artist name, studio).

The best answers will go on the website.

Thanks,
Final Touch` },
    etudiant: { sujet: 'Your Final Touch student code', texte: (code, lien) => `Hi,

Here is your student code, valid once: ${code}

It brings Final Touch down to €10. The link below applies it for you:
${lien}

Enjoy,
Final Touch` },
    stock: { sujet: n => `Only ${n} Final Touch licenses left at €14.95`, texte: (n, desinscr) => `Hi,

${n} licenses are left at the launch price (€14.95 instead of €29.95). After that, the price goes back to €29.95.

${CFG.SITE}

Final Touch

Unsubscribe: ${desinscr}` },
    maj: { sujet: v => `Final Touch ${v} is out`, texte: (v, nouveautes, desinscr) => `Hi,

Final Touch version ${v} is out.

${nouveautes || ''}

${CFG.SITE}

Final Touch

Unsubscribe: ${desinscr}` },
  },
};

// ---------------------------------------------------------------- tableur
const ENTETES = {
  Ventes: ['Date', 'Commande', 'Numéro', 'Nom', 'Email', 'Total', 'TVA', 'Code', 'Devise', 'Langue', 'Licence'],
  Relances: ['À envoyer le', 'Email', 'Nom', 'Langue', 'Modèle', 'Envoyé le'],
  Inscrits: ['Date', 'Email', 'Langue', 'État'],
  Etudiants: ['Date', 'Email', 'Statut', 'Code ou carte', 'Langue'],
  Journal: ['Date', 'Où', 'Erreur'],
};

function classeur() {
  const id = prop('CLASSEUR');
  if (id) return SpreadsheetApp.openById(id);
  const c = SpreadsheetApp.create('Final Touch - ventes');
  P.setProperty('CLASSEUR', c.getId());
  return c;
}

function feuille(nom) {
  const c = classeur();
  let f = c.getSheetByName(nom);
  if (!f) { f = c.insertSheet(nom); f.appendRow(ENTETES[nom]); f.setFrozenRows(1); }
  return f;
}

// ---------------------------------------------------------------- mise en place
/**
 * À lancer une fois, après avoir rempli les propriétés du script :
 *   LS_CLE (clé API Lemon Squeezy), LS_BOUTIQUE (identifiant de la boutique),
 *   LIEN_ACHAT (lien de paiement de la licence, sans code).
 * Crée le tableur, le jeton du webhook, le code LANCEMENT et le déclencheur horaire.
 */
function installer() {
  ['LS_CLE', 'LS_BOUTIQUE', 'LIEN_ACHAT'].forEach(k => { if (!prop(k)) throw new Error('Propriété manquante : ' + k); });
  Object.keys(ENTETES).forEach(feuille);
  const premiere = classeur().getSheetByName('Feuille 1') || classeur().getSheetByName('Sheet1');
  if (premiere) classeur().deleteSheet(premiere);
  if (!prop('WEBHOOK_JETON')) P.setProperty('WEBHOOK_JETON', Utilities.getUuid().replace(/-/g, ''));
  if (!prop('LANCEMENT_ID')) {
    const id = creerRemise('Lancement (100 premières licences)', CFG.LANCEMENT_CODE, CFG.LANCEMENT_REMISE_CENTIMES, 'fixed', CFG.LANCEMENT_MAX);
    P.setProperty('LANCEMENT_ID', String(id));
  }
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('envoyerRelances').timeBased().everyHours(1).create();
  Logger.log('Tableur : ' + classeur().getUrl());
  Logger.log('Après le déploiement, adresse du webhook : <URL /exec>?source=lemonsqueezy&jeton=' + prop('WEBHOOK_JETON'));
}

// ---------------------------------------------------------------- outils
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function html(t) { return HtmlService.createHtmlOutput('<p style="font:16px system-ui;padding:24px">' + t + '</p>'); }
