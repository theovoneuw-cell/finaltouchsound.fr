# Final Touch : mise en place de la vente automatique

## Où on en est (10/10/2026)

Tout fonctionne **en mode test** et a été vérifié par un achat test complet : paiement à 14,95 € avec le code LANCEMENT, vente inscrite dans le tableur, compteur à 1/100, mail de bienvenue reçu depuis `Final Touch <contact@finaltouchsound.fr>`.

- Boutique Lemon Squeezy : « Final Touch » (identifiant 494444), produit 1428311 à 29,95 € TTC, fichiers dmg, exe et PDF joints, adresse de contact `contact@finaltouchsound.fr`.
- Code LANCEMENT : −15 € fixe (29,95 → 14,95 €), 100 utilisations.
- Script Google « Final Touch ventes » sur le compte de Théo, déployé en application web ; tableur « Final Touch - ventes » sur son Drive.
- Webhook Lemon Squeezy `order_created` → script.
- Mails : redirection OVH `contact@` → Gmail, Gmail « Envoyer en tant que » `contact@finaltouchsound.fr` (via smtp.gmail.com), filtre Gmail « jamais en spam » pour `contact@`.
- Les secrets (clé API) ne sont que dans les propriétés du script et dans `automatisation/.secrets/` sur le Mac (exclu de Git).

## Passer en réel (quand la boutique est activée)

1. **Théo** : Lemon Squeezy → *Activate your store* (identité, SIREN, RIB) et attendre la validation.
2. Ensuite (Claude peut le faire) :
   - copier le produit en mode réel (bouton *Copy to live mode* sur la fiche produit) ;
   - créer une clé API **réelle** et la mettre dans la propriété `LS_CLE`, mettre le lien de paiement réel dans `LIEN_ACHAT`, effacer `LANCEMENT_ID` puis relancer `installer()` (crée le code LANCEMENT réel) ;
   - recréer le webhook en mode réel vers la même adresse ;
   - supprimer les lignes de test du tableur ;
   - brancher le site : `checkout` et `api` dans `public/js/config.js`, puis publier ;
   - supprimer la clé API de test dans Lemon Squeezy.

---

À faire une seule fois. Compter une heure. Ensuite, tout tourne sans toi.

## 1. Le domaine finaltouchsound.fr (OVH, 5 min)

Dans l'espace client OVH : Noms de domaine → finaltouchsound.fr → Zone DNS. Supprime les enregistrements A et AAAA existants de la racine et du `www`, puis ajoute :

| Type | Sous-domaine | Cible |
|---|---|---|
| A | (vide) | 185.199.108.153 |
| A | (vide) | 185.199.109.153 |
| A | (vide) | 185.199.110.153 |
| A | (vide) | 185.199.111.153 |
| CNAME | www | theovoneuw-cell.github.io. |

La propagation prend de quelques minutes à quelques heures. Le HTTPS s'active ensuite tout seul.

## 2. L'adresse contact@finaltouchsound.fr (10 min)

Les acheteurs ne voient jamais ton adresse perso : tous les mails partent de `contact@finaltouchsound.fr`.

