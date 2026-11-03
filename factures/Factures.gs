/**
 * FACTURES REÇUES PAR MAIL → GOOGLE DRIVE
 *
 * Toutes les heures, ce script regarde les mails reçus qui parlent de facture (ou invoice).
 * Pour chaque PDF joint : nom en « facture / invoice / fact / F-1234 » → rangé ; nom en « devis, AO,
 * offre… » → écarté ; sinon il LIT le PDF pour décider. Seules les vraies factures vont dans :
 *
 *   Drive partagé Hiptown Team V2 / 5. Exploitation / 8. Bordeaux /
 *     Factures reçues / 2026 / 2026-11 / 2026-11-03 - Orange - facture_123.pdf
 *
 * - Devis, propositions commerciales, bons de commande, factures pro forma, plaquettes… :
 *   écartés dans un dossier à part « PDF écartés (pas des factures) », pour vérification.
 * - Tout ce qui vient de Hiptown (envois, devis, factures clients) est ignoré.
 * - Un PDF déjà traité n'est jamais copié deux fois (même nom = déjà fait).
 * - Le mail d'une facture rangée reçoit le libellé Gmail « Factures/Dans Drive ».
 * - Rien n'est supprimé ni modifié dans Gmail, à part ce libellé.
 *
 * Nécessite le service avancé « Drive API » (v3) : voir README.md.
 */

// ===== Réglages =====
const FACTURES = {
  // Dossier Drive où tout est rangé : Drive partagé « Hiptown Team V2 » > 5. Exploitation > 8. Bordeaux.
  // (identifiant = la fin de l'adresse du dossier, après « folders/ »). Vide = « Mon Drive ».
  dossierParentId: '1SUQaSIWtXFuftI7ZxUm7bwvkL82L45Qt',
  // Sous-dossiers créés automatiquement dans ce dossier au premier passage.
  dossierNom: 'Factures reçues',
  // Ceux qui ne sont pas des factures (à vérifier ou supprimer quand tu veux).
  dossierEcartesNom: 'PDF écartés (pas des factures)',

  // Recherche Gmail : seuls les mails REÇUS avec un PDF ET qui parlent de facture (objet, texte ou nom
  // de la pièce jointe) sont regardés, sauf ceux de Hiptown. Les autres mails ne sont pas ouverts.
  recherche: 'has:attachment filename:pdf -in:sent -in:chats -from:me -from:hiptown.com '
    + '(facture OR factures OR invoice OR invoices)',

  // Expéditeurs à ignorer : adresses complètes ou domaines entiers.
  expediteursIgnores: ['hiptown.com'],
  // Mails dont le NOM d'expéditeur contient un de ces mots : ignorés (« Hiptown via Pennylane »…).
  nomsExpediteurIgnores: ['hiptown'],
  // Tri par NOM DE FICHIER, avant toute lecture du PDF (mots entiers, majuscules et _ - . sans importance).
  // 1) Un de ces mots dans le nom → écarté d'office (prioritaire).
  nomsFichierEcartes: ['devis', 'AO', 'appel d\'offre', 'appel d\'offres', 'appel offre', 'appels d\'offres',
    'plaquette', 'plaquettes', 'offre commerciale', 'offres commerciales', 'offre', 'offres',
    'proposition', 'NABO06',
    'CGV', 'CGU', 'conditions générales', 'conditions generales', 'RIB', 'IBAN', 'KBIS', 'extrait de compte',
    'grand livre', 'relevé', 'releve', 'attestation', 'mandat', 'SEPA', 'contrat', 'présentation',
    'presentation', 'rapport', 'plan', 'plans', 'constat'],
  // 2) Sinon, un de ces mots dans le nom → rangé d'office comme facture.
  nomsFichierFactures: ['facture', 'factures', 'invoice', 'invoices', 'fact'],
  // … ainsi qu'un numéro de facture dans le nom : F-1234, F202603333, FV2026-025387, FAC26-04-2556, FS27771…
  // 3) Sinon, le contenu du PDF est lu pour décider.

  // Fenêtre regardée à chaque passage horaire, et pour la première récupération (rattrapage).
  joursParPassage: 3,
  joursRattrapage: 365,

  libelle: 'Factures/Dans Drive',
  maxFils: 100,
  dureeMaxMs: 4.5 * 60 * 1000   // Google coupe un script à 6 min : on s'arrête avant, la suite au prochain passage
};

