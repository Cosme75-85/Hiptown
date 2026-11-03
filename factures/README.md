# Factures reçues par mail → Google Drive

Petit script Google Apps Script, **séparé** de l'outil de réservation (dossier `reservation/`).
Toutes les heures, il regarde les PDF reçus dans Gmail, **lit leur contenu** et ne range dans Drive
que les vraies factures :

Tout est rangé dans le Drive partagé **Hiptown Team V2 > 5. Exploitation > 8. Bordeaux** :

```
Factures reçues/
  2026/
    2026-11/
      2026-11-03 - Orange - facture_123.pdf
PDF écartés (pas des factures)/
  2026-11-03 - ACME - devis_45.pdf
```

**Quels mails.** Seuls les mails reçus avec un PDF **et** qui contiennent *facture(s)* ou *invoice(s)*
(dans l'objet, le texte ou le nom de la pièce jointe) sont regardés. Les autres ne sont pas ouverts.

**Comment il reconnaît une facture.**

1. **Par le nom du fichier**, d'abord. S'il contient *devis*, *AO*, *appel d'offre(s)*, *plaquette(s)*,
   *offre commerciale*, *offre(s)*, *proposition*, *CGV*, *CGU*, *RIB*, *IBAN*, *KBIS*, *extrait de compte*,
   *grand livre*, *relevé*, *attestation*, *mandat*, *SEPA*, *contrat*, *présentation*, *rapport*, *plan(s)*
   ou *constat* → écarté d'office. Sinon, s'il contient *facture*, *invoice*,
   *fact* ou un numéro de facture (*F-1234*, *F202603333*, *FV2026-025387*, *FAC26-04-2556*, *FS27771*…)
   → rangé d'office. (Si un nom contient les deux, par ex. « Facture offre fibre », il est écarté.)
2. **Par le contenu**, si le nom ne dit rien (« scan001.pdf »…) : il lit le PDF (même scanné) et regarde le premier mot-clé qui apparaît,
en pratique le titre du document : « Facture », « Invoice », « Avoir n° », « Note d'honoraires », « Receipt »…
→ facture. « Devis », « Proposition commerciale », « Bon de commande », « Pro forma », « Contrat de »… → écarté.
Une facture qui cite un devis en référence reste donc bien une facture.

Un même PDF reçu dans plusieurs mails (relance, transfert) n'est rangé qu'une fois.

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
5. Lance **`rattraperAnciennesFactures`** pour ranger les factures de l'année écoulée
   (relance-la tant que le journal affiche « Pas fini »).
6. L'ancien dossier « Factures reçues » de **Mon Drive** (créé par la première version) n'est plus utilisé :
   tu peux le supprimer.

**Après une mise à jour des règles**, lance **`retrierTout`** : elle re-trie les deux dossiers avec les règles
actuelles (les factures écartées à tort reviennent, les CGV et autres sortent, les doublons partent dans
« PDF écartés »). Relance-la tant que le journal affiche « Pas fini ».

`trierDossierFactures` relit les PDF déjà rangés et sort ce qui n'est pas une facture : utile si tu ajoutes
des PDF à la main dans « Factures reçues ».

Ensuite le script tourne seul toutes les heures, même ordinateur éteint.

## Régler

Tout se règle en haut de `Factures.gs` :

| Réglage | Rôle |
|---|---|
| `dossierParentId` | Dossier où sont créés « Factures reçues » et « PDF écartés » (par défaut : 8. Bordeaux). Colle l'identifiant d'un autre dossier (la fin de son adresse, après `folders/`) pour changer. |
| `expediteursIgnores` | Adresses ou domaines à ne jamais ranger (ex. `'newsletter@exemple.fr'`, `'exemple.fr'`). |
| `nomsFichierEcartes` | Mots du nom de fichier qui écartent d'office le PDF (devis, AO, offre…). |
| `nomsFichierFactures` | Mots du nom de fichier qui le rangent d'office comme facture (facture, invoice, fact ; F-1234 est reconnu en plus). |
| `recherche` | Quels mails sont regardés (syntaxe de la recherche Gmail). |
| `MOTS_FACTURE` / `MOTS_AUTRE` | Les mots-clés qui décident. Une facture écartée à tort ? Ajoute le mot de son titre à `MOTS_FACTURE`. |

Une facture partie par erreur dans « PDF écartés » : déplace-la à la main dans le bon mois, le script ne la touchera plus.

## Arrêter

Lance la fonction **`desinstaller`**. Les dossiers et les factures déjà rangées restent dans Drive.
