# Factures reçues par mail → Google Drive

Petit script Google Apps Script, **séparé** de l'outil de réservation (dossier `reservation/`).
Toutes les heures, il regarde les PDF reçus dans Gmail, **lit leur contenu** et ne range dans Drive
que les vraies factures :

```
Factures reçues/
  2026/
    2026-11/
      2026-11-03 - Orange - facture_123.pdf
PDF écartés (pas des factures)/
  2026-11-03 - ACME - devis_45.pdf
```

**Comment il reconnaît une facture.** Il lit le PDF (même scanné) et regarde le premier mot-clé qui apparaît,
en pratique le titre du document : « Facture », « Invoice », « Avoir n° », « Note d'honoraires », « Receipt »…
→ facture. « Devis », « Proposition commerciale », « Bon de commande », « Pro forma », « Contrat de »… → écarté.
Une facture qui cite un devis en référence reste donc bien une facture.

Ce qui n'est pas une facture part dans **PDF écartés (pas des factures)**, pour que tu puisses vérifier :
rien n'est perdu. Tu peux vider ce dossier quand tu veux.

Ce qui vient de Hiptown est ignoré : mails envoyés, adresses @hiptown.com, expéditeurs nommés « Hiptown »
(logiciel de facturation qui envoie en ton nom), et tout PDF portant le SIRET de Hiptown (tes devis et factures clients).

## Installation ou mise à jour

À faire **connecté avec le compte Gmail qui reçoit les factures**.

1. Sur [script.google.com](https://script.google.com), ouvre le projet « Factures vers Drive »
   (ou crée-le : **Nouveau projet**).
2. Remplace tout le contenu de `Code.gs` par celui de [`Factures.gs`](Factures.gs) (« Copy raw file » sur GitHub), puis 💾 **Enregistrer**.
3. **Nouveau :** dans la colonne de gauche, **Services** > **+** > **Drive API** > version **v3** > **Ajouter**.
   C'est ce qui permet au script de lire le contenu des PDF.
4. Choisis la fonction **`installer`** > **Exécuter** et accepte les autorisations (Google en demande une de plus pour lire les PDF).
5. **Si le dossier contient déjà des PDF qui ne sont pas des factures :** lance **`trierDossierFactures`**.
   Elle relit chaque PDF du dossier et déplace les devis, propositions, etc. dans « PDF écartés ».
   Relance-la tant que le journal affiche « Pas fini ».
6. Première installation seulement : lance **`rattraperAnciennesFactures`** pour l'année écoulée
   (relance-la tant que le journal affiche « Pas fini »).

Ensuite le script tourne seul toutes les heures, même ordinateur éteint.

## Régler

Tout se règle en haut de `Factures.gs` :

| Réglage | Rôle |
|---|---|
| `dossierId` | Pour ranger dans un dossier Drive existant : colle son identifiant (la fin de son adresse, après `folders/`). |
| `expediteursIgnores` | Adresses ou domaines à ne jamais ranger (ex. `'newsletter@exemple.fr'`, `'exemple.fr'`). |
| `fichiersIgnores` | Mots du nom de fichier écartés sans lecture (par défaut `devis`, `proposition`, `NABO06`). |
| `MOTS_FACTURE` / `MOTS_AUTRE` | Les mots-clés qui décident. Une facture écartée à tort ? Ajoute le mot de son titre à `MOTS_FACTURE`. |

Une facture partie par erreur dans « PDF écartés » : déplace-la à la main dans le bon mois, le script ne la touchera plus.

## Arrêter

Lance la fonction **`desinstaller`**. Les dossiers et les factures déjà rangées restent dans Drive.
