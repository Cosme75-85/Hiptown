/**
 * FACTURES REÇUES PAR MAIL → GOOGLE DRIVE
 *
 * Toutes les heures, ce script cherche dans Gmail les mails qui contiennent une
 * facture en PDF et enregistre chaque PDF dans Drive :
 *
 *   Factures reçues / 2026 / 2026-11 / 2026-11-03 - Orange - facture_123.pdf
 *
 * - Un PDF déjà enregistré n'est jamais copié deux fois (même nom = déjà fait).
 * - Le mail reçoit le libellé Gmail « Factures/Dans Drive » pour voir d'un coup d'œil ce qui est rangé.
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
  // Un mail est pris s'il a un PDF joint ET le mot facture/invoice dans l'objet, le texte ou le nom du fichier.
  recherche: 'has:attachment filename:pdf (facture OR factures OR invoice OR "votre facture")',

  // Expéditeurs à ignorer (ex. tes propres envois de devis) : adresses ou domaines.
  expediteursIgnores: ['cc@hiptown.com'],

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
          return pj.getContentType() === 'application/pdf' || /\.pdf$/i.test(pj.getName());
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

function estIgnore_(from) {
  const adresse = (String(from).match(/<([^>]+)>/) || [null, from])[1].toLowerCase().trim();
  return FACTURES.expediteursIgnores.some(function (x) {
    x = x.toLowerCase();
    return adresse === x || adresse.endsWith('@' + x.replace(/^@/, ''));
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
