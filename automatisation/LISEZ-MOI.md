# Final Touch : mise en place de la vente automatique

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

## 2. Une adresse Gmail dédiée (5 min, conseillé)

Les mails automatiques partent du compte Google qui installe le script. Pour ne jamais montrer ton adresse perso, crée une adresse rien que pour le plug (par exemple `finaltouchsound@gmail.com`) et fais les étapes 4 et 5 avec ce compte.

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

1. Sur script.google.com (avec le compte de l'étape 2) : Nouveau projet, nommé « Final Touch ventes ».
2. Colle le contenu de `Code.gs` à la place du code existant.
3. Paramètres du projet : coche « Afficher le fichier manifeste », puis remplace `appsscript.json` par celui de ce dossier.
4. Paramètres du projet → Propriétés du script, ajoute :
   - `LS_CLE` : la clé API ;
   - `LS_BOUTIQUE` : l'identifiant de la boutique ;
   - `LIEN_ACHAT` : le lien de paiement.
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
