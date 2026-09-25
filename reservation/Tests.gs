/**
 * DIAGNOSTIC — à lancer à la main depuis l'éditeur Apps Script :
 * choisir la fonction dans le menu déroulant, cliquer sur ▶ Exécuter,
 * puis lire le résultat dans le « Journal d'exécution ».
 */

function testCalendarAccess() {
  SPACES.forEach(space => {
    try {
      const cal = CalendarApp.getCalendarById(space.calendarId);
      if (cal === null) {
        Logger.log('❌ ' + space.name + ' — ID INTROUVABLE ou PAS D\'ACCÈS : "' + space.calendarId + '"');
      } else {
        Logger.log('✅ ' + space.name + ' — OK, nom réel de l\'agenda : "' + cal.getName() + '"');
      }
    } catch (err) {
      Logger.log('❌ ' + space.name + ' — ERREUR : ' + err.message);
    }
  });
}

function testEmail() {
  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: 'Test email réservation',
    htmlBody: '<p>Bonjour, ceci est un test.</p>'
  });
}

/**
 * Sélectionne "testAttachment" dans le menu déroulant, clique sur ▶ Exécuter,
 * puis regarde Affichage > Journaux pour voir la cause exacte si ça échoue.
 */
function testAttachment() {
  try {
    const file = DriveApp.getFileById(ACCESS_PLAN_FILE_ID);
    const blob = file.getBlob();
    Logger.log('✅ Fichier trouvé : "' + file.getName() + '" (' + blob.getBytes().length + ' octets)');
    MailApp.sendEmail({
      to: OWNER_EMAIL,
      subject: 'Test pièce jointe',
      htmlBody: '<p>Ceci est un test avec pièce jointe.</p>',
      attachments: [blob]
    });
    Logger.log('✅ Email de test envoyé avec la pièce jointe à ' + OWNER_EMAIL);
  } catch (err) {
    Logger.log('❌ ERREUR : ' + err.message);
  }
}

/**
 * Génère un devis d'exemple (numéro « TEST », compteur non modifié),
 * l'enregistre dans le dossier Drive des devis et l'envoie à OWNER_EMAIL.
 * Au premier lancement, Google demande l'autorisation d'accéder à Drive :
 * elle est indispensable pour ranger les copies des devis.
 */
function testDevis() {
  const booking = {
    spaceId: 'salleCanele', dateString: '2026-10-01', endDateString: '2026-10-02',
    startHour: START_HOUR, endHour: END_HOUR, numberOfDays: 2, spaceQuantity: 1,
    numberOfPeople: 12, wantsBreakfast: true, wantsLunch: true, parkingQuantity: 2,
    firstName: 'Jean', lastName: 'Dupont', company: 'Entreprise Exemple'
  };
  const pdf = buildQuotePdf(findSpace(booking.spaceId), booking, DEVIS.numberPrefix + 'TEST');
  const folder = getQuoteFolder();
  folder.createFile(pdf);
  Logger.log('✅ Devis de test enregistré dans Drive : ' + folder.getUrl());
  MailApp.sendEmail({ to: OWNER_EMAIL, subject: 'Test devis', htmlBody: '<p>Devis d\'exemple en pièce jointe.</p>', attachments: [pdf] });
  Logger.log('✅ Devis de test envoyé à ' + OWNER_EMAIL);
}

/**
 * Mesure le temps de lecture des disponibilités du mois en cours, espace par espace,
 * SANS le cache (comme pour le premier visiteur). Indique aussi la méthode utilisée.
 */
function testPerformance() {
  const now = new Date();
  Logger.log(typeof Calendar !== 'undefined'
    ? '✅ Service avancé « Google Calendar API » activé (lecture rapide)'
    : '⚠️ Service avancé « Google Calendar API » NON activé (lecture lente, voir README)');
  let total = 0;
  SPACES.forEach(space => {
    const t0 = Date.now();
    getMonthAvailability(space, now.getFullYear(), now.getMonth() + 1);
    const ms = Date.now() - t0;
    total += ms;
    Logger.log(space.name + ' : ' + ms + ' ms');
  });
  Logger.log('TOTAL pour le mois : ' + total + ' ms');
}

