// ==================== ACCUEIL VISITEURS ====================
// Page publique https://cosme75-85.github.io/Hiptown-Accueil-1/ : le visiteur clique sur la case
// d'une entreprise (Firestore accueil/{companyId}), tape son nom, et l'entreprise est prévenue
// par email à l'adresse de accueilEmails/{companyId}. Cette adresse n'est jamais publique :
// elle est lue ici avec le compte de service (FIREBASE_SERVICE_ACCOUNT, voir Messagerie.gs).
// Sans adresse, c'est l'équipe Hiptown de la ville qui est prévenue.
// La case Hiptown de la page (contacts de l'équipe) passe aussi par ici : la page envoie
// seulement l'identifiant du contact, l'adresse est dans ACCUEIL_TEAM_CONTACTS.

const ACCUEIL_CITY = 'bordeaux';            // ville par défaut d'une case sans ville (l'équipe de la ville de la case
                                            // est prévenue quand l'entreprise n'a pas mis d'adresse)
const ACCUEIL_MAX_PER_COMPANY = 20;         // visites notifiées au plus par entreprise...
const ACCUEIL_MAX_TOTAL = 150;              // ...et pour toute la page...
const ACCUEIL_WINDOW_SECONDS = 60 * 60;     // ...sur une heure (protection contre l'envoi en rafale)
const ACCUEIL_MAX_PIN_FAILURES = 10;        // codes d'accès faux par entreprise et par heure, ensuite bloqué

// Contacts de la case Hiptown (identifiants : champ id des contacts dans config.js de Hiptown-Accueil-1)
const ACCUEIL_TEAM_CONTACTS = {
  'anne-lise': { name: 'Anne-Lise Médalin', email: 'alm@hiptown.com' },
  'come':      { name: 'Côme Chabridon',    email: 'cc@hiptown.com' }
};

/**
 * Point d'entrée (doPost, action notifyVisitor), appelé sans connexion :
 * payload = { companyId, personId?, pin?, visitor, message } (case du portail ; personId : personne d'une
 *           case ajoutée à la main, ou uid d'un collaborateur affiché ; pin : code d'accès si la case en demande un)
 *        ou { contactId, visitor, message } (contact de la case Hiptown)
 */
