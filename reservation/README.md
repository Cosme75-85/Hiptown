# Réservation d'espaces — Apps Script

Code source du module de réservation de salles (web app Google Apps Script),
ouvert depuis la tuile « Réserver une salle » du portail client (`app.js`).
Il sert aussi la tuile « Réserver une salle de réunion » de l'espace coworking
(page intégrée au portail, `resa-coworking.js`).

| Fichier | Rôle | À copier dans Apps Script |
|---|---|---|
| `Config.gs` | **Tout ce qui se règle** : horaires, tarifs de départ des services, emails, liste initiale des espaces | ✅ |
| `Salles.gs` | Liste des salles gérée depuis le portail (ajout, modification, retrait, indisponibilités) | ✅ |
| `Services.gs` | Services en option (ajout, prix, clients concernés, retrait), gérés depuis le portail | ✅ |
| `Code.gs` | La logique : disponibilités, demandes, emails, approbation | ✅ |
| `Devis.gs` | Devis PDF joint à l'email de confirmation | ✅ |
| `Remerciement.gs` | Email de remerciement envoyé 3 jours après la réservation | ✅ |
| `Coworking.gs` | Réservations des coworkers depuis le portail (sans paiement) | ✅ |
| `Reductions.gs` | Réductions clients appliquées au prochain devis | ✅ |
| `MesReservations.gs` | Liste « Mes prochaines réservations » du tableau de bord du portail (lecture seule) | ✅ |
| `Tests.gs` | Fonctions de diagnostic à lancer à la main (dont `testDevis`) | ✅ |
| `Index.html` | La page affichée au client | ✅ |
| `appsscript.json` | Réglages du projet (fuseau horaire, accès) — déjà en place | ❌ |
| `README.md` | Ce mode d'emploi | ❌ |

## Mettre à jour Apps Script avec cette version

Le code qui tourne est celui de script.google.com : ce dossier en est la copie
de référence (historique, retour arrière possible). Après chaque modification :

1. Ouvrir le projet sur script.google.com.
2. Pour chacun des 10 fichiers marqués ✅ ci-dessus : ouvrir le fichier du même nom
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

## Gestion des salles (portail : Gestion > Salles de réunion)

L'équipe Hiptown gère les salles depuis le portail, sans toucher au code :

