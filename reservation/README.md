# Réservation d'espaces — Apps Script

Code source du module de réservation de salles (web app Google Apps Script),
ouvert depuis la tuile « Réserver une salle » du portail client (`app.js`).

| Fichier | Rôle | À copier dans Apps Script |
|---|---|---|
| `Config.gs` | **Tout ce qui se règle** : espaces, agendas, horaires, tarifs, emails | ✅ |
| `Code.gs` | La logique : disponibilités, demandes, emails, approbation | ✅ |
| `Devis.gs` | Devis PDF joint à l'email de confirmation | ✅ |
| `Tests.gs` | Fonctions de diagnostic à lancer à la main (dont `testDevis`) | ✅ |
| `Index.html` | La page affichée au client | ✅ |
| `appsscript.json` | Réglages du projet (fuseau horaire, accès) — déjà en place | ❌ |
| `README.md` | Ce mode d'emploi | ❌ |

## Mettre à jour Apps Script avec cette version

Le code qui tourne est celui de script.google.com : ce dossier en est la copie
de référence (historique, retour arrière possible). Après chaque modification :

1. Ouvrir le projet sur script.google.com.
2. Pour chacun des 5 fichiers marqués ✅ ci-dessus : ouvrir le fichier du même nom
   dans Apps Script (le créer avec **+ > Script** s'il n'existe pas, sans taper « .gs »),
   tout sélectionner (Ctrl+A), supprimer, coller le contenu du fichier GitHub.
3. Vérifier qu'il n'y a **pas d'autre fichier .gs** que ces quatre-là : deux fichiers qui
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