function notifyVisitor(raw) {
  try {
    raw = raw || {};
    if (raw.contactId) return notifyTeamContact(raw);
    const companyId = String(raw.companyId || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(companyId)) return { success: false, message: 'Entreprise inconnue.' };
    const visitor = cleanText(raw.visitor, 80);
    if (!visitor) return { success: false, message: 'Merci d\'indiquer votre nom.' };
    const note = cleanText(raw.message, 300);

    const cache = CacheService.getScriptCache();
    const companyKey = 'accueil:' + companyId;
    const companyCount = Number(cache.get(companyKey)) || 0;
    const totalCount = Number(cache.get('accueil:total')) || 0;
    if (companyCount >= ACCUEIL_MAX_PER_COMPANY || totalCount >= ACCUEIL_MAX_TOTAL) {
      return { success: false, message: 'Trop de visites signalées, merci de patienter un moment.' };
    }

    const token = serviceAccountToken();
    if (!token) return { success: false, message: 'Envoi indisponible pour le moment.' };
    const card = readAdminDoc(token, 'accueil/' + companyId);
    // Entreprise du portail qui n'a pas choisi d'apparaître sur la page
    if (!isShownCard(card)) return { success: false, message: 'Entreprise inconnue.' };
    const mail = readAdminDoc(token, 'accueilEmails/' + companyId) || {};
    if (!pinAccepted(companyId, card, mail, raw.pin)) return { success: false, message: 'Code d\'accès incorrect.' };
    // Personne de la case : son adresse, sinon celle de l'entreprise
    const personId = String(raw.personId || '');
    if (personId && !/^[A-Za-z0-9_-]{1,40}$/.test(personId)) return { success: false, message: 'Contact inconnu.' };
    const person = personId ? findCardPerson(token, companyId, card, mail, personId) : null;
    if (personId && !person) return { success: false, message: 'Contact inconnu.' };
    const personEmail = person ? person.email : '';
    const email = personEmail || normalizeEmail(mail.email);

    cache.put(companyKey, String(companyCount + 1), ACCUEIL_WINDOW_SECONDS);
    cache.put('accueil:total', String(totalCount + 1), ACCUEIL_WINDOW_SECONDS);

    const company = cleanText(card.name, 100);
    const personName = person ? cleanText(person.name, 80) : '';
    const forWho = personName ? escapeHtml(personName) + ' (' + escapeHtml(company) + ')' : escapeHtml(company);
    const text = note
      ? visitor + ' vous attend à l\'accueil. Message : « ' + note + ' »'
      : visitor + ' vous attend à l\'accueil.';
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      MailApp.sendEmail({
        to: email,
        subject: '🔔 ' + visitor + ' est arrivé(e) à l\'accueil Hiptown',
        htmlBody: '<p>Bonjour' + (personEmail ? ' ' + escapeHtml(personName.split(' ')[0]) : '') + ',</p>'
          + '<p>Un visiteur pour <b>' + forWho + '</b> vient de se présenter à l\'accueil Hiptown.</p>'
          + messageHtml(text)
          + '<p style="color:#64748b;font-size:12px;">Envoyé depuis l\'accueil visiteurs Hiptown. '
          + 'Pour changer l\'adresse qui reçoit ces messages : portail Hiptown > Mon profil > Ma case à l\'accueil visiteurs.</p>'
      });
    } else {
      MailApp.sendEmail({
        to: teamRecipients({ city: /^[a-z-]{1,40}$/.test(card.city || '') ? card.city : ACCUEIL_CITY }),
        subject: '🔔 Visiteur pour ' + (personName ? personName + ' (' + company + ')' : company) + ' à l\'accueil (pas d\'adresse renseignée)',
        htmlBody: '<p>Un visiteur pour <b>' + forWho + '</b> vient de se présenter à l\'accueil.</p>'
          + messageHtml(text)
          + '<p style="color:#64748b;font-size:12px;">Cette entreprise n\'a pas encore indiqué d\'adresse pour recevoir '
          + 'ses visites (portail > Mon profil > Ma case à l\'accueil visiteurs) : merci de la prévenir.</p>'
      });
    }
    return { success: true };
  } catch (err) {
    console.error('notifyVisitor', err);
    return { success: false, message: 'Envoi impossible pour le moment.' };
  }
}

/** Case affichée sur la page : ajoutée par l'équipe, ou entreprise du portail qui a choisi d'apparaître. */
function isShownCard(card) {
  return !!(card && card.name && (card.manual === true || card.visible === true));
}

/**
 * Code d'accès de la case : bon code, ou pas de code demandé. Au-delà de ACCUEIL_MAX_PIN_FAILURES
 * codes faux dans l'heure, la case refuse tout code (protection contre l'essai de tous les codes).
 */
function pinAccepted(companyId, card, mail, pin) {
  if (card.locked !== true) return true;
  const cache = CacheService.getScriptCache();
  const key = 'accueil:pinfail:' + companyId;
  const failures = Number(cache.get(key)) || 0;
  if (failures >= ACCUEIL_MAX_PIN_FAILURES) return false;
  if (/^[0-9]{4}$/.test(String(mail.pin || '')) && String(pin || '') === mail.pin) return true;
  cache.put(key, String(failures + 1), ACCUEIL_WINDOW_SECONDS);
  return false;
}

/**
 * Personne choisie par le visiteur : { name, email } ou null.
 *  - case ajoutée à la main : personne de card.people, adresse dans accueilEmails (people) ;
 *  - entreprise du portail : collaborateur affiché (accueilPeople/{uid}), adresse de son compte,
 *    tant qu'il est encore salarié de cette entreprise.
 */
