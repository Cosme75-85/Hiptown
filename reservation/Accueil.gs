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

// Contacts de la case Hiptown (identifiants : champ id des contacts dans config.js de Hiptown-Accueil-1)
const ACCUEIL_TEAM_CONTACTS = {
  'anne-lise': { name: 'Anne-Lise Médalin', email: 'alm@hiptown.com' },
  'come':      { name: 'Côme Chabridon',    email: 'cc@hiptown.com' }
};

/**
 * Point d'entrée (doPost, action notifyVisitor), appelé sans connexion :
 * payload = { companyId, personId?, visitor, message } (case du portail, personne facultative)
 *        ou { contactId, visitor, message } (contact de la case Hiptown)
 *        ou { companyName, contactName, city, visitor, message } (case écrite à la main dans config.js
 *           de la page, sans adresse : l'équipe Hiptown de la ville est prévenue).
 */
function notifyVisitor(raw) {
  try {
    raw = raw || {};
    if (raw.contactId) return notifyTeamContact(raw);
    if (!raw.companyId && raw.companyName) return notifyPageCompany(raw);
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
    if (!card || !card.name) return { success: false, message: 'Entreprise inconnue.' };
    const mail = readAdminDoc(token, 'accueilEmails/' + companyId) || {};
    // Personne de la case : son adresse, sinon celle de l'entreprise
    const personId = String(raw.personId || '');
    if (personId && !/^[A-Za-z0-9_-]{1,40}$/.test(personId)) return { success: false, message: 'Contact inconnu.' };
    const person = personId && Array.isArray(card.people)
      ? card.people.filter(p => p && p.id === personId)[0] || null : null;
    if (personId && !person) return { success: false, message: 'Contact inconnu.' };
    const personEmail = person && mail.people && Object.prototype.hasOwnProperty.call(mail.people, personId)
      ? normalizeEmail(mail.people[personId]) : '';
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

/** Visiteur pour une entreprise écrite à la main dans la page (pas encore sur le portail). */
function notifyPageCompany(raw) {
  const company = cleanText(raw.companyName, 100);
  const contact = cleanText(raw.contactName, 80);
  const city = /^[a-z-]{1,40}$/.test(raw.city || '') ? raw.city : ACCUEIL_CITY;
  const visitor = cleanText(raw.visitor, 80);
  if (!company) return { success: false, message: 'Entreprise inconnue.' };
  if (!visitor) return { success: false, message: 'Merci d\'indiquer votre nom.' };
  const note = cleanText(raw.message, 300);

  const cache = CacheService.getScriptCache();
  const companyKey = 'accueil:page:' + company.toLowerCase().slice(0, 100);
  const companyCount = Number(cache.get(companyKey)) || 0;
  const totalCount = Number(cache.get('accueil:total')) || 0;
  if (companyCount >= ACCUEIL_MAX_PER_COMPANY || totalCount >= ACCUEIL_MAX_TOTAL) {
    return { success: false, message: 'Trop de visites signalées, merci de patienter un moment.' };
  }
  cache.put(companyKey, String(companyCount + 1), ACCUEIL_WINDOW_SECONDS);
  cache.put('accueil:total', String(totalCount + 1), ACCUEIL_WINDOW_SECONDS);

  const forWho = contact ? escapeHtml(contact) + ' (' + escapeHtml(company) + ')' : escapeHtml(company);
  const text = note
    ? visitor + ' attend à l\'accueil. Message : « ' + note + ' »'
    : visitor + ' attend à l\'accueil.';
  MailApp.sendEmail({
    to: teamRecipients({ city: city }),
    subject: '🔔 Visiteur pour ' + (contact ? contact + ' (' + company + ')' : company) + ' à l\'accueil',
    htmlBody: '<p>Un visiteur pour <b>' + forWho + '</b> vient de se présenter à l\'accueil.</p>'
      + messageHtml(text)
      + '<p style="color:#64748b;font-size:12px;">Cette entreprise n\'a pas encore sa case sur le portail : '
      + 'merci de la prévenir.</p>'
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
