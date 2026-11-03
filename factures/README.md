# Factures reçues par mail → Google Drive

Petit script Google Apps Script, **séparé** de l'outil de réservation (dossier `reservation/`).
Toutes les heures, il enregistre dans Drive les factures PDF reçues dans Gmail :

```
Factures reçues/
  2026/
    2026-11/
      2026-11-03 - Orange - facture_123.pdf
```

Chaque mail rangé reçoit le libellé Gmail **Factures/Dans Drive**. Rien d'autre n'est modifié dans Gmail,
et un PDF n'est jamais copié deux fois.

## Installation (5 minutes, une seule fois)

À faire **connecté avec le compte Gmail qui reçoit les factures** (cc@hiptown.com).

1. Va sur [script.google.com](https://script.google.com) > **Nouveau projet**. Renomme-le « Factures vers Drive ».
2. Remplace tout le contenu de `Code.gs` par celui de [`Factures.gs`](Factures.gs) (bouton « Copy raw file » sur GitHub), puis 💾 **Enregistrer**.
3. En haut, choisis la fonction **`installer`** puis **Exécuter**. Google demande les autorisations
   (Gmail, Drive, déclencheurs) : **Autoriser**. Le journal affiche l'adresse du dossier Drive créé.
4. Choisis la fonction **`rattraperAnciennesFactures`** puis **Exécuter** : les factures de la dernière année
   sont rangées. S'il y en a beaucoup, relance-la jusqu'à ce que le journal indique « 0 facture(s) enregistrée(s) ».

C'est tout : ensuite le script tourne seul toutes les heures, même ordinateur éteint.

## Régler

Tout se règle en haut de `Factures.gs`, dans `FACTURES` :

| Réglage | Rôle |
|---|---|
| `dossierId` | Pour ranger dans un dossier Drive existant : colle son identifiant (la fin de son adresse, après `folders/`). |
| `recherche` | Quels mails sont pris (syntaxe de la recherche Gmail). Par défaut : PDF joint + « facture », ou « invoice ». |
| `expediteursIgnores` | Adresses ou domaines à ne jamais ranger (par défaut : tes propres envois de devis). |

Une facture oubliée ? Ajoute son mot-clé à `recherche` (ex. `OR "reçu"`) puis relance `rattraperAnciennesFactures`.

## Arrêter

Lance la fonction **`desinstaller`**. Le dossier et les factures déjà rangées restent dans Drive.