function findCardPerson(token, companyId, card, mail, personId) {
  if (card.manual === true) {
    const person = (Array.isArray(card.people) ? card.people : []).filter(p => p && p.id === personId)[0];
    if (!person) return null;
    const people = mail.people || {};
    return {
      name: cleanText(person.name, 80),
      email: Object.prototype.hasOwnProperty.call(people, personId) ? normalizeEmail(people[personId]) : ''
    };
  }
  const line = readAdminDoc(token, 'accueilPeople/' + personId);
  if (!line || line.companyId !== companyId) return null;
  const user = readAdminDoc(token, 'users/' + personId);
  if (!user || user.companyId !== companyId || user.status !== 'approved') return null;
  return { name: cleanText(line.name, 80), email: normalizeEmail(user.email) };
}

/** Point d'entrée (doPost, action checkAccueilPin) : le visiteur a tapé le code d'accès d'une case. */
function checkAccueilPin(raw) {
  try {
    raw = raw || {};
    const companyId = String(raw.companyId || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(companyId)) return { success: false, message: 'Entreprise inconnue.' };
    const token = serviceAccountToken();
    if (!token) return { success: false, message: 'Vérification indisponible pour le moment.' };
    const card = readAdminDoc(token, 'accueil/' + companyId);
    if (!isShownCard(card)) return { success: false, message: 'Entreprise inconnue.' };
    const mail = readAdminDoc(token, 'accueilEmails/' + companyId) || {};
    return pinAccepted(companyId, card, mail, raw.pin) ? { success: true } : { success: false, message: 'Code d\'accès incorrect.' };
  } catch (err) {
    console.error('checkAccueilPin', err);
    return { success: false, message: 'Vérification impossible pour le moment.' };
  }
}

/** Visiteur pour un membre de l'équipe Hiptown (case Hiptown de la page). */
function notifyTeamContact(raw) {
  const contactId = String(raw.contactId || '');
  const contact = Object.prototype.hasOwnProperty.call(ACCUEIL_TEAM_CONTACTS, contactId) ? ACCUEIL_TEAM_CONTACTS[contactId] : null;
  if (!contact) return { success: false, message: 'Contact inconnu.' };
  const visitor = cleanText(raw.visitor, 80);
  if (!visitor) return { success: false, message: 'Merci d\'indiquer votre nom.' };
  const note = cleanText(raw.message, 300);

  const cache = CacheService.getScriptCache();
  const contactKey = 'accueil:team:' + contactId;
  const contactCount = Number(cache.get(contactKey)) || 0;
  const totalCount = Number(cache.get('accueil:total')) || 0;
  if (contactCount >= ACCUEIL_MAX_PER_COMPANY || totalCount >= ACCUEIL_MAX_TOTAL) {
    return { success: false, message: 'Trop de visites signalées, merci de patienter un moment.' };
  }
  cache.put(contactKey, String(contactCount + 1), ACCUEIL_WINDOW_SECONDS);
  cache.put('accueil:total', String(totalCount + 1), ACCUEIL_WINDOW_SECONDS);

  const text = note
    ? visitor + ' vous attend à l\'accueil. Message : « ' + note + ' »'
    : visitor + ' vous attend à l\'accueil.';
  MailApp.sendEmail({
    to: contact.email,
    subject: '🔔 ' + visitor + ' est arrivé(e) à l\'accueil Hiptown',
    htmlBody: '<p>Bonjour ' + escapeHtml(contact.name.split(' ')[0]) + ',</p>'
      + '<p>Un visiteur vient de se présenter pour vous à l\'accueil Hiptown.</p>'
      + messageHtml(text)
      + '<p style="color:#64748b;font-size:12px;">Envoyé depuis l\'accueil visiteurs Hiptown.</p>'
  });
  return { success: true };
}

/** Document Firestore lu avec le compte de service, ou null s'il n'existe pas. */
function readAdminDoc(token, path) {
  const res = UrlFetchApp.fetch(firestoreAdminUrl('/' + path), {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() !== 200) throw new Error('Firestore ' + res.getResponseCode());
  return firestoreFields(JSON.parse(res.getContentText()).fields);
}
