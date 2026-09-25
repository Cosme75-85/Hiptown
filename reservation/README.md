# Réservation d'espaces — Apps Script

Code source du module de réservation de salles (web app Google Apps Script),
ouvert depuis la tuile « Réserver une salle » du portail client (`app.js`).

| Fichier | Rôle |
|---|---|
| `Code.gs` | Serveur : disponibilités, création des demandes, emails, approbation |
| `Index.html` | Page de réservation affichée au client |
| `appsscript.json` | Manifeste (fuseau horaire, droits de la web app) |

## Déployer

### Option A — copier-coller (sans outil)
Coller chaque fichier dans l'éditeur script.google.com, puis
**Déployer > Gérer les déploiements > ✏️ > Nouvelle version**
(garder le même déploiement pour conserver la même URL).

### Option B — clasp (outil officiel Google, gratuit)
Synchronise ce dossier avec le projet Apps Script, sans copier-coller.

```bash
npm install -g @google/clasp
clasp login
# Dans ce dossier, créer .clasp.json (ID : Paramètres du projet Apps Script > "ID du script")
echo '{"scriptId":"TON_ID_DE_SCRIPT","rootDir":"."}' > .clasp.json
clasp push        # envoie le code vers Apps Script
```

Puis publier une nouvelle version du déploiement existant (voir option A).