// Mots qui désignent une facture, et mots qui désignent autre chose.
// Le PREMIER de ces mots trouvé dans le document (en général son titre) décide.
const MOTS_FACTURE = ['facture', 'factures', 'invoice', 'avoir n°', 'facture d\'avoir', 'note d\'honoraires',
  'reçu de paiement', 'receipt', 'quittance'];
const MOTS_AUTRE = ['devis', 'proposition commerciale', 'proposition tarifaire', 'proposition', 'offre de prix',
  'offre commerciale', 'bon de commande', 'estimation', 'quotation', 'quote', 'pro forma', 'proforma',
  'pro-forma', 'bon de livraison', 'contrat de', 'conditions générales', 'conditions generales', 'cgv', 'relevé de compte', 'extrait de compte', 'plaquette', 'brochure',
  'appel d\'offres', 'appel d\'offre', 'offre commerciale'];
const ETIQUETTE_VERIFIEE = 'Facture vérifiée (v2)';
const ETIQUETTE_ECARTE = 'Pas une facture (v2)';
const ETIQUETTE_DOUBLON = 'Doublon';

/** Passage automatique (déclenché toutes les heures par `installer`). */
function rangerFactures() {
  return rangerDepuis_(FACTURES.joursParPassage);
}

/** À lancer à la main : range les factures de la dernière année. Relançable sans risque. */
function rattraperAnciennesFactures() {
  return rangerDepuis_(FACTURES.joursRattrapage);
}

/**
 * À lancer à la main : relit chaque PDF déjà rangé dans « Factures reçues » et déplace ceux
 * qui ne sont pas des factures vers « PDF écartés ». Relance-la tant que le journal dit « pas fini ».
 */
function trierDossierFactures() {
  const debut = Date.now();
  const ecartes = dossierEcartes_();
  let gardees = 0, deplaces = 0, fini = true;
  const parcourir = function (dossier) {
    const fichiers = dossier.getFiles();
    while (fichiers.hasNext()) {
      if (Date.now() - debut > FACTURES.dureeMaxMs) { fini = false; return; }
      const f = fichiers.next();
      if (f.getDescription() === ETIQUETTE_VERIFIEE) continue;
      const nomOrigine = f.getName().replace(/^\d{4}-\d{2}-\d{2} - .*? - /, '');
      if (estFacture_(f.getBlob(), nomOrigine, '')) {
        f.setDescription(ETIQUETTE_VERIFIEE);
        gardees++;
      } else {
        f.moveTo(ecartes);
        deplaces++;
      }
    }
    const sous = dossier.getFolders();
    while (fini && sous.hasNext()) parcourir(sous.next());
  };
  parcourir(dossierPrincipal_());
  Logger.log(gardees + ' facture(s) confirmée(s), ' + deplaces + ' PDF déplacé(s) dans « '
    + FACTURES.dossierEcartesNom + ' ».' + (fini ? ' Terminé.' : ' Pas fini : relance la fonction.'));
}

/**
 * À lancer à la main après une mise à jour des règles : RE-TRIE LES DEUX DOSSIERS avec les règles actuelles.
 * - une facture qui était dans « PDF écartés » revient dans « Factures reçues / année / mois » ;
 * - ce qui n'est pas une facture (CGV, RIB, devis…) part dans « PDF écartés » ;
 * - un même PDF présent deux fois : le second part dans « PDF écartés », décrit « Doublon ».
 * Relance-la tant que le journal affiche « Pas fini ».
 */
