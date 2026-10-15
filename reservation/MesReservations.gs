/**
 * MES PROCHAINES RÉSERVATIONS — MesReservations.gs
 * -------------------------------------------------
 * Liste, sur le tableau de bord du portail, toutes les réservations à venir de la
 * personne connectée, quel que soit l'outil qui a servi à réserver :
 *   - demandes faites avec l'outil de réservation des salles (en attente ou confirmées),
 *     retrouvées grâce à l'email du demandeur enregistré dans l'événement ;
 *   - réservations coworking faites depuis le portail : liste propre à chaque compte,
 *     tenue à jour au moment de la réservation, de la modification ou de l'annulation
 *     (rememberCoworkingEvent / forgetCoworkingEvent), sans recherche dans les agendas.
 * Rien n'est modifié dans les agendas.
 */

/**
 * Réservations du compte connecté, dans tous les espaces : celles du mois en cours,
 * passées comprises (elles restent jusqu'à la remise à zéro des crédits le mois
 * suivant, past: true), puis celles des 12 prochains mois.
 */
function getMyUpcomingBookings(idToken) {
  let account;
  try {
    account = getPortalAccount(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const to = new Date(now.getTime() + 366 * DAY_MS);
  const bookings = [];

  // Coworker (ou équipe) qui a déjà réservé depuis le portail : sa liste enregistrée
  const records = readCoworkingRecords(account.uid);
  if (records) {
    records.forEach(r => {
      const space = findSpace(r.spaceId);
      if (!space || r.end <= monthStart.getTime()) return;
      const view = coworkingBookingView(space, r, false);
      bookings.push({
        kind: 'coworking',
        status: 'confirmed',
        editable: r.start > now.getTime(), // modifiable ou annulable jusqu'à son début
        past: r.end <= now.getTime(),
        spaceId: view.spaceId,
        spaceName: view.spaceName,
        color: view.color,
        address: view.address,
        eventId: view.eventId,
        title: view.title || 'Réservation',
        start: view.start,
        end: view.end,
        dateString: view.dateString,
        endDateString: view.endDateString,
        startHour: view.startHour,
        endHour: view.endHour,
        numberOfPeople: view.numberOfPeople,
        total: ''
      });
    });
    return { success: true, bookings: bookings, contactEmail: OWNER_EMAIL };
  }

  // Sinon (clients salle de réunion) : demandes retrouvées dans les agendas par l'email du compte
  try {
    getAllSpaces().forEach(space => {
      listMyEvents(space, account, monthStart, to).forEach(ev => {
        const b = bookingFromEvent(space, ev, monthStart);
        if (!b || b.status === 'other') return; // événement retouché à la main : on ne devine pas son statut
        // Modifiable depuis la tuile « Réserver une salle de réunion » (coworking, même compte)
        b.editable = b.kind === 'coworking' && ev.portalUid === account.uid && ev.start > now;
        b.past = ev.end <= now;
        bookings.push(b);
      });
    });
  } catch (err) {
    return { success: false, message: 'Impossible de lire vos réservations : ' + err.message };
  }
  bookings.sort((a, b) => a.start - b.start);
  return { success: true, bookings: bookings, contactEmail: OWNER_EMAIL };
}

/**
 * Agenda de l'équipe Hiptown : toutes les réunions à venir de toutes les salles
 * (demandes en attente, confirmées, coworking et événements ajoutés à la main),
 * sur les 3 prochains mois. Réservé aux comptes Hiptown (admin).
 */
function getAllUpcomingBookings(idToken) {
  try {
    getAdminProfile(idToken); // lève « Réservé à l'équipe Hiptown » sinon
  } catch (err) {
    return { success: false, message: err.message };
  }
  const now = new Date();
  const to = new Date(now.getTime() + 92 * DAY_MS);
  const bookings = [];
  try {
    getAllSpaces().forEach(space => {
      listAllEvents(space, now, to).forEach(ev => {
        const b = bookingFromEvent(space, ev, now);
        if (!b) return;
        b.requestedBy = (ev.description.match(/Demandé par : (.+)/) || [])[1] || '';
        bookings.push(b);
      });
    });
  } catch (err) {
    return { success: false, message: 'Impossible de lire les agendas : ' + err.message };
  }
  bookings.sort((a, b) => a.start - b.start);
  return { success: true, bookings: bookings };
}

/**
 * Réservation telle qu'affichée par le portail, à partir d'un événement d'agenda.
 * null si elle s'est terminée avant « now » (début du mois pour la liste du client). status : confirmed, pending, ou other (titre sans
 * préfixe connu, ex. événement saisi directement dans Google Agenda).
 */
function bookingFromEvent(space, ev, now) {
  if (ev.end <= now) return null;
  const isCoworking = ev.title.indexOf(COWORKING.titlePrefix) === 0;
  let status = 'other';
  let title = ev.title;
  if (isCoworking) {
    status = 'confirmed';
    title = ev.title.slice(COWORKING.titlePrefix.length);
  } else if (ev.title.indexOf(CONFIRMED_PREFIX) === 0) {
    status = 'confirmed';
    title = ev.title.slice(CONFIRMED_PREFIX.length);
  } else if (ev.title.indexOf(PENDING_PREFIX) === 0) {
    status = 'pending';
    title = ev.title.slice(PENDING_PREFIX.length);
  }
  const slot = eventSlot(ev.start, ev.end);
  const people = (ev.description.match(/Nombre de personnes : (\d+)/) || [])[1];
  const total = (ev.description.match(/Total estimé : ([\d.,]+ €HT)/) || [])[1];
  return {
    kind: isCoworking ? 'coworking' : 'room',
    status: status,
    editable: false,
    spaceId: space.id,
    spaceName: space.name,
    color: space.color,
    address: COWORKING.address || '',
    eventId: ev.id,
    title: title || 'Réservation',
    start: ev.start.getTime(),
    end: ev.end.getTime(),
    dateString: slot.dateString,
    endDateString: slot.isMultiDay ? slot.endDateString : null,
    startHour: slot.startHour,
    endHour: slot.endHour,
    numberOfPeople: people ? Number(people) : null,
    total: total || ''
  };
}

/** Tous les événements d'un espace entre deux dates : { id, title, start, end, description }. */
function listAllEvents(space, from, to) {
  if (typeof Calendar !== 'undefined') {
    const out = [];
    let pageToken;
    do {
      const page = Calendar.Events.list(space.calendarId, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        maxResults: 250,
        pageToken: pageToken,
        fields: 'nextPageToken,items(iCalUID,summary,start,end,description)'
      });
      (page.items || []).forEach(ev => {
        out.push({
          id: ev.iCalUID,
          title: ev.summary || '',
          start: new Date(apiEventTime(ev.start)),
          end: new Date(apiEventTime(ev.end)),
          description: ev.description || ''
        });
      });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }
  const cal = CalendarApp.getCalendarById(space.calendarId);
  if (!cal) return [];
  return cal.getEvents(from, to).map(ev => ({
    id: ev.getId(),
    title: ev.getTitle(),
    start: ev.getStartTime(),
    end: ev.getEndTime(),
    description: ev.getDescription() || ''
  }));
}

/**
 * Réservations d'un espace faites par ce compte : par l'email (demandes de salle, coworking),
 * et pour les salles coworking aussi par le compte du portail (tag portalUid), au cas où
 * l'email enregistré dans l'événement diffère de celui du compte. Sans doublon.
 */
function listMyEvents(space, account, from, to) {
  const byId = {};
  listEventsByEmail(space, account.email, from, to).forEach(ev => { byId[ev.id] = ev; });
  if (space.coworking) {
    listOwnEvents(space, account.uid, from, to).forEach(ev => {
      if (!byId[ev.id]) byId[ev.id] = Object.assign({}, ev, { portalUid: account.uid });
    });
  }
  return Object.keys(byId).map(id => byId[id]);
}

/**
 * Événements d'un espace dont le tag requesterEmail est cet email :
 * { id, title, start, end, description, portalUid }.
 * Voie rapide avec le service avancé Calendar (filtre fait par Google), sinon CalendarApp.
 */
function listEventsByEmail(space, email, from, to) {
  if (typeof Calendar !== 'undefined') {
    const out = [];
    let pageToken;
    do {
      const page = Calendar.Events.list(space.calendarId, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        maxResults: 250,
        privateExtendedProperty: TAG_EMAIL + '=' + email,
        pageToken: pageToken,
        fields: 'nextPageToken,items(iCalUID,summary,start,end,description,extendedProperties/private)'
      });
      (page.items || []).forEach(ev => {
        const tags = (ev.extendedProperties && ev.extendedProperties.private) || {};
        if (String(tags[TAG_EMAIL] || '').toLowerCase() !== email) return;
        out.push({
          id: ev.iCalUID,
          title: ev.summary || '',
          start: new Date(apiEventTime(ev.start)),
          end: new Date(apiEventTime(ev.end)),
          description: ev.description || '',
          portalUid: tags[TAG_PORTAL_UID] || ''
        });
      });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  const cal = CalendarApp.getCalendarById(space.calendarId);
  if (!cal) return [];
  return cal.getEvents(from, to)
    .filter(ev => String(ev.getTag(TAG_EMAIL) || '').toLowerCase() === email)
    .map(ev => ({
      id: ev.getId(),
      title: ev.getTitle(),
      start: ev.getStartTime(),
      end: ev.getEndTime(),
      description: ev.getDescription() || '',
      portalUid: ev.getTag(TAG_PORTAL_UID) || ''
    }));
}

/**
 * Compte du portail à qui appartient le jeton : { uid, email }, quel que soit son rôle
 * (client salle de réunion, coworker, équipe), à condition qu'il soit validé.
 * L'email vient du jeton de connexion lui-même (pas de la fiche, modifiable) : on ne
 * voit que les réservations faites avec l'adresse de son propre compte.
 */
function getPortalAccount(idToken) {
  const uid = tokenUid(idToken);
  if (!uid) throw new Error('Session expirée, merci de vous reconnecter au portail.');
  // Lire sa fiche avec le jeton prouve qu'il est authentique (Firestore vérifie sa signature)
  const profile = readFirestoreDoc('users/' + encodeURIComponent(uid), idToken);
  if (!profile || profile.status !== 'approved') {
    throw new Error('Votre compte n\'est pas encore validé par l\'équipe Hiptown.');
  }
  const email = tokenEmail(idToken);
  if (!email) throw new Error('Adresse email manquante sur votre compte. Contactez l\'équipe Hiptown.');
  return { uid: uid, email: email };
}

/** Email écrit dans le jeton (vérifié par Firestore dans getPortalAccount), en minuscules. */
function tokenEmail(idToken) {
  try {
    const part = idToken.split('.')[1];
    const padded = part + '==='.slice((part.length + 3) % 4);
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString());
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_TEXT_LENGTH ? email : '';
  } catch (err) {
    return '';
  }
}

// ==================== LISTE « MES RÉSERVATIONS » DES COWORKERS ====================
// Une liste par compte du portail, enregistrée dans les propriétés du script :
// la réservation y entre dès qu'elle est faite, y suit ses modifications et en sort
// à son annulation (ou le mois suivant une fois passée). Rangée par date.

const MY_BOOKINGS_KEY_PREFIX = 'mesReservations_';
const MY_BOOKINGS_MAX_SIZE = 8500; // une propriété du script contient au plus 9 ko

/** Liste enregistrée du compte, ou null s'il n'en a pas encore. */
function readCoworkingRecords(uid) {
  const raw = PropertiesService.getScriptProperties().getProperty(MY_BOOKINGS_KEY_PREFIX + uid);
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch (err) {
    return null;
  }
}

/**
 * Liste du compte. La toute première fois, elle est reprise des agendas
 * (réservations faites avant que la liste existe), puis enregistrée.
 */
function myCoworkingRecords(uid) {
  const stored = readCoworkingRecords(uid);
  if (stored) return stored;
  const from = startOfMonth(new Date());
  const to = new Date(Date.now() + 366 * DAY_MS);
  const list = [];
  getCoworkingSpaceList().forEach(space => {
    listOwnEvents(space, uid, from, to).forEach(ev => {
      if (ev.title.indexOf(COWORKING.titlePrefix) === 0) list.push(coworkingRecord(space, ev));
    });
  });
  return writeCoworkingRecords(uid, list);
}

/**
 * Enregistre la liste par date, sans les réservations terminées avant ce mois-ci
 * (celles du mois restent jusqu'à la remise à zéro des crédits) ; la plus lointaine
 * part si c'est trop long.
 */
function writeCoworkingRecords(uid, list) {
  const monthStart = startOfMonth(new Date()).getTime();
  const kept = list.filter(r => r && r.end > monthStart).sort((a, b) => a.start - b.start);
  let json = JSON.stringify(kept);
  while (json.length > MY_BOOKINGS_MAX_SIZE && kept.length) {
    Logger.log('⚠️ Liste « Mes réservations » trop longue pour ' + uid + ' : réservation du '
      + new Date(kept[kept.length - 1].start) + ' non affichée.');
    kept.pop();
    json = JSON.stringify(kept);
  }
  PropertiesService.getScriptProperties().setProperty(MY_BOOKINGS_KEY_PREFIX + uid, json);
  return kept;
}

/** Ajoute (ou met à jour) une réservation coworking dans la liste du compte. Ne bloque jamais la réservation. */
function rememberCoworkingEvent(uid, space, event) {
  try {
    const record = coworkingRecord(space, ownEventFromCalendarEvent(event));
    const list = myCoworkingRecords(uid).filter(r => r.eventId !== record.eventId);
    list.push(record);
    writeCoworkingRecords(uid, list);
  } catch (err) {
    Logger.log('⚠️ « Mes réservations » non mise à jour pour ' + uid + ' : ' + err.message);
  }
}

/** Retire une réservation annulée de la liste du compte. */
function forgetCoworkingEvent(uid, eventId) {
  try {
    const list = readCoworkingRecords(uid);
    if (list) writeCoworkingRecords(uid, list.filter(r => r.eventId !== eventId));
  } catch (err) {
    Logger.log('⚠️ « Mes réservations » non mise à jour pour ' + uid + ' : ' + err.message);
  }
}

/** Premier jour du mois de cette date, à minuit. */
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
