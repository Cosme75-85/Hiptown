# Réservation d'espaces — Apps Script

Code source du module de réservation de salles (web app Google Apps Script),
ouvert depuis la tuile « Réserver une salle » du portail client (`app.js`).

| Fichier | Rôle | À copier dans Apps Script |
|---|---|---|
| `Config.gs` | **Tout ce qui se règle** : espaces, agendas, horaires, tarifs, emails | ✅ |
| `Code.gs` | La logique : disponibilités, demandes, emails, approbation | ✅ |
| `Tests.gs` | Fonctions de diagnostic à lancer à la main | ✅ |
| `Index.html` | La page affichée au client | ✅ |
| `appsscript.json` | Réglages du projet (fuseau horaire, accès) — déjà en place | ❌ |
| `README.md` | Ce mode d'emploi | ❌ |

## Mettre à jour Apps Script avec cette version

Le code qui tourne est celui de script.google.com : ce dossier en est la copie
de référence (historique, retour arrière possible). Après chaque modification :

1. Ouvrir le projet sur script.google.com.
2. Pour chacun des 4 fichiers marqués ✅ ci-dessus : ouvrir le fichier du même nom
   dans Apps Script (le créer avec **+ > Script** s'il n'existe pas, sans taper « .gs »),
   tout sélectionner (Ctrl+A), supprimer, coller le contenu du fichier GitHub.
3. Vérifier qu'il n'y a **pas d'autre fichier .gs** que ces trois-là : deux fichiers qui
   déclarent la même constante provoquent l'erreur « already been declared ».
4. Enregistrer (Ctrl+S).
5. **Déployer > Gérer les déploiements > ✏️ (crayon) > Version : Nouvelle version > Déployer**
   (modifier le déploiement existant garde la même URL, donc le lien du portail reste valable).

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