function retrierTout() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) { Logger.log('Un autre passage est en cours : réessaie dans quelques minutes.'); return; }
  try {
    const debut = Date.now();
    const racine = dossierPrincipal_();
    const ecartes = dossierEcartes_();
    let revenues = 0, sorties = 0, doublons = 0, inchanges = 0, fini = true;
    const traiter = function (f, dansEcartes) {
      const desc = f.getDescription() || '';
      if (/\(v2\)$/.test(desc) || desc === ETIQUETTE_DOUBLON) return;
      const blob = f.getBlob();
      const empreinte = empreinte_(blob);
      const deja = PropertiesService.getScriptProperties().getProperty('h_' + empreinte);
      if (deja && deja !== f.getId() && existe_(deja)) {
        if (!dansEcartes) f.moveTo(ecartes);
        f.setDescription(ETIQUETTE_DOUBLON);
        doublons++;
        return;
      }
      memoriser_(empreinte, f.getId());
      const nomOrigine = f.getName().replace(/^\d{4}-\d{2}-\d{2} - .*? - /, '');
      if (estFacture_(blob, nomOrigine, '')) {
        if (dansEcartes) { f.moveTo(dossierDuMois_(racine, f)); revenues++; } else inchanges++;
        f.setDescription(ETIQUETTE_VERIFIEE);
      } else {
        if (!dansEcartes) { f.moveTo(ecartes); sorties++; } else inchanges++;
        f.setDescription(ETIQUETTE_ECARTE);
      }
    };
    const parcourir = function (dossier, dansEcartes) {
      const fichiers = dossier.getFiles();
      while (fini && fichiers.hasNext()) {
        if (Date.now() - debut > FACTURES.dureeMaxMs) { fini = false; return; }
        traiter(fichiers.next(), dansEcartes);
      }
      const sous = dossier.getFolders();
      while (fini && sous.hasNext()) parcourir(sous.next(), dansEcartes);
    };
    parcourir(racine, false);
    if (fini) parcourir(ecartes, true);
    Logger.log(revenues + ' facture(s) revenue(s) des écartés, ' + sorties + ' PDF sorti(s) des factures, '
      + doublons + ' doublon(s), ' + inchanges + ' inchangé(s).' + (fini ? ' Terminé.' : ' Pas fini : relance la fonction.'));
  } finally {
    verrou.releaseLock();
  }
}

/** À lancer une fois à la main : crée les dossiers, le libellé et le déclencheur horaire. */
function installer() {
  desinstaller();
  ScriptApp.newTrigger('rangerFactures').timeBased().everyHours(1).create();
  const dossier = dossierPrincipal_();
  dossierEcartes_();
  libelle_();
  Logger.log('Installé. Dossier Drive : ' + dossier.getUrl());
}

/** Arrête le rangement automatique (les dossiers et les factures restent). */
function desinstaller() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'rangerFactures'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

// ===== Fonctionnement =====

function rangerDepuis_(jours) {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) { Logger.log('Un autre passage est déjà en cours : rien à faire.'); return null; }
  try { return rangerDepuisSansVerrou_(jours); } finally { verrou.releaseLock(); }
}

function rangerDepuisSansVerrou_(jours) {
  const debutExec = Date.now();
  const requete = FACTURES.recherche + ' newer_than:' + jours + 'd';
  const libelle = libelle_();
  const racine = dossierPrincipal_();
  const ecartes = dossierEcartes_();
  const fuseau = Session.getScriptTimeZone();
  let enregistrees = 0, ecartees = 0, dejaVus = 0, debut = 0, fini = true;

  boucle:
  while (true) {
    const fils = GmailApp.search(requete, debut, FACTURES.maxFils);
    if (!fils.length) break;
    for (let i = 0; i < fils.length; i++) {
      const fil = fils[i];
      let filAvecFacture = false;
      const mails = fil.getMessages();
      for (let j = 0; j < mails.length; j++) {
        const mail = mails[j];
        if (estIgnore_(mail.getFrom())) continue;
        const pdfs = mail.getAttachments({ includeInlineImages: false }).filter(function (pj) {
          return pj.getContentType() === 'application/pdf' || /\.pdf$/i.test(pj.getName());
        });
        if (!pdfs.length) continue;
        const date = mail.getDate();
        const dossier = sousDossier_(racine, Utilities.formatDate(date, fuseau, 'yyyy'),
          Utilities.formatDate(date, fuseau, 'yyyy-MM'));
        const prefixe = Utilities.formatDate(date, fuseau, 'yyyy-MM-dd') + ' - ' + nomExpediteur_(mail.getFrom()) + ' - ';
        for (let k = 0; k < pdfs.length; k++) {
          const nom = nettoyer_(prefixe + pdfs[k].getName());
          if (dossier.getFilesByName(nom).hasNext()) { dejaVus++; filAvecFacture = true; continue; }
          if (ecartes.getFilesByName(nom).hasNext()) { dejaVus++; continue; }
          if (Date.now() - debutExec > FACTURES.dureeMaxMs) { fini = false; break boucle; }
          const blob = pdfs[k].copyBlob().setName(nom);
          // Même PDF déjà reçu dans un autre mail (relance, transfert…) : pas de doublon.
          const empreinte = empreinte_(blob);
          if (dejaRange_(empreinte)) { dejaVus++; continue; }
          let fichier;
          if (estFacture_(blob, pdfs[k].getName(), mail.getSubject())) {
            fichier = dossier.createFile(blob).setDescription(ETIQUETTE_VERIFIEE);
            enregistrees++;
            filAvecFacture = true;
          } else {
            fichier = ecartes.createFile(blob).setDescription(ETIQUETTE_ECARTE);
            ecartees++;
          }
          memoriser_(empreinte, fichier.getId());
        }
      }
      if (filAvecFacture) fil.addLabel(libelle);
    }
    if (fils.length < FACTURES.maxFils) break;
    debut += FACTURES.maxFils;
    if (debut >= 500) { fini = false; break; }
  }
  Logger.log(enregistrees + ' facture(s) enregistrée(s), ' + ecartees + ' PDF écarté(s), '
    + dejaVus + ' déjà traité(s).' + (fini ? '' : ' Pas fini : relance la fonction.'));
  return { enregistrees: enregistrees, ecartees: ecartees, dejaVus: dejaVus, fini: fini };
}

