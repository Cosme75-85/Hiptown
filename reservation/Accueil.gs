// ==================== ACCUEIL VISITEURS ====================
// Page publique https://cosme75-85.github.io/Hiptown-Accueil-1/ : le visiteur clique sur la case
// d'une entreprise (Firestore accueil/{companyId}), tape son nom, et l'entreprise est prévenue
// par email à l'adresse de accueilEmails/{companyId}. Cette adresse n'est jamais publique :
// elle est lue ici avec le compte de service (FIREBASE_SERVICE_ACCOUNT, voir Messagerie.gs).
// Sans adresse, c'est l'équipe Hiptown de la ville qui est prévenue.
// Pour une entreprise du portail, ses coworkers sont aussi prévenus dans le portail (et un contact de la
// case Hiptown sur son compte de l'équipe) : bandeau en haut du portail (accueilVisits, accueil-visites.js)
// et notification sur les appareils qui l'acceptent.
// La case Hiptown de la page (contacts de l'équipe) passe aussi par ici : la page envoie
// seulement l'identifiant du contact, l'adresse est dans ACCUEIL_TEAM_CONTACTS.

const ACCUEIL_CITY = 'bordeaux';            // ville par défaut d'une case sans ville (l'équipe de la ville de la case
                                            // est prévenue quand l'entreprise n'a pas mis d'adresse)
const ACCUEIL_MAX_PER_COMPANY = 20;         // visites notifiées au plus par entreprise...
const ACCUEIL_MAX_TOTAL = 150;              // ...et pour toute la page...
const ACCUEIL_WINDOW_SECONDS = 60 * 60;     // ...sur une heure (protection contre l'envoi en rafale)
const ACCUEIL_MAX_PIN_FAILURES = 10;        // codes d'accès faux par entreprise et par heure, ensuite bloqué
const ACCUEIL_SENDER_NAME = 'Hiptown Accueil'; // nom d'expéditeur des e-mails de visite
// Logo de l'e-mail (hébergé avec la page d'accueil : les images intégrées sont bloquées par Gmail)
const ACCUEIL_LOGO_URL = 'https://cosme75-85.github.io/Hiptown-Accueil-1/Logo%20Hiptown%20site.png';

// Contacts de la case Hiptown (identifiants : champ id des contacts dans config.js de Hiptown-Accueil-1)
const ACCUEIL_TEAM_CONTACTS = {
  'anne-lise': { name: 'Anne-Lise Médalin', email: 'alm@hiptown.com' },
  'come':      { name: 'Côme Chabridon',    email: 'cc@hiptown.com' },
  'benedicte': { name: 'Bénédicte Yeznikian', email: 'by@hiptown.com' } // Marseille
};

/**
 * Point d'entrée (doPost, action notifyVisitor), appelé sans connexion :
 * payload = { companyId, personId?, pin?, visitor, message } (case du portail ; personId : personne de la
 *           case ; pin : code d'accès si la case en demande un)
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
    const person = personId ? findCardPerson(card, mail, personId) : null;
    if (personId && !person) return { success: false, message: 'Contact inconnu.' };
    const personEmail = person ? person.email : '';
    const email = personEmail || normalizeEmail(mail.email);

    cache.put(companyKey, String(companyCount + 1), ACCUEIL_WINDOW_SECONDS);
    cache.put('accueil:total', String(totalCount + 1), ACCUEIL_WINDOW_SECONDS);

    const company = cleanText(card.name, 100);
    const personName = person ? cleanText(person.name, 80) : '';
    const forWho = personName ? personName + ' · ' + company : company;
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      MailApp.sendEmail({
        to: email,
        name: ACCUEIL_SENDER_NAME,
        subject: '🔔 ' + visitor + ' vous attend à l\'accueil Hiptown',
        htmlBody: accueilEmailHtml({
          greeting: personEmail ? 'Bonjour ' + personName.split(' ')[0] + ',' : 'Bonjour,',
          visitor: visitor, forWho: forWho, note: note,
          footer: card.manual === true
            ? 'Pour changer l\'adresse qui reçoit ces messages, contactez l\'équipe Hiptown.'
            : 'Pour changer l\'adresse qui reçoit ces messages : portail Hiptown > Mon profil > Accueil visiteurs.'
        })
      });
    } else {
      MailApp.sendEmail({
        to: teamRecipients({ city: /^[a-z-]{1,40}$/.test(card.city || '') ? card.city : ACCUEIL_CITY }),
        name: ACCUEIL_SENDER_NAME,
        subject: '🔔 Visiteur pour ' + forWho + ' à l\'accueil (pas d\'adresse renseignée)',
        htmlBody: accueilEmailHtml({
          greeting: 'Bonjour l\'équipe,',
          visitor: visitor, forWho: forWho, note: note,
          footer: 'Cette entreprise n\'a pas encore indiqué d\'adresse pour recevoir ses visites : merci de la prévenir.'
        })
      });
    }
    pushSafely(() => notifyPortalVisit(token, companyId, card, person, visitor, note));
    return { success: true };
  } catch (err) {
    console.error('notifyVisitor', err);
    return { success: false, message: 'Envoi impossible pour le moment.' };
  }
}

/**
 * Visite annoncée dans le portail (entreprise du portail seulement) : la personne demandée si elle
 * a un compte avec cette adresse, sinon tous les coworkers de l'entreprise.
 */
