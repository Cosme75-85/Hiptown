# Réservation d'espaces — Apps Script

Code source du module de réservation de salles (web app Google Apps Script),
ouvert depuis la tuile « Réserver une salle » du portail client (`app.js`).
Il sert aussi la tuile « Réserver une salle de réunion » de l'espace coworking
(page intégrée au portail, `resa-coworking.js`).

| Fichier | Rôle | À copier dans Apps Script |
|---|---|---|
| `Config.gs` | **Tout ce qui se règle** : espaces, agendas, horaires, tarifs, emails | ✅ |
| `Code.gs` | La logique : disponibilités, demandes, emails, approbation | ✅ |
| `Devis.gs` | Devis PDF joint à l'email de confirmation | ✅ |
| `Remerciement.gs` | Email de remerciement envoyé 3 jours après la réservation | ✅ |
| `Coworking.gs` | Réservations des coworkers depuis le portail (sans paiement) | ✅ |
| `Tests.gs` | Fonctions de diagnostic à lancer à la main (dont `testDevis`) | ✅ |
| `Index.html` | La page affichée au client | ✅ |
| `appsscript.json` | Réglages du projet (fuseau horaire, accès) — déjà en place | ❌ |
| `README.md` | Ce mode d'emploi | ❌ |

## Mettre à jour Apps Script avec cette version

Le code qui tourne est celui de script.google.com : ce dossier en est la copie
de référence (historique, retour arrière possible). Après chaque modification :

1. Ouvrir le projet sur script.google.com.
2. Pour chacun des 7 fichiers marqués ✅ ci-dessus : ouvrir le fichier du même nom
   dans Apps Script (le créer avec **+ > Script** s'il n'existe pas, sans taper « .gs »),
   tout sélectionner (Ctrl+A), supprimer, coller le contenu du fichier GitHub.
3. Vérifier qu'il n'y a **pas d'autre fichier .gs** que ceux-là : deux fichiers qui
   déclarent la même constante provoquent l'erreur « already been declared ».
4. Enregistrer (Ctrl+S).
5. **Déployer > Gérer les déploiements > ✏️ (crayon) > Version : Nouvelle version > Déployer**
   (modifier le déploiement existant garde la même URL, donc le lien du portail reste valable).

**Une seule fois** : activer le service avancé Google Agenda (lecture des disponibilités
bien plus rapide) : dans l'éditeur, colonne de gauche **Services > +**, choisir
**Google Calendar API**, laisser l'identifiant `Calendar`, cliquer sur **Ajouter**.
`testPerformance` (fichier `Tests.gs`) indique s'il est actif et mesure les temps de lecture.

**Une seule fois** : dans le menu déroulant des fonctions, choisir `installExpiryTrigger`,
cliquer sur ▶ Exécuter et accepter les autorisations (purge nocturne des demandes expirées).

### Option avancée — clasp (outil officiel Google, gratuit)
Remplace les étapes 1 à 4 par une commande.

```bash
npm install -g @google/clasp
clasp login
# Dans ce dossier, créer .clasp.json (ID : Paramètres du projet Apps Script > "ID du script")
echo '{"scriptId":"TON_ID_DE_SCRIPT","rootDir":"."}' > .clasp.json
clasp push
```

## Devis automatiques

À l'approbation d'une demande, un devis PDF est créé, joint à l'email de confirmation
du client et copié dans le dossier Drive « Devis réservations Hiptown » (créé tout seul).

- Numéro : `NABO06` + date du jour (`JJMMAAAA`), puis `1`, `2`, `3`… pour les devis
  suivants du même jour (ex. `NABO0625092026`, `NABO06250920261`).
- TVA de 20 % sur toutes les lignes ; échéance à 30 jours.
- Textes du devis (mentions, contact, conditions) : objet `DEVIS` dans `Config.gs`.
- Aperçu : lancer `testDevis` (fichier `Tests.gs`) — un devis d'exemple arrive par email.
- Les demandes créées avant cette version n'ont pas de devis automatique.


## Email de remerciement (3 jours après)

Chaque matin vers 10h, les clients dont la réservation **confirmée** s'est terminée
il y a 3 jours reçoivent un email de remerciement avec un bouton vers les avis Google.
Un texte par espace, modifiable dans `Config.gs` (objet `THANKS`) ; le délai, l'heure
et le lien d'avis s'y règlent aussi. Formule d'appel : « Bonjour Madame Dupont, »
(civilité demandée dans le formulaire), ou « Bonjour Marie, » pour les demandes plus anciennes.

Mise en route, **une seule fois**, dans le menu déroulant des fonctions (▶ Exécuter) :
1. `testThankYouEmails` : un exemple de chaque texte arrive sur votre adresse (aucun client contacté).
2. `previewThankYouEmails` : le journal liste les clients qui recevraient l'email aujourd'hui, sans rien envoyer.
3. `installThanksTrigger` : l'envoi automatique démarre. `uninstallThanksTrigger` l'arrête.


## Réservation depuis l'espace coworking

Les comptes **Coworking** du portail (et l'équipe Hiptown) ont une tuile
« Réserver une salle de réunion » : les 4 salles de réunion, dans les **mêmes agendas**
que les réservations externes. Pas de prix, pas de devis, pas de validation :
la réservation est confirmée tout de suite (événement bleu « [COWORKING] … » dans
l'agenda) et la personne reçoit un email de confirmation avec un mot de remerciement.
Pas d'email de remerciement 3 jours après pour ces réservations.

Le serveur vérifie le compte : le portail envoie le jeton de connexion Firebase, et
`Coworking.gs` relit la fiche du compte dans Firestore avec ce jeton. Seuls les comptes
validés « coworking » ou « admin » peuvent réserver (réglage `COWORKING` dans `Config.gs`).

**Crédits** : chaque réservation d'un coworker coûte des crédits selon le barème
`COWORKING.credits` de `Config.gs`. Le plafond mensuel est le champ « Nombre de crédits »
de la fiche entreprise du portail. Le solde n'est stocké nulle part : il est recalculé
depuis les agendas (crédits des réservations de l'entreprise qui commencent dans le mois).
Il repart donc du plafond chaque mois sans cumul, et supprimer une réservation dans
l'agenda rend ses crédits. L'équipe Hiptown (rôle admin) réserve sans crédits.

**Annuler ou modifier** : la tuile affiche « Mes réservations à venir ». Chacun peut y
annuler ou déplacer (date, horaires, nombre de personnes) **ses propres** réservations,
tant qu'elles n'ont pas commencé, sans passer par l'équipe. Le serveur revérifie que la
réservation appartient bien au compte (tag `portalUid`), que le nouveau créneau est libre
et que les crédits suffisent (ceux de l'ancien créneau sont rendus d'abord). Un email
confirme chaque annulation ou modification. La salle reste la même : pour changer de salle,
on annule puis on réserve à nouveau.

Mise en route, **une seule fois** après avoir copié les fichiers :
1. Dans le menu déroulant des fonctions, choisir `testCoworkingSetup`, cliquer sur ▶ Exécuter
   et **accepter la nouvelle autorisation** (« se connecter à un service externe » : c'est
   l'accès à Firestore). Le journal doit afficher les 4 salles et « Firestore joignable ».
2. Déployer une nouvelle version (étape 5 ci-dessus). Sans ce déploiement, la tuile du
   portail affiche « Impossible de charger les salles ».