/**
 * Dit si le PDF est une facture reçue. D'abord son nom (devis, AO, offre… → non ; facture, invoice → oui),
 * sinon son contenu (et non un devis, une proposition, un document Hiptown…).
 */
function estFacture_(blob, nomFichier, objet) {
  const parNom = classerNom_(nomFichier);
  if (parNom) return parNom === 'facture';
  return classer_(lireTextePdf_(blob), nomFichier, objet) === 'facture';
}

/** 'autre', 'facture' ou null (le nom ne suffit pas) selon les mots du nom de fichier. */
function classerNom_(nomFichier) {
  const n = ' ' + String(nomFichier || '').toLowerCase().replace(/\.pdf$/, '')
    .replace(/[’`]/g, '\'').replace(/[_\-.+()\[\]]+/g, ' ') + ' ';
  if (premierePosition_(n, FACTURES.nomsFichierEcartes.map(minuscule_)) !== -1) return 'autre';
  if (premierePosition_(n, FACTURES.nomsFichierFactures.map(minuscule_)) !== -1) return 'facture';
  if (/(^|[^a-z0-9])(f|fa|fac|fact|fv|fs)[-_]?\d{2,}/i.test(String(nomFichier || ''))) return 'facture';
  return null;
}

function minuscule_(x) { return String(x).toLowerCase(); }

/**
 * Renvoie 'facture' ou 'autre'.
 * Règle : le premier mot-clé trouvé dans le document (son titre, en pratique) décide.
 * Si le PDF n'a pas pu être lu, on regarde le nom du fichier puis l'objet du mail.
 */
function classer_(texte, nomFichier, objet) {
  const t = String(texte || '').toLowerCase();
  const sources = [t, String(nomFichier || '').toLowerCase().replace(/[_\-.]+/g, ' '), String(objet || '').toLowerCase()];
  for (let i = 0; i < sources.length; i++) {
    const posFacture = premierePosition_(sources[i], MOTS_FACTURE);
    const posAutre = premierePosition_(sources[i], MOTS_AUTRE);
    if (posFacture === -1 && posAutre === -1) continue;
    // Une « facture pro forma » n'est pas une facture.
    if (/pro[\s-]?forma/.test(sources[i])) return 'autre';
    if (posAutre === -1) return 'facture';
    if (posFacture === -1) return 'autre';
    return posFacture < posAutre ? 'facture' : 'autre';
  }
  return 'autre';
}

/** Position du premier mot entier de la liste dans le texte, ou -1. */
function premierePosition_(texte, mots) {
  let mieux = -1;
  mots.forEach(function (mot) {
    const motif = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const m = new RegExp('(^|[^a-z0-9à-ÿ])' + motif + '(?![a-z0-9à-ÿ])').exec(texte);
    if (m) {
      const pos = m.index + m[1].length;
      if (mieux === -1 || pos < mieux) mieux = pos;
    }
  });
  return mieux;
}

/** Texte du PDF, via une conversion temporaire en Google Doc (avec reconnaissance des PDF scannés). */
function lireTextePdf_(blob) {
  let id = null;
  try {
    const fichier = Drive.Files.create({ name: 'lecture-facture-temporaire', mimeType: MimeType.GOOGLE_DOCS },
      blob, { ocrLanguage: 'fr', fields: 'id' });
    id = fichier.id;
    return DocumentApp.openById(id).getBody().getText();
  } catch (err) {
    Logger.log('Lecture impossible de « ' + blob.getName() + ' » : ' + err);
    return '';
  } finally {
    if (id) { try { Drive.Files.remove(id); } catch (e) { /* déjà supprimé */ } }
  }
}

/** Mail envoyé par Hiptown (ou en son nom) : ce n'est pas une facture pour nous. */
function estIgnore_(from) {
  const s = String(from);
  const adresse = (s.match(/<([^>]+)>/) || [null, s])[1].toLowerCase().trim();
  const nom = s.replace(/<[^>]*>/, '').toLowerCase();
  const domaine = adresse.split('@')[1] || '';
  return FACTURES.expediteursIgnores.some(function (x) {
    x = x.toLowerCase().replace(/^@/, '');
    return adresse === x || domaine === x || domaine.endsWith('.' + x);
  }) || FACTURES.nomsExpediteurIgnores.some(function (x) {
    return nom.indexOf(x.toLowerCase()) !== -1;
  });
}


/** « Orange <facture@orange.fr> » → « Orange » ; « facture@orange.fr » → « orange.fr ». */
function nomExpediteur_(from) {
  const s = String(from);
  const nom = s.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  if (nom && nom.indexOf('@') === -1) return nom;
  const adresse = (s.match(/<([^>]+)>/) || [null, s])[1];
  return adresse.split('@')[1] || adresse;
}

function nettoyer_(nom) {
  return nom.replace(/[\\\/:*?"<>|\r\n]+/g, '_').slice(0, 200);
}

function dossierPrincipal_() {
  return dossierMemorise_('FACTURES_DOSSIER_ID', FACTURES.dossierNom);
}

function dossierEcartes_() {
  return dossierMemorise_('FACTURES_ECARTES_ID', FACTURES.dossierEcartesNom);
}

/** Sous-dossier « nom » du dossier parent, retrouvé par son identifiant mémorisé ou créé. */
function dossierMemorise_(cle, nom) {
  const parentId = FACTURES.dossierParentId;
  cle += '_' + (parentId || 'mon-drive');   // changer de dossier parent = nouveaux sous-dossiers
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(cle);
  if (id) {
    try {
      const d = DriveApp.getFolderById(id);
      if (!d.isTrashed()) return d;
    } catch (err) { /* supprimé : on le recrée */ }
  }
  const parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
  const existants = parent.getFoldersByName(nom);
  const dossier = existants.hasNext() ? existants.next() : parent.createFolder(nom);
  props.setProperty(cle, dossier.getId());
  return dossier;
}

function sousDossier_(racine, annee, mois) {
  return enfant_(enfant_(racine, annee), mois);
}

function enfant_(parent, nom) {
  const it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

/** Empreinte du contenu du PDF : deux fichiers identiques ont la même. */
function empreinte_(blob) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, blob.getBytes()));
}

function dejaRange_(empreinte) {
  const id = PropertiesService.getScriptProperties().getProperty('h_' + empreinte);
  return !!id && existe_(id);
}

function memoriser_(empreinte, id) {
  PropertiesService.getScriptProperties().setProperty('h_' + empreinte, id);
}

/** Le fichier existe encore (pas supprimé à la main) ? */
function existe_(id) {
  try { return !DriveApp.getFileById(id).isTrashed(); } catch (err) { return false; }
}

/** Dossier « année / mois » d'un fichier, d'après la date au début de son nom (ou sa date de création). */
function dossierDuMois_(racine, f) {
  const m = f.getName().match(/^(\d{4})-(\d{2})-\d{2} - /);
  const annee = m ? m[1] : Utilities.formatDate(f.getDateCreated(), Session.getScriptTimeZone(), 'yyyy');
  const mois = m ? m[1] + '-' + m[2] : Utilities.formatDate(f.getDateCreated(), Session.getScriptTimeZone(), 'yyyy-MM');
  return sousDossier_(racine, annee, mois);
}

function libelle_() {
  return GmailApp.getUserLabelByName(FACTURES.libelle) || GmailApp.createLabel(FACTURES.libelle);
}