function notifyPortalVisit(token, companyId, card, person, visitor, note) {
  if (card.manual === true) return;
  const members = usersWhere(token, 'companyId', companyId).filter(u => u.role === 'coworking');
  const asked = person && person.email ? members.filter(u => normalizeEmail(u.email) === person.email) : [];
  const uids = (asked.length ? asked : members).map(u => u.uid).slice(0, 30);
  announceVisit(token, uids, companyId, person ? person.name : '', visitor, note);
}

/** Bandeau (accueilVisits) et notification sur les appareils des comptes uids. */
function announceVisit(token, uids, companyId, forWho, visitor, note) {
  if (!uids.length) return;
  const now = new Date();
  const today = Utilities.formatDate(now, 'Europe/Paris', 'yyyy-MM-dd');
  firestoreAdmin(token, 'post', firestoreAdminUrl('/accueilVisits'), { fields: {
    uids: { arrayValue: { values: uids.map(uid => ({ stringValue: uid })) } },
    companyId: { stringValue: companyId },
    visitor: { stringValue: visitor },
    forWho: { stringValue: forWho },
    note: { stringValue: note },
    day: { stringValue: today }, // le bandeau n'affiche que les visites du jour
    createdAt: { timestampValue: now.toISOString() },
    seenBy: { arrayValue: {} }
  } });
  pushToUsers(uids, {
    title: '🔔 ' + visitor + ' vous attend à l\'accueil',
    body: note || (forWho ? 'Visite pour ' + forWho + '.' : 'Merci de venir l\'accueillir.'),
    tag: 'accueil-' + companyId,
    url: './'
  }, token);
  pushSafely(() => deleteOldVisits(token, today));
}