1. **Créer la boîte chez OVH** : Web Cloud → E-mails → finaltouchsound.fr → Créer une adresse e-mail → `contact`, avec un mot de passe. (L'offre e-mail fournie avec le domaine suffit.)
2. **L'ajouter à ton Gmail actuel** : Gmail → Paramètres (roue dentée) → Voir tous les paramètres → Comptes et importation → « Envoyer des e-mails en tant que » → Ajouter une autre adresse.
   - Nom : `Final Touch` ; adresse : `contact@finaltouchsound.fr` ; décoche « Traiter comme un alias ».
   - Serveur SMTP : `ssl0.ovh.net`, port `465`, connexion SSL ; identifiant : `contact@finaltouchsound.fr` ; mot de passe : celui de la boîte.
   - Gmail envoie un code de confirmation dans la boîte OVH (webmail : mail.ovh.net). Recopie-le.
3. Pour lire les réponses des acheteurs dans Gmail (facultatif) : même page, « Consulter d'autres comptes » → ajouter `contact@finaltouchsound.fr`, serveur POP `pop3.mail.ovh.net`, port 995, SSL.

Le script s'installe ensuite sur ton compte Google habituel.

## 3. Lemon Squeezy (20 min)

1. Crée le compte sur lemonsqueezy.com, puis la boutique en euros. Renseigne ton identité et ton RIB (vérification par Lemon Squeezy).
2. Produit « Final Touch », prix **29,95 €**, prix TTC (option « Tax inclusive »).
3. Fichiers du produit : `Final-Touch-1.0.0-Mac.dmg`, `Final-Touch-1.0.0-Windows.exe` (dans `~/Documents/Touche-Finale/dist/`) et les deux PDF du mode d'emploi.
4. Récupère trois informations :
   - le **lien de paiement** du produit (bouton Share) ;
   - l'**identifiant de la boutique** (Settings → Stores, le numéro) ;
   - une **clé API** (Settings → API → nouvelle clé). Elle est secrète : elle ne va que dans le script, jamais sur le site.

Ne crée pas le code LANCEMENT à la main : le script le crée (−50 %, 100 utilisations).

## 4. Le script Google (15 min)

1. Sur script.google.com (ton compte Google habituel) : Nouveau projet, nommé « Final Touch ventes ».
2. Colle le contenu de `Code.gs` à la place du code existant.
3. Paramètres du projet : coche « Afficher le fichier manifeste », puis remplace `appsscript.json` par celui de ce dossier.
4. Paramètres du projet → Propriétés du script, ajoute :
   - `LS_CLE` : la clé API ;
   - `LS_BOUTIQUE` : l'identifiant de la boutique ;
   - `LIEN_ACHAT` : le lien de paiement ;
   - `EXPEDITEUR` : `contact@finaltouchsound.fr`.
5. Dans l'éditeur, choisis la fonction `installer` et clique sur Exécuter. Accepte les autorisations. Le journal affiche l'adresse du tableur et le jeton du webhook.
6. Déployer → Nouveau déploiement → Application web. Exécuter en tant que : moi. Accès : tout le monde. Copie l'adresse qui finit par `/exec`.

## 5. Le webhook Lemon Squeezy (3 min)

Settings → Webhooks → nouveau :
- URL : l'adresse `/exec` suivie de `?source=lemonsqueezy&jeton=` et du jeton affiché à l'étape 4.5 ;
- événement : `order_created` ;
- « Signing secret » : n'importe quel mot (le script vérifie chaque commande auprès de Lemon Squeezy).

## 6. Brancher le site (1 min)

Donne-moi le lien de paiement et l'adresse `/exec`, ou colle-les dans `public/js/config.js` (`checkout` et `api`). Les boutons « Bientôt disponible » deviennent des boutons d'achat, le compteur et les formulaires apparaissent.

Fais un achat en mode test de Lemon Squeezy pour vérifier : la vente doit arriver dans le tableur, et le mail du jour même dans la boîte de l'acheteur.

---

## Au quotidien

Rien. Les ventes, les factures, les téléchargements, les mails de suivi (jour même, J+5, J+15), les codes étudiants et le compteur se font seuls. À 100 licences vendues, le site repasse tout seul à 29,95 €, et les inscrits reçoivent un rappel quand il en reste 20.

**Les seules actions à la main**, depuis l'éditeur du script (choisis la fonction, puis Exécuter) :
- `accepterEtudiant("adresse@exemple.fr")` : quand tu as vérifié une carte étudiante (tu reçois un mail « Demande de tarif étudiant à vérifier » avec le lien de la carte) ;
- `creerCodeClasse("3e année", 30)` : un code à 10 € pour toute une classe, affiché dans le journal ;
- `annoncerMiseAJour("1.1", "Nouveautés en français", "What's new in English")` : un mail à tous les inscrits.

Le tableur « Final Touch - ventes » contient les ventes (pour tes déclarations et Ma Compta), les relances, les inscrits et les demandes étudiantes.

**Écoles reconnues automatiquement** : adresses en .edu, ac-…, univ-…, u-…, etu.…, etudiant.…, student.…, et quelques écoles listées dans `CFG.ECOLES` en haut de `Code.gs`. Pour en ajouter une, ajoute une ligne à cette liste et redéploie (Déployer → Gérer les déploiements → nouvelle version).

## Les vidéos pour les réseaux

Dépose un son dans **Bureau → Final Touch - Vidéos → À traiter**. Une minute plus tard, deux vidéos verticales (FR et EN) sont dans **Prêtes**, et le son part dans **Traités**. Une notification te prévient.

- **Uniquement tes propres sons** (tes prods, tes beats) **ou des sons libres de droits**. Jamais le morceau d'un client.
- Style dans le nom entre crochets : `Ma prod [Trap].wav`. Sans crochets : Rap.
- Nom d'artiste affiché : la partie avant « - » dans le nom du fichier (`Mon blase - Titre.wav`).

Pour publier, programme les vidéos du mois d'un coup dans Meta Business Suite (business.facebook.com), gratuit, pour Instagram et Facebook.

## Les mises à jour du plug

- **Windows** : chaque envoi sur GitHub (`~/Documents/Touche-Finale`) refabrique l'installeur. Il se télécharge dans l'onglet Actions du dépôt `final-touch-plugin`.
- **Mac** : `bash package-mac.sh` dans `~/Documents/Touche-Finale`.
- **Le site** : chaque envoi sur GitHub (`~/Sites/final-touch`) le remet en ligne.

Remplace ensuite les fichiers du produit dans Lemon Squeezy, puis lance `annoncerMiseAJour`.
