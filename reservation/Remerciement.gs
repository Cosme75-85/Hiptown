/**
 * EMAIL DE REMERCIEMENT — envoyé automatiquement THANKS.delayDays jours après
 * la fin de chaque réservation confirmée. Les textes se règlent dans Config.gs (THANKS).
 *
 * Mise en route (une seule fois) :
 * 1. Lancer testThankYouEmails : un exemple de chaque texte arrive sur OWNER_EMAIL.
 * 2. Lancer previewThankYouEmails : le journal liste les clients qui recevraient
 *    l'email aujourd'hui, SANS rien envoyer.
 * 3. Lancer installThanksTrigger : l'envoi quotidien est programmé.
 */

const FRENCH_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FRENCH_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Programme sendThankYouEmails chaque jour vers THANKS.sendHour. Relancer ne crée pas de doublon. */
function installThanksTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendThankYouEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendThankYouEmails').timeBased().everyDays(1).atHour(THANKS.sendHour).create();
  Logger.log('✅ Emails de remerciement programmés chaque jour vers ' + THANKS.sendHour + 'h.');
}

/** Arrête l'envoi automatique des emails de remerciement. */
function uninstallThanksTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendThankYouEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('⏹️ Emails de remerciement désactivés.');
}

function sendThankYouEmails() {
  processThankYouEmails(false);
}

/** Journal des emails qui partiraient aujourd'hui, sans rien envoyer. */
function previewThankYouEmails() {
  processThankYouEmails(true);
}

/**
 * Remercie les clients dont la réservation confirmée s'est terminée il y a
 * exactement THANKS.delayDays jours. Chaque événement traité reçoit le tag
 * TAG_THANKS_SENT : un client n'est jamais remercié deux fois.
 */
function processThankYouEmails(dryRun) {
  // Calcul en jours de calendrier (et non en heures) : juste même aux changements d'heure
  const today = startOfToday();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - THANKS.delayDays);
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() - THANKS.delayDays + 1);
  let count = 0;

  SPACES.forEach(space => {
    const texts = THANKS.bySpace[space.id];
    if (!texts) return;
    try {
      const cal = CalendarApp.getCalendarById(space.calendarId);
      if (!cal) return;
      cal.getEvents(dayStart, dayEnd)
        .filter(ev => ev.getTitle().indexOf(CONFIRMED_PREFIX) === 0
          && ev.getEndTime() >= dayStart && ev.getEndTime() < dayEnd  // dernier jour de la réservation
          && !ev.getTag(TAG_THANKS_SENT))
        .forEach(ev => {
          const to = getRequesterEmail(ev);
          if (!to) return;
          const greeting = thanksGreeting(ev);
          const when = frenchDateRange(ev.getStartTime(), ev.getEndTime());
          count++;
          if (dryRun) {
            Logger.log('👀 ' + space.name + ' — ' + to + ' — « ' + greeting + ' » — ' + when);
            return;
          }
          sendThankYouEmail(to, greeting, texts, when);
          ev.setTag(TAG_THANKS_SENT, new Date().toISOString());
          Logger.log('✉️ ' + space.name + ' — remerciement envoyé à ' + to);
        });
    } catch (err) {
      Logger.log('❌ ' + space.name + ' — ERREUR : ' + err.message);
    }
  });
  Logger.log((dryRun ? 'Aperçu : ' : 'Envoyés : ') + count + ' email(s) de remerciement.');
}

/** « Bonjour Madame Dupont, », sinon « Bonjour Marie, » (anciennes demandes sans civilité). */
function thanksGreeting(event) {
  let booking = {};
  try {
    booking = JSON.parse(event.getTag(TAG_BOOKING) || '{}');
  } catch (err) {
    // Tag illisible : on se rabat sur le prénom
  }
  if (booking.civility && booking.lastName) return 'Bonjour ' + booking.civility + ' ' + booking.lastName + ',';
  const firstName = getRequesterFirstName(event);
  return firstName ? 'Bonjour ' + firstName + ',' : 'Bonjour,';
}

/** « le lundi 6 octobre 2026 », ou « du lundi 6 au mercredi 8 octobre 2026 ». */
function frenchDateRange(start, end) {
  const day = d => FRENCH_DAYS[d.getDay()] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate());
  const full = d => day(d) + ' ' + FRENCH_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  if (start.toDateString() === end.toDateString()) return 'le ' + full(start);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return 'du ' + day(start) + ' au ' + full(end);
  }
  return 'du ' + full(start) + ' au ' + full(end);
}

function sendThankYouEmail(to, greeting, texts, when) {
  const button =
    '<p style="text-align:center;margin:24px 0">' +
      '<a href="' + THANKS.reviewUrl + '" style="display:inline-block;padding:12px 22px;border-radius:8px;' +
      'background:#1E1847;color:#ffffff;font-weight:bold;text-decoration:none">' + THANKS.reviewButton + '</a>' +
    '</p>';

  MailApp.sendEmail({
    to: to,
    subject: texts.subject,
    htmlBody:
      '<p>' + escapeHtml(greeting) + '</p>' +
      '<p>' + texts.intro.replace('{date}', when) + '</p>' +
      '<p>Nous serions ravis de connaître votre opinion sur :</p>' +
      '<ul>' + texts.topics.map(t => '<li>' + t + '</li>').join('') + '</ul>' +
      '<p>' + THANKS.reviewText + '</p>' +
      button +
      THANKS.closing.map(p => '<p>' + p + '</p>').join('') +
      '<p>' + THANKS.signOff + ',<br>L\'équipe Hiptown</p>'
  });
}

/** Envoie un exemple de chaque texte à OWNER_EMAIL (aucun client n'est contacté). */
function testThankYouEmails() {
  const start = setTime(startOfToday(), 9);
  const end = setTime(startOfToday(), 12);
  Object.keys(THANKS.bySpace).forEach(id => {
    const texts = THANKS.bySpace[id];
    sendThankYouEmail(OWNER_EMAIL, 'Bonjour Madame Dupont,',
      Object.assign({}, texts, { subject: '[TEST] ' + texts.subject }), frenchDateRange(start, end));
  });
  Logger.log('✅ ' + Object.keys(THANKS.bySpace).length + ' exemples envoyés à ' + OWNER_EMAIL);
}
