# Réservation d'espaces — Apps Script

Code source du module de réservation de salles (web app Google Apps Script),
ouvert depuis la tuile « Réserver une salle » du portail client (`app.js`).

| Fichier | Rôle |
|---|---|
| `Code.gs` | Serveur : disponibilités, création des demandes, emails, approbation |
| `Index.html` | Page de réservation affichée au client |
| `appsscript.json` | Manifeste (fuseau horaire, droits de la web app) |

## Mettre à jour Apps Script avec cette version

Le code qui tourne est celui de script.google.com : ce dossier en est la copie
de référence (historique, retour arrière possible). Après chaque modification :

1. Ouvrir le projet sur script.google.com.
2. `Code.gs` : tout sélectionner (Ctrl+A), supprimer, coller le contenu de `reservation/Code.gs`.
3. `Index.html` : même chose avec `reservation/Index.html`.
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
