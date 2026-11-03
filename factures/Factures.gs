/**
 * FACTURES REÇUES PAR MAIL → GOOGLE DRIVE
 *
 * Toutes les heures, ce script cherche dans Gmail les mails REÇUS qui contiennent un
 * PDF (facture ou non dans le texte) et enregistre chaque PDF dans Drive :
 *
 *   Factures reçues / 2026 / 2026-11 / 2026-11-03 - Orange - facture_123.pdf
 *
 * - Un PDF déjà enregistré n'est jamais copié deux fois (même nom = déjà fait).
 * - Le mail reçoit le libellé Gmail « Factures/Dans Drive » pour voir d'un coup d'œil ce qui est rangé.
 * - Tout ce qui vient de Hiptown (envois, devis, factures clients) est ignoré.
 * - Rien n'est supprimé ni modifié dans Gmail, à part ce libellé.
 *
 * Installation : voir README.md (lancer une fois `installer`).
 */

// ===== Réglages =====
const FACTURES = {
  // Nom du dossier Drive principal, créé automatiquement au premier passage.
  // Pour utiliser un dossier existant, colle son identifiant (la fin de son adresse Drive) dans dossierId.
  dossierNom: 'Factures reçues',
  dossierId: '',

  // Recherche Gmail (même syntaxe que la barre de recherche Gmail).
  // Tout mail REÇU avec un PDF joint est pris, qu'il parle de facture ou non.
  // Sont exclus : les mails envoyés (-in:sent), ceux écrits depuis ce compte (-from:me)
  // et tous ceux d'une adresse Hiptown (-from:hiptown.com).
  recherche: 'has:attachment filename:pdf -in:sent -in:chats -from:me -from:hiptown.com',

  // Expéditeurs à ignorer : adresses complètes ou domaines entiers (ex. un outil de facturation
  // qui t'envoie une copie des factures adressées à tes clients).
  expediteursIgnores: ['hiptown.com'],

  // Un mail dont le NOM d'expéditeur contient un de ces mots est ignoré : c'est le cas des factures
  // que tu envoies à tes clients via un logiciel (« Hiptown via Pennylane », etc.).
  nomsExpediteurIgnores: ['hiptown'],

  // PDF ignorés selon leur nom de fichier : tes devis et tes factures clients
  // (ajoute ici le début de la numérotation de tes factures, ex. 'FA-').
  fichiersIgnores: ['devis', 'NABO06'],

  // Fenêtre regardée à chaque passage horaire, et pour la première récupération (rattrapage).
  joursParPassage: 3,
  joursRattrapage: 365,

  libelle: 'Factures/Dans Drive',
  maxFils: 100   // mails traités par passage (Gmail limite le temps d'exécution)
};

/** Passage automatique (déclenché toutes les heures par `installer`). */
function rangerFactures() {
  return rangerDepuis_(FACTURES.joursParPassage);
}

/** À lancer une fois à la main : range les factures de la dernière année. Relançable sans risque. */
function rattraperAnciennesFactures() {
  return rangerDepuis_(FACTURES.joursRattrapage);
}

/** À lancer une fois à la main : crée le dossier, le libellé et le déclencheur horaire. */
function installer() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'rangerFactures'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('rangerFactures').timeBased().everyHours(1).create();
  const dossier = dossierPrincipal_();
  libelle_();
  Logger.log('Installé. Dossier Drive : ' + dossier.getUrl());
  Logger.log('Lance maintenant « rattraperAnciennesFactures » pour ranger les factures déjà reçues.');
}

/** Arrête le rangement automatique (le dossier et les factures restent). */
function desinstaller() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'rangerFactures'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Rangement automatique arrêté.');
}

// ===== Fonctionnement =====

function rangerDepuis_(jours) {
  const requete = FACTURES.recherche + ' newer_than:' + jours + 'd';
  const libelle = libelle_();
  const racine = dossierPrincipal_();
  const fuseau = Session.getScriptTimeZone();
  let enregistrees = 0, dejaLa = 0, debut = 0;

  while (true) {
    const fils = GmailApp.search(requete, debut, FACTURES.maxFils);
    if (!fils.length) break;
    fils.forEach(function (fil) {
      let filUtile = false;
      fil.getMessages().forEach(function (mail) {
        if (estIgnore_(mail.getFrom())) return;
        const pdfs = mail.getAttachments({ includeInlineImages: false }).filter(function (pj) {
          return (pj.getContentType() === 'application/pdf' || /\.pdf$/i.test(pj.getName()))
            && !fichierIgnore_(pj.getName());
        });
        if (!pdfs.length) return;
        const date = mail.getDate();
        const dossier = sousDossier_(racine, Utilities.formatDate(date, fuseau, 'yyyy'),
          Utilities.formatDate(date, fuseau, 'yyyy-MM'));
        const prefixe = Utilities.formatDate(date, fuseau, 'yyyy-MM-dd') + ' - ' + nomExpediteur_(mail.getFrom()) + ' - ';
        pdfs.forEach(function (pj) {
          const nom = nettoyer_(prefixe + pj.getName());
          filUtile = true;
          if (dossier.getFilesByName(nom).hasNext()) { dejaLa++; return; }
          dossier.createFile(pj.copyBlob().setName(nom));
          enregistrees++;
        });
      });
      if (filUtile) fil.addLabel(libelle);
    });
    if (fils.length < FACTURES.maxFils) break;
    debut += FACTURES.maxFils;
    if (debut >= 500) break; // le reste sera pris au prochain passage
  }
  Logger.log(enregistrees + ' facture(s) enregistrée(s), ' + dejaLa + ' déjà présente(s).');
  return { enregistrees: enregistrees, dejaLa: dejaLa };
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

function fichierIgnore_(nomFichier) {
  const n = String(nomFichier).toLowerCase();
  return FACTURES.fichiersIgnores.some(function (x) { return n.indexOf(x.toLowerCase()) !== -1; });
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
  if (FACTURES.dossierId) return DriveApp.getFolderById(FACTURES.dossierId);
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FACTURES_DOSSIER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* supprimé : on le recrée */ }
  }
  const dossier = DriveApp.createFolder(FACTURES.dossierNom);
  props.setProperty('FACTURES_DOSSIER_ID', dossier.getId());
  return dossier;
}

function sousDossier_(racine, annee, mois) {
  return enfant_(enfant_(racine, annee), mois);
}

function enfant_(parent, nom) {
  const it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function libelle_() {
  return GmailApp.getUserLabelByName(FACTURES.libelle) || GmailApp.createLabel(FACTURES.libelle);
}