- **Ajouter** une salle : nom, catégorie, photo, personnes max, tarifs, couleur, réservable
  sur plusieurs jours, proposée ou non aux coworkers (avec son barème en crédits).
  Agenda Google : coller l'identifiant d'un agenda existant (partagé avec le compte qui fait
  tourner l'outil), ou laisser vide pour qu'un agenda soit créé automatiquement.
  L'agenda d'une salle ne se change plus ensuite (ses réservations y sont rangées).
- **Modifier** une salle : tout sauf l'agenda. Visible au prochain chargement de la page de réservation.
- **Retirer** une salle : elle n'est plus proposée, mais ses réservations déjà faites sont
  conservées (agenda, liens de validation, devis, « Mes réservations »). « Remettre en ligne » l'annule.
- **Indisponibilités** : périodes (premier et dernier jour inclus) pendant lesquelles la salle
  est affichée « Fermé » et toute nouvelle réservation est refusée, sur le site public comme
  dans l'espace coworking. Les réservations déjà faites ne sont pas annulées : le portail
  indique combien il y en a sur la période. Les périodes terminées disparaissent toutes seules.

Au premier démarrage, la liste vient de `DEFAULT_SPACES` dans `Config.gs` (les dates
`availableFrom` y deviennent des indisponibilités). Dès le premier enregistrement depuis le
portail, la liste est gardée dans les propriétés du script et `DEFAULT_SPACES` ne sert plus.
Une salle ajoutée depuis le portail reçoit l'email de remerciement générique (`THANKS.default`).

## Devis automatiques

À l'approbation d'une demande, un devis PDF est créé, joint à l'email de confirmation
du client et copié dans le dossier Drive « Devis réservations Hiptown » (créé tout seul).

- Numéro : `NABO06` + date du jour (`JJMMAAAA`), puis `1`, `2`, `3`… pour les devis
  suivants du même jour (ex. `NABO0625092026`, `NABO06250920261`).
- TVA de 20 % sur toutes les lignes ; échéance à 30 jours.
- Textes du devis (mentions, contact, conditions) : objet `DEVIS` dans `Config.gs`.
- Aperçu : lancer `testDevis` (fichier `Tests.gs`) — un devis d'exemple arrive par email.
- Les demandes créées avant cette version n'ont pas de devis automatique.

**Qui reçoit quoi :**
- client salle de réunion : devis de la salle **et** des services, envoyé quand l'équipe de la
  ville a approuvé la demande ;
- coworker : devis des **services seuls** (la salle est sur ses crédits), envoyé quand l'équipe
  de la ville l'a validé (voir « Restauration » plus bas).

**Validation par l'équipe de la ville** : les demandes de salle et les services des coworkers
partent à `<ville>@hiptown.com` (ex. `bordeaux@hiptown.com`), d'après la ville de la salle.
Le domaine se règle dans `CITY_TEAM_EMAIL_DOMAIN` (`Config.gs`). Pensez à créer la boîte (ou
l'alias) de chaque ville avant d'y ouvrir des salles.

**Devis faits à la main** (portail : **Gestion > Devis**, équipe Hiptown) : pour un coworker
(services seuls) ou un client salle de réunion (salle et services), envoyé au choix au client
(copie à son auteur et à l'équipe de la ville, le client répond à l'auteur) ou à son auteur seul.
L'admin d'une ville ne fait des devis que pour ses salles. Rien n'est réservé dans l'agenda.


## Réductions clients (prochain devis)

Depuis le portail : **Gestion > Réductions clients** (équipe Hiptown). On saisit l'email du
client, le type de remise (sur la totalité, sur la salle, sur le petit déjeuner, sur le déjeuner,
ou petit déjeuner offert), le pourcentage (-10 %, -15 %…, maximum `DISCOUNTS.maxPercent` dans
`Config.gs`) et un motif interne. Les types se règlent dans `DISCOUNTS.kinds`. Une remise sur un
repas (ou sur la salle, pour un coworker qui la paie en crédits) attend un devis où cette ligne existe. La remise est gardée en mémoire et appliquée automatiquement au **prochain devis**
envoyé à cet email :

- réservation de salle : quand la demande est validée, le devis comporte une ligne
  « Remise commerciale salle (-10 %) » (ou « Petit déjeuner offert »…) et l'email de confirmation le mentionne ; l'email de
  validation reçu par le gérant signale la réduction en attente ;
- coworker : sur le devis de ses prochains repas (gardée si la réservation est modifiée).

Une fois utilisée, elle passe dans « Déjà utilisées » (date, n° de devis, réservation).
Une réduction en attente peut être retirée tant qu'elle n'a pas servi.

## Email de remerciement (3 jours après)

Chaque matin vers 10h, les clients dont la réservation **confirmée** s'est terminée
il y a 3 jours reçoivent un email de remerciement avec un bouton vers les avis Google.
Un texte par espace, modifiable dans `Config.gs` (objet `THANKS`) ; le délai, l'heure
et le lien d'avis s'y règlent aussi. Formule d'appel : « Bonjour Madame Dupont, »
(civilité demandée dans le formulaire), ou « Bonjour Marie, » pour les demandes plus anciennes.

**Restauration** (à commander au moins `COWORKING.mealsNoticeHours` = 24h avant) : en réservant ou en modifiant, un coworker peut ajouter petit déjeuner et/ou
déjeuner (tarifs `PRICES` de `Config.gs`). Dès qu'un service est choisi, un devis « services seuls »
(la salle reste sur crédits) est préparé, copié dans le dossier Drive des devis et envoyé à
l'équipe de la ville (`<ville>@hiptown.com`) avec deux boutons : **Valider et envoyer le devis**
(le coworker le reçoit alors par email) ou **Refuser les services** (le coworker est prévenu,
sa salle reste réservée). Une modification refait un devis à valider : les boutons de l'ancien
ne marchent plus. L'équipe est aussi prévenue des annulations.

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
Les salles proposées sont celles cochées « Proposée aux coworkers » dans Gestion > Salles de réunion.

**Crédits** : chaque réservation d'un coworker coûte des crédits selon le barème
de la salle (Gestion > Salles de réunion). Le plafond mensuel est le champ « Nombre de crédits »
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

**Restauration** (à commander au moins `COWORKING.mealsNoticeHours` = 24h avant) : en réservant ou en modifiant, un coworker peut ajouter petit déjeuner et/ou
déjeuner (tarifs `PRICES` de `Config.gs`). Dès qu'un service est choisi, un devis « services seuls »
(la salle reste sur crédits) est préparé, copié dans le dossier Drive des devis et envoyé à
l'équipe de la ville (`<ville>@hiptown.com`) avec deux boutons : **Valider et envoyer le devis**
(le coworker le reçoit alors par email) ou **Refuser les services** (le coworker est prévenu,
sa salle reste réservée). Une modification refait un devis à valider : les boutons de l'ancien
ne marchent plus. L'équipe est aussi prévenue des annulations.

Mise en route, **une seule fois** après avoir copié les fichiers :
1. Dans le menu déroulant des fonctions, choisir `testCoworkingSetup`, cliquer sur ▶ Exécuter
   et **accepter la nouvelle autorisation** (« se connecter à un service externe » : c'est
   l'accès à Firestore). Le journal doit afficher les 4 salles et « Firestore joignable ».
2. Déployer une nouvelle version (étape 5 ci-dessus). Sans ce déploiement, la tuile du
   portail affiche « Impossible de charger les salles ».
