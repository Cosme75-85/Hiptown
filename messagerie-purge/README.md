# Messagerie : suppression automatique après 14 jours

Script Apps Script **à part** (il ne touche pas à l'outil de réservation). Chaque nuit vers 4h,
il supprime dans Firestore les messages de plus de 14 jours (`MESSAGE_RETENTION_DAYS` dans `Purge.gs`) :
échanges client ↔ équipe, discussions de l'équipe Hiptown et discussions entre collègues.
Une discussion sans aucun message récent disparaît de la liste.

## Installation (une seule fois)

Avec le compte Google propriétaire du projet Firebase `erp-hiptown` :

1. Ouvrir https://script.google.com > **Nouveau projet**, le nommer « Messagerie — nettoyage ».
2. Remplacer le contenu de `Code.gs` par celui de `Purge.gs`.
3. **Paramètres du projet** (roue dentée) > cocher **Afficher le fichier manifeste « appsscript.json »**.
   Retour à l'éditeur : remplacer le contenu de `appsscript.json` par celui de ce dossier. Enregistrer.
4. Menu déroulant des fonctions : `testPurgeSansSupprimer` > ▶ **Exécuter**, accepter les autorisations.
   Le journal affiche ce qui serait supprimé, sans rien supprimer.
5. Puis `installPurgeTrigger` > ▶ **Exécuter**. C'est fini : le nettoyage tourne chaque nuit.

Pour l'arrêter : **Déclencheurs** (réveil, colonne de gauche) > supprimer `purgeOldMessages`.

Coût : chaque message supprimé compte pour une suppression Firestore (20 000 gratuites par jour).