/** Efface les visites des jours passés (le portail lit toutes les visites d'un compte). */
function deleteOldVisits(token, today) {
  const rows = firestoreAdmin(token, 'post', firestoreAdminUrl(':runQuery'), {
    structuredQuery: {
      from: [{ collectionId: 'accueilVisits' }],
      where: { fieldFilter: { field: { fieldPath: 'day' }, op: 'LESS_THAN', value: { stringValue: today } } },
      limit: 100
    }
  });
  const names = rows.filter(r => r.document).map(r => r.document.name);
  if (names.length) firestoreAdmin(token, 'post', firestoreAdminUrl(':commit'), { writes: names.map(n => ({ delete: n })) });
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
 * Personne choisie par le visiteur : { name, email } ou null. Les personnes sont sur la case
 * (card.people, choisies par l'entreprise ou par l'équipe) et leurs adresses dans accueilEmails (people).
 */
function findCardPerson(card, mail, personId) {
  const person = (Array.isArray(card.people) ? card.people : []).filter(p => p && p.id === personId)[0];
  if (!person) return null;
  const people = mail.people || {};
  return {
    name: cleanText(person.name, 80),
    email: Object.prototype.hasOwnProperty.call(people, personId) ? normalizeEmail(people[personId]) : ''
  };
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

  MailApp.sendEmail({
    to: contact.email,
    name: ACCUEIL_SENDER_NAME,
    subject: '🔔 ' + visitor + ' vous attend à l\'accueil Hiptown',
    htmlBody: accueilEmailHtml({
      greeting: 'Bonjour ' + contact.name.split(' ')[0] + ',',
      visitor: visitor, forWho: contact.name + ' · Hiptown', note: note, footer: ''
    })
  });
  // Bandeau sur le portail du contact, s'il a un compte de l'équipe avec cette adresse
  pushSafely(() => {
    const token = serviceAccountToken();
    if (!token) return;
    const uids = usersWhere(token, 'role', 'admin')
      .filter(u => normalizeEmail(u.email) === contact.email).map(u => u.uid);
    announceVisit(token, uids, 'hiptown', contact.name, visitor, note);
  });
  return { success: true };
}

/**
 * E-mail de visite aux couleurs Hiptown (bleu nuit #1e1847, jaune #ffe700), en tableaux et
 * styles en ligne pour s'afficher pareil dans Gmail, Outlook et sur téléphone. Textes échappés ici.
 * @param {{greeting: string, visitor: string, forWho: string, note: string, footer: string}} o
 */
function accueilEmailHtml(o) {
  const time = Utilities.formatDate(new Date(), 'Europe/Paris', "HH'h'mm");
  const font = 'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;';
  const note = o.note
    ? '<tr><td style="padding:0 32px 8px;">'
      + '<div style="' + font + 'font-size:12px;font-weight:700;color:#1e1847;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Son message</div>'
      + '<div style="' + font + 'border-left:4px solid #ffe700;background:#f5f4ff;padding:12px 16px;border-radius:0 8px 8px 0;font-size:15px;color:#1e1847;line-height:1.5;">'
      + escapeHtml(o.note).replace(/\n/g, '<br>') + '</div></td></tr>'
    : '';
  const footer = o.footer
    ? '<div style="margin-top:6px;">' + escapeHtml(o.footer) + '</div>' : '';
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f3fb;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3fb;padding:24px 12px;"><tr><td align="center">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">'
    // En-tête : logo sur bleu nuit, liseré jaune
    + '<tr><td align="center" style="background:#1e1847;padding:22px 24px;">'
    + '<img src="' + ACCUEIL_LOGO_URL + '" alt="Hiptown" width="150" style="display:block;width:150px;max-width:60%;height:auto;border:0;">'
    + '</td></tr>'
    + '<tr><td style="background:#ffe700;height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>'
    // Annonce
    + '<tr><td style="padding:28px 32px 8px;' + font + 'color:#1e1847;">'
    + '<div style="font-size:15px;margin-bottom:18px;">' + escapeHtml(o.greeting) + '</div>'
    + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b6890;">🔔 Un visiteur vous attend à l\'accueil</div>'
    + '<div style="font-size:28px;font-weight:800;line-height:1.2;margin:8px 0 6px;">' + escapeHtml(o.visitor) + '</div>'
    + '<div style="font-size:15px;color:#4b4870;">pour <b style="color:#1e1847;">' + escapeHtml(o.forWho) + '</b></div>'
    + '<div style="display:inline-block;margin:16px 0 18px;background:#ffe700;color:#1e1847;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px;">Arrivé(e) à ' + time + '</div>'
    + '</td></tr>'
    + note
    + '<tr><td style="padding:12px 32px 28px;' + font + 'font-size:15px;color:#1e1847;line-height:1.5;">Merci de venir l\'accueillir dès que possible.</td></tr>'
    // Pied
    + '<tr><td style="background:#f5f4ff;padding:16px 32px;' + font + 'font-size:12px;color:#6b6890;line-height:1.5;">'
    + 'Envoyé par l\'accueil visiteurs Hiptown.' + footer
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
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
